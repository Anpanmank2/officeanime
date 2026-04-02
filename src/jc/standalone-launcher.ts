#!/usr/bin/env node
// ── Standalone Launcher — runs Office Anime without VS Code ─────

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startBrowserServer } from './browser-server.js';
import { createCommandDispatcher } from './command-dispatcher.js';
import { createMessageBridge } from './message-bridge.js';

const DEFAULT_PORT = 8432;

// ── Shared state (accessible from both watcher and webviewReady handler) ──
interface JCMemberEntry {
  id: string;
  hueShift: number;
  palette?: number;
  deskId: string;
}

const activeAgents = new Map<number, { sessionId: string; file: string; memberId?: string }>();
const assignedMembers = new Set<string>();
const agentMemberMap: Record<number, string> = {};
let jcMembers: JCMemberEntry[] = [];
let jcConfig: unknown = null;

/** Build messages to send when a browser client connects or signals ready */
function buildClientInitMessages(respond: (msg: unknown) => void): void {
  // 1. Config + settings
  if (jcConfig) {
    respond({ type: 'jcConfigLoaded', config: jcConfig });
    respond({
      type: 'settingsLoaded',
      soundEnabled: false,
      extensionVersion: '1.2.0',
      lastSeenVersion: '1.2',
    });
  }

  // 2. All current agents + their JC member arrivals
  for (const [agentId, agent] of activeAgents) {
    respond({ type: 'agentCreated', id: agentId });

    if (agent.memberId) {
      const member = jcMembers.find((m) => m.id === agent.memberId);
      if (member) {
        respond({
          type: 'jcMemberArriving',
          agentId,
          memberId: member.id,
          deskId: member.deskId,
          seatUid: member.deskId,
          hueShift: member.hueShift,
          palette: member.palette ?? 0,
        });
      }
    }
  }

  // 3. Mapping update (all at once)
  if (Object.keys(agentMemberMap).length > 0) {
    respond({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
  const shouldOpen = args.includes('--open');

  const extensionPath = path.resolve(__dirname, '..');

  // Verify dist/webview exists
  const webviewPath = path.join(extensionPath, 'dist', 'webview');
  if (!fs.existsSync(webviewPath)) {
    console.error('[JC] Error: dist/webview not found. Run "npm run build" first.');
    console.error(`[JC] Looked in: ${webviewPath}`);
    process.exit(1);
  }

  // Create command dispatcher (read-only mode)
  const dispatcher = createCommandDispatcher();
  dispatcher.setContext({
    getAgentIds: () => [...activeAgents.keys()],
  });

  // Create message bridge
  const bridge = createMessageBridge({
    onBrowserCommand: (data, respond) => dispatcher.dispatch(data, respond),
  });

  // Load JC config
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

  // Extract JC members for auto-mapping
  if (jcConfig) {
    const cfg = jcConfig as {
      members?: Array<{ id: string; hueShift: number; palette?: number; deskId: string }>;
    };
    if (cfg.members) {
      jcMembers = cfg.members.map((m) => ({
        id: m.id,
        hueShift: m.hueShift,
        palette: m.palette,
        deskId: m.deskId,
      }));
    }
  }

  // Start browser server
  const server = await startBrowserServer(extensionPath, port, (data, respond) => {
    const msg = data as { type?: string };

    // When browser signals ready, send ALL current state
    if (msg.type === 'webviewReady') {
      buildClientInitMessages(respond);
      return;
    }

    // Forward other commands to dispatcher
    dispatcher.dispatch(data, respond);
  });

  console.log(`[JC] Standalone Office Anime server running`);
  console.log(`[JC] Open http://localhost:${port} in your browser`);
  console.log(`[JC] Mode: read-only (no terminal control)`);
  console.log(`[JC] Watching for Claude Code sessions...`);

  // Watch Claude Code project directories
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  if (fs.existsSync(claudeDir)) {
    startWatcher(claudeDir, server.broadcast);
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

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[JC] Shutting down...');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── JSONL Watcher ────────────────────────────────────────────────

let nextAgentId = 1;

function startWatcher(claudeDir: string, broadcast: (data: unknown) => void): void {
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

          // Skip already tracked
          const isTracked = [...activeAgents.values()].some((a) => a.file === filePath);
          if (isTracked) continue;

          // Only recent files (5 min)
          const fstat = fs.statSync(filePath);
          if (Date.now() - fstat.mtimeMs > 5 * 60 * 1000) continue;

          const agentId = nextAgentId++;
          const member = jcMembers.find((m) => !assignedMembers.has(m.id));

          activeAgents.set(agentId, { sessionId, file: filePath, memberId: member?.id });

          // Broadcast to already-connected clients (for agents detected after browser opens)
          broadcast({ type: 'agentCreated', id: agentId });

          if (member) {
            assignedMembers.add(member.id);
            agentMemberMap[agentId] = member.id;

            broadcast({
              type: 'jcMemberArriving',
              agentId,
              memberId: member.id,
              deskId: member.deskId,
              seatUid: member.deskId,
              hueShift: member.hueShift,
              palette: member.palette ?? 0,
            });

            broadcast({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });

            console.log(`[JC] Agent ${agentId} → ${member.id} (desk: ${member.deskId})`);
          } else {
            console.log(`[JC] Agent ${agentId} detected (no JC member available)`);
          }
        }
      }
    } catch {
      // Ignore scan errors
    }
  };

  scanProjects();
  setInterval(scanProjects, 5000);
}

main().catch((err) => {
  console.error('[JC] Fatal error:', err);
  process.exit(1);
});
