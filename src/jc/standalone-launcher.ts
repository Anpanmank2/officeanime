#!/usr/bin/env node
// ── Standalone Launcher — runs Office Anime without VS Code ─────

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startBrowserServer } from './browser-server.js';
import { createCommandDispatcher } from './command-dispatcher.js';
import { createMessageBridge } from './message-bridge.js';

const DEFAULT_PORT = 8432;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
  const shouldOpen = args.includes('--open');

  // Resolve asset path (dist/ should be in the package root)
  const extensionPath = path.resolve(__dirname, '..');

  // Verify dist/webview exists
  const webviewPath = path.join(extensionPath, 'dist', 'webview');
  if (!fs.existsSync(webviewPath)) {
    console.error('[JC] Error: dist/webview not found. Run "npm run build" first.');
    console.error(`[JC] Looked in: ${webviewPath}`);
    process.exit(1);
  }

  // Track active agents (declared before dispatcher so getAgentIds closure works)
  const activeAgents = new Map<number, { sessionId: string; file: string }>();

  // Create command dispatcher (read-only mode — no terminal control)
  const dispatcher = createCommandDispatcher();
  dispatcher.setContext({
    // No sendToTerminal — browser can view but not send instructions
    getAgentIds: () => [...activeAgents.keys()],
  });

  // Create message bridge
  const bridge = createMessageBridge({
    onBrowserCommand: (data, respond) => dispatcher.dispatch(data, respond),
  });

  // Load JC config (try extension root, then cwd)
  let jcConfig: unknown = null;
  for (const dir of [extensionPath, process.cwd()]) {
    const configPath = path.join(dir, 'jc-config.json');
    if (fs.existsSync(configPath)) {
      try {
        jcConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log(`[JC] Config loaded from ${configPath}`);
      } catch {
        console.warn(`[JC] Failed to parse ${configPath}`);
      }
      break;
    }
  }

  // Start browser server
  const initMessages = jcConfig
    ? [
        { type: 'jcConfigLoaded', config: jcConfig },
        {
          type: 'settingsLoaded',
          soundEnabled: false,
          extensionVersion: '1.2.0',
          lastSeenVersion: '1.2',
        },
      ]
    : [];

  const server = await startBrowserServer(extensionPath, port, (data, respond) => {
    const msg = data as { type?: string };
    // When browser signals ready, send JC config (WS replay fires before React mounts)
    if (msg.type === 'webviewReady') {
      for (const m of initMessages) {
        respond(m);
      }
      return;
    }
    bridge.handleWsMessage(null as any, JSON.stringify(data));
    void respond;
  });

  // Seed replay buffer with JC config so new browser connections get it
  if (jcConfig) {
    const initMessages = [
      { type: 'jcConfigLoaded', config: jcConfig },
      {
        type: 'settingsLoaded',
        soundEnabled: false,
        extensionVersion: '1.2.0',
        lastSeenVersion: '1.2',
      },
    ];
    bridge.seedReplayBuffer(initMessages);
    // Also send to already-connected clients
    for (const msg of initMessages) {
      server.broadcast(msg);
    }
  }

  console.log(`[JC] Standalone Office Anime server running`);
  console.log(`[JC] Open http://localhost:${port} in your browser`);
  console.log(`[JC] Mode: read-only (no terminal control)`);
  console.log(`[JC] Watching for Claude Code sessions...`);

  // Watch Claude Code project directories
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeDir)) {
    watchClaudeProjects(claudeDir, server.broadcast, bridge, activeAgents);
  } else {
    console.log(`[JC] Claude projects directory not found: ${claudeDir}`);
    console.log(`[JC] Will show empty office. Start Claude Code to see agents.`);
  }

  // Open browser if requested
  if (shouldOpen) {
    const { exec } = await import('child_process');
    const url = `http://localhost:${port}`;
    const cmd =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
          ? `start "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd);
  }

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[JC] Shutting down...');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

type AgentMap = Map<number, { sessionId: string; file: string }>;

function watchClaudeProjects(
  claudeDir: string,
  broadcast: (data: unknown) => void,
  _bridge: ReturnType<typeof createMessageBridge>,
  activeAgents: AgentMap,
): void {
  let nextAgentId = 1;

  // Scan for existing JSONL files
  const scanProjects = (): void => {
    try {
      const projects = fs.readdirSync(claudeDir);
      for (const project of projects) {
        const projectDir = path.join(claudeDir, project);
        const stat = fs.statSync(projectDir);
        if (!stat.isDirectory()) continue;

        const files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = path.join(projectDir, file);
          const sessionId = file.replace('.jsonl', '');

          // Check if already tracked
          const isTracked = [...activeAgents.values()].some((a) => a.file === filePath);
          if (isTracked) continue;

          // Check if recently modified (within last 5 minutes)
          const fstat = fs.statSync(filePath);
          const age = Date.now() - fstat.mtimeMs;
          if (age > 5 * 60 * 1000) continue;

          const agentId = nextAgentId++;
          activeAgents.set(agentId, { sessionId, file: filePath });

          broadcast({
            type: 'agentCreated',
            agent: { id: agentId, name: `Agent ${agentId}`, sessionId },
          });

          console.log(`[JC] Detected agent: ${sessionId} (id=${agentId})`);
        }
      }
    } catch {
      // Ignore scan errors
    }
  };

  // Initial scan
  scanProjects();

  // Re-scan periodically
  setInterval(scanProjects, 5000);
}

main().catch((err) => {
  console.error('[JC] Fatal error:', err);
  process.exit(1);
});
