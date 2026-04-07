#!/usr/bin/env node
// ── Standalone Launcher — runs Office Anime without VS Code ─────

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startBrowserServer } from './browser-server.js';
import { createCommandDispatcher } from './command-dispatcher.js';
import { EventWatcher } from './event-watcher.js';
import { createMessageBridge } from './message-bridge.js';
import { OfficeLogWriter } from './office-log-writer.js';
import { toolToJCState } from './state-machine.js';
import { TaskWatcher } from './task-watcher.js';
import type { JCConfig } from './types.js';

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
let taskWatcher: TaskWatcher | null = null;
const officeLogWriter = new OfficeLogWriter();

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

    // Auto-arrive permanent residents (Secretary, PM / Director)
    const permanentRoles = ['Secretary', 'PM / Director'];
    const cfg = jcConfig as {
      members?: Array<{
        id: string;
        role: string;
        hueShift: number;
        palette?: number;
        deskId: string;
      }>;
    };
    const permanentMembers = (cfg.members ?? []).filter((m) => permanentRoles.includes(m.role));
    permanentMembers.forEach((member, idx) => {
      respond({
        type: 'jcMemberArriving',
        agentId: -100 - idx,
        memberId: member.id,
        deskId: member.deskId,
        seatUid: member.deskId,
        hueShift: member.hueShift,
        palette: member.palette ?? 0,
      });
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

  // 4. Current task queue
  if (taskWatcher) {
    taskWatcher.syncToWebview();
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

  // Create TaskWatcher if config is available
  if (jcConfig) {
    const emptyAgents = new Map();

    // Resolve workspace root for claude CLI cwd (same logic as event watcher below)
    const wsArg = args.find((a) => a.startsWith('--workspace='));
    let claudeWorkspaceRoot = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();
    // If cwd is inside pixel-agents, use parent directory (cc-company)
    const parentDir = path.resolve(claudeWorkspaceRoot, '..');
    const parentCompanyDir = path.join(parentDir, '.company');
    if (fs.existsSync(parentCompanyDir)) {
      claudeWorkspaceRoot = parentDir;
    }

    // Launch Claude Code CLI as a child process for each task
    const spawnClaude = async (memberId: string, prompt: string, workDir?: string) => {
      const { spawn } = await import('child_process');
      const cwd = workDir ?? claudeWorkspaceRoot;
      const sessionId = crypto.randomUUID();

      console.log(
        `[JC TaskWatcher] Launching claude for ${memberId} (session: ${sessionId.slice(0, 8)})`,
      );
      console.log(`[JC TaskWatcher]   cwd: ${cwd}`);
      console.log(`[JC TaskWatcher]   prompt: ${prompt.slice(0, 80)}...`);

      const child = spawn('claude', ['--session-id', sessionId, '--print', '-p', prompt], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: false,
      });

      // Collect output to store as task result and broadcast
      let outputBuf = '';

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        outputBuf += text;
        if (text.trim()) console.log(`[JC ${memberId}] ${text.trim().slice(0, 200)}`);

        // Stream activity summary to office UI
        const summary = text.trim().slice(0, 100);
        if (summary) {
          server.broadcast({
            type: 'jcActivitySummary',
            agentId: -200,
            memberId,
            summary,
          });
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) console.error(`[JC ${memberId} ERR] ${text.slice(0, 200)}`);
      });

      child.on('close', (code) => {
        console.log(
          `[JC TaskWatcher] ${memberId} session ${sessionId.slice(0, 8)} exited (code: ${code})`,
        );

        // Update task with result and mark as done
        if (taskWatcher) {
          const result = outputBuf.trim().slice(0, 2000) || `Exited with code ${code}`;
          // Find the task and update it
          const tasksFile = JSON.parse(
            fs.readFileSync(path.join(os.homedir(), '.pixel-agents', 'tasks.json'), 'utf-8'),
          );
          const task = tasksFile.tasks?.find(
            (t: { assignee: string; status: string }) =>
              t.assignee === memberId && t.status === 'running',
          );
          if (task) {
            task.status = code === 0 ? 'done' : 'error';
            task.completedAt = new Date().toISOString();
            task.result = result;
            task.completionSummary = result.slice(0, 200);
            const tmpPath = path.join(os.homedir(), '.pixel-agents', 'tasks.json.tmp');
            fs.writeFileSync(tmpPath, JSON.stringify(tasksFile, null, 2), 'utf-8');
            fs.renameSync(tmpPath, path.join(os.homedir(), '.pixel-agents', 'tasks.json'));
            server.broadcast({ type: 'jcTaskUpdate', task });
          }
        }
      });
    };

    taskWatcher = new TaskWatcher(jcConfig as JCConfig, emptyAgents, 5, spawnClaude, true);
  }

  // Helper: intercept broadcast messages to persist to office log
  function writeToOfficeLog(msg: unknown): void {
    const m = msg as { type?: string; [key: string]: unknown };
    if (!m.type) return;

    const findMemberName = (memberId: string): string => {
      const cfg = jcConfig as { members?: Array<{ id: string; name: string; department: string }> };
      const member = cfg?.members?.find((x) => x.id === memberId);
      return member?.name ?? memberId;
    };
    const findMemberDept = (memberId: string): string => {
      const cfg = jcConfig as { members?: Array<{ id: string; department: string }> };
      return cfg?.members?.find((x) => x.id === memberId)?.department ?? 'exec';
    };

    switch (m.type) {
      case 'jcMemberArriving': {
        const memberId = m.memberId as string;
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'arrival',
          summary: `${findMemberName(memberId)} が出社しました`,
          sourceEvent: 'jcMemberArriving',
        });
        break;
      }
      case 'jcMemberLeaving': {
        const memberId = m.memberId as string;
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'departure',
          summary: `${findMemberName(memberId)} が退社しました`,
          sourceEvent: 'jcMemberLeaving',
        });
        break;
      }
      case 'jcMemberStateChange': {
        const memberId = m.memberId as string;
        const jcState = m.jcState as string;
        officeLogWriter.write({
          timestamp: Date.now(),
          memberId,
          memberName: findMemberName(memberId),
          department: findMemberDept(memberId),
          type: 'state_change',
          summary: `${findMemberName(memberId)}: → ${jcState}`,
          sourceEvent: 'jcMemberStateChange',
        });
        break;
      }
      case 'jcActivitySummary': {
        const memberId = m.memberId as string;
        const summary = m.summary as string | null;
        if (summary) {
          officeLogWriter.write({
            timestamp: Date.now(),
            memberId,
            memberName: findMemberName(memberId),
            department: findMemberDept(memberId),
            type: 'speech',
            summary: `${findMemberName(memberId)}: ${summary}`,
            sourceEvent: 'jcActivitySummary',
          });
        }
        break;
      }
      case 'jcSpeechBubble': {
        const bubble = m.bubble as { memberId: string; text: string; department: string };
        if (bubble) {
          officeLogWriter.write({
            timestamp: Date.now(),
            memberId: bubble.memberId,
            memberName: findMemberName(bubble.memberId),
            department: bubble.department,
            type: 'speech',
            summary: `${findMemberName(bubble.memberId)}: ${bubble.text}`,
            sourceEvent: 'jcSpeechBubble',
          });
        }
        break;
      }
      case 'jcOfficeEvent': {
        const event = m.event as { event: string; [key: string]: unknown };
        if (event) {
          const evType = event.event;
          let memberId = (event.agent ?? event.from ?? '') as string;
          let summary = evType;
          let logType: 'task_event' | 'delegation' | 'office_event' = 'office_event';

          if (
            evType === 'task_received' ||
            evType === 'task_completed' ||
            evType === 'work_started'
          ) {
            logType = 'task_event';
            summary = `${evType}: ${(event.task as string) ?? ''}`;
          } else if (evType === 'delegate' || evType === 'task_assigned') {
            logType = 'delegation';
            memberId = event.from as string;
            const to = event.to as string | string[];
            const toStr = Array.isArray(to) ? to.join(', ') : to;
            summary = `${findMemberName(memberId)} → ${toStr}: ${(event.task as string) ?? ''}`;
          } else if (evType === 'cross_dept_message') {
            memberId = event.from as string;
            summary = `${findMemberName(memberId)} → ${findMemberName(event.to as string)}: ${(event.message as string) ?? ''}`;
          }

          officeLogWriter.write({
            timestamp: Date.now(),
            memberId,
            memberName: findMemberName(memberId),
            department: findMemberDept(memberId),
            type: logType,
            summary,
            sourceEvent: evType,
          });
        }
        break;
      }
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

  // Wire TaskWatcher into dispatcher and start it
  if (taskWatcher) {
    const pseudoWebview = {
      postMessage: (msg: unknown) => {
        server.broadcast(msg);
        writeToOfficeLog(msg);
      },
    };
    taskWatcher.start(pseudoWebview);

    dispatcher.setContext({
      submitTask: (prompt, priority, assignee, workingDirectory) => {
        // Default assignee to first available member if not specified
        const target = assignee ?? jcMembers[0]?.id ?? 'eng-01';
        // Prefix with /company so Cursor's Claude Code invokes the company skill
        const fullPrompt = `/company ${prompt}`;
        taskWatcher!.submitTask(target, fullPrompt, priority, workingDirectory);
      },
      reorderTasks: (taskIds) => taskWatcher!.reorderTasks(taskIds),
      reviewTask: (taskId, action) => taskWatcher!.reviewTask(taskId, action),
      getTaskHistory: (limit, offset) => taskWatcher!.getTaskHistory(limit, offset),
      cancelTask: (taskId) => taskWatcher!.cancelTask(taskId),
      updateTask: (taskId, updates) => {
        if (updates.status) {
          taskWatcher!.updateTaskStatus(taskId, updates.status as any);
        }
      },
      reassignTask: (taskId, newAssignee) => taskWatcher!.reassignTask(taskId, newAssignee),
    });

    // Wire history writer queries and office log into dispatcher
    const historyWriter = taskWatcher.getHistoryWriter();
    dispatcher.setContext({
      queryTaskHistory: (opts) => historyWriter.query(opts),
      updateTaskLabel: (taskId, date, label) =>
        historyWriter.updateLabel(taskId, date, label as any),
      queryOfficeLog: (opts) => officeLogWriter.query(opts),
    });

    console.log(`[JC] TaskWatcher started (watching ~/.pixel-agents/tasks.json)`);
    console.log(`[JC] Task history: ~/.pixel-agents/task-history/`);
    console.log(`[JC] Office log: ~/.pixel-agents/office-log/`);
  }

  // Start event queue watcher (jc-events.json)
  // Resolve workspace root: --workspace= arg > parent dir with jc-events.json > cwd
  let eventWatcher: EventWatcher | null = null;
  if (jcConfig) {
    const wsArg = args.find((a) => a.startsWith('--workspace='));
    let workspaceRoot = wsArg ? path.resolve(wsArg.split('=')[1]) : process.cwd();

    // If cwd is inside pixel-agents, check parent directory for jc-events.json
    // (common case: /company skill writes to cc-company/jc-events.json)
    const parentDir = path.resolve(workspaceRoot, '..');
    const parentEventsFile = path.join(parentDir, 'jc-events.json');
    const cwdEventsFile = path.join(workspaceRoot, 'jc-events.json');
    if (!fs.existsSync(cwdEventsFile) && fs.existsSync(parentEventsFile)) {
      workspaceRoot = parentDir;
      console.log(`[JC] Event watcher using parent directory: ${parentDir}`);
    }

    // Also watch parent if it has a .company/ directory (company skill workspace)
    const parentCompanyDir = path.join(parentDir, '.company');
    if (!wsArg && fs.existsSync(parentCompanyDir)) {
      workspaceRoot = parentDir;
      console.log(`[JC] Detected .company/ in parent — watching ${parentDir}/jc-events.json`);
    }

    eventWatcher = new EventWatcher(jcConfig as JCConfig, workspaceRoot);
    // Create a pseudo-webview that broadcasts to all browser clients + writes to office log
    const pseudoWebview = {
      postMessage: (msg: unknown) => {
        server.broadcast(msg);
        writeToOfficeLog(msg);
      },
    } as any;
    eventWatcher.start(pseudoWebview);
    console.log(`[JC] Event watcher started (watching ${workspaceRoot}/jc-events.json)`);
  }

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
    taskWatcher?.dispose();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── JSONL Watcher ────────────────────────────────────────────────

let nextAgentId = 1;

/** Per-file JSONL content tracking state */
interface JsonlContentState {
  fileOffset: number;
  lineBuffer: string;
  activeTools: Set<string>;
  memberId: string;
  agentId: number;
}
const jsonlContentStates = new Map<string, JsonlContentState>();

/** Read new lines from a JSONL file and process tool_use/tool_result for animations */
function readAndProcessJsonl(
  filePath: string,
  state: JsonlContentState,
  broadcast: (data: unknown) => void,
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= state.fileOffset) return;

    const readSize = Math.min(stat.size - state.fileOffset, 65536); // 64KB cap
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readSize, state.fileOffset);
    fs.closeSync(fd);
    state.fileOffset += readSize;

    const chunk = state.lineBuffer + buf.toString('utf-8');
    const lines = chunk.split('\n');
    state.lineBuffer = lines.pop() || ''; // Keep incomplete last line

    for (const line of lines) {
      if (!line.trim()) continue;
      processJsonlLine(line, state, broadcast);
    }
  } catch {
    // File might be mid-write or deleted
  }
}

/** Parse a single JSONL line and broadcast state changes */
function processJsonlLine(
  line: string,
  state: JsonlContentState,
  broadcast: (data: unknown) => void,
): void {
  try {
    const record = JSON.parse(line);
    const content = record.message?.content ?? record.content;

    // assistant record with tool_use blocks → set active animation state
    if (record.type === 'assistant' && Array.isArray(content)) {
      for (const block of content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>) {
        if (block.type === 'tool_use' && block.id && block.name) {
          state.activeTools.add(block.id);
          const jcState = toolToJCState(block.name);

          // Infer which member should animate based on tool file paths
          const inferredMember = block.input
            ? inferMemberFromToolPath(block.name, block.input)
            : null;
          const targetMemberId = inferredMember ?? state.memberId;

          // If inferred member differs, arrive them and broadcast their state
          if (inferredMember && inferredMember !== state.memberId) {
            const member = jcMembers.find((m) => m.id === inferredMember);
            if (member && !assignedMembers.has(inferredMember)) {
              const newAgentId = nextAgentId++;
              assignedMembers.add(inferredMember);
              agentMemberMap[newAgentId] = inferredMember;
              broadcast({
                type: 'jcMemberArriving',
                agentId: newAgentId,
                memberId: inferredMember,
                deskId: member.deskId,
                seatUid: member.deskId,
                hueShift: member.hueShift,
                palette: member.palette ?? 0,
              });
              broadcast({ type: 'jcMappingUpdate', mappings: { ...agentMemberMap } });
              console.log(
                `[JC] Tool path inferred → ${inferredMember} (${block.name}: ${(block.input?.file_path as string)?.slice(-40) ?? ''})`,
              );
            }
          }

          broadcast({
            type: 'jcMemberStateChange',
            agentId: state.agentId,
            memberId: targetMemberId,
            jcState,
          });
        }
      }
    }

    // user record with tool_result → mark tool done, idle when all tools complete
    if (record.type === 'user' && Array.isArray(content)) {
      for (const block of content as Array<{ type: string; tool_use_id?: string }>) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          state.activeTools.delete(block.tool_use_id);
        }
      }
      if (state.activeTools.size === 0) {
        broadcast({
          type: 'jcMemberStateChange',
          agentId: state.agentId,
          memberId: state.memberId,
          jcState: 'idle',
        });
      }
    }

    // turn_duration system record → turn completed, clear all tools
    if (record.type === 'system' && record.subtype === 'turn_duration') {
      state.activeTools.clear();
      broadcast({
        type: 'jcMemberStateChange',
        agentId: state.agentId,
        memberId: state.memberId,
        jcState: 'idle',
      });
    }
  } catch {
    // Invalid JSON line, skip
  }
}

/** Infer JC member from tool file paths in JSONL content */
function inferMemberFromToolPath(toolName: string, input: Record<string, unknown>): string | null {
  const filePath =
    (input.file_path as string) || (input.path as string) || (input.command as string) || '';
  if (!filePath) return null;

  if (filePath.includes('.company/research') || filePath.includes('assets/shared/research'))
    return 'res-01';
  if (filePath.includes('.company/marketing') || filePath.includes('campaigns/')) return 'mkt-01';
  if (filePath.includes('.company/engineering') || filePath.includes('pixel-agents/'))
    return 'eng-01';
  if (filePath.includes('.company/pm') || filePath.includes('tickets/')) return 'eng-04';
  if (filePath.includes('.company/ceo') || filePath.includes('decisions/')) return 'exec-sec';
  if (filePath.includes('.company/secretary') || filePath.includes('inbox/')) return 'exec-sec';
  return null;
}

/** Register a JSONL file for content tracking and arrive its member */
function registerJsonlAgent(
  filePath: string,
  sessionId: string,
  member: JCMemberEntry,
  broadcast: (data: unknown) => void,
  startOffset: number,
): number {
  const agentId = nextAgentId++;
  activeAgents.set(agentId, { sessionId, file: filePath, memberId: member.id });
  broadcast({ type: 'agentCreated', id: agentId });

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

  jsonlContentStates.set(filePath, {
    fileOffset: startOffset,
    lineBuffer: '',
    activeTools: new Set(),
    memberId: member.id,
    agentId,
  });

  console.log(`[JC] Agent ${agentId} → ${member.id} (desk: ${member.deskId})`);
  return agentId;
}

/** Collect all JSONL files from a project directory, including subagents/ */
function collectJsonlFiles(projectDir: string): string[] {
  const files: string[] = [];
  try {
    for (const f of fs.readdirSync(projectDir)) {
      if (f.endsWith('.jsonl')) {
        files.push(path.join(projectDir, f));
      }
    }
    // Scan subagents/ subdirectories recursively
    const subagentsDir = path.join(projectDir, 'subagents');
    if (fs.existsSync(subagentsDir) && fs.statSync(subagentsDir).isDirectory()) {
      for (const f of fs.readdirSync(subagentsDir)) {
        if (f.endsWith('.jsonl')) {
          files.push(path.join(subagentsDir, f));
        }
      }
    }
    // Also check session subdirectories (e.g., sessionId/subagents/)
    for (const d of fs.readdirSync(projectDir)) {
      const subDir = path.join(projectDir, d);
      try {
        if (
          !d.endsWith('.jsonl') &&
          d !== 'subagents' &&
          d !== 'memory' &&
          fs.statSync(subDir).isDirectory()
        ) {
          const nestedSubagents = path.join(subDir, 'subagents');
          if (fs.existsSync(nestedSubagents) && fs.statSync(nestedSubagents).isDirectory()) {
            for (const f of fs.readdirSync(nestedSubagents)) {
              if (f.endsWith('.jsonl')) {
                files.push(path.join(nestedSubagents, f));
              }
            }
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  } catch {
    // Ignore read errors
  }
  return files;
}

function startWatcher(claudeDir: string, broadcast: (data: unknown) => void): void {
  const scanProjects = (): void => {
    try {
      const projects = fs.readdirSync(claudeDir);
      for (const project of projects) {
        const projectDir = path.join(claudeDir, project);
        const stat = fs.statSync(projectDir);
        if (!stat.isDirectory()) continue;

        const allFiles = collectJsonlFiles(projectDir);
        for (const filePath of allFiles) {
          const sessionId = path.basename(filePath).replace('.jsonl', '');

          // Skip already tracked
          const isTracked = [...activeAgents.values()].some((a) => a.file === filePath);
          if (isTracked) continue;

          // Only recent files (5 min)
          const fstat = fs.statSync(filePath);
          if (Date.now() - fstat.mtimeMs > 5 * 60 * 1000) continue;

          const member = jcMembers.find((m) => !assignedMembers.has(m.id));
          if (member) {
            registerJsonlAgent(filePath, sessionId, member, broadcast, fstat.size);
          } else {
            console.log(
              `[JC] JSONL detected but no JC member available: ${path.basename(filePath)}`,
            );
          }
        }
      }
    } catch {
      // Ignore scan errors
    }
  };

  // Content poll: read new JSONL lines and update animation states (500ms)
  // Also handles dynamic member re-mapping based on tool paths
  setInterval(() => {
    for (const [filePath, state] of jsonlContentStates) {
      readAndProcessJsonl(filePath, state, broadcast);
    }
  }, 500);

  scanProjects();
  setInterval(scanProjects, 5000);
}

main().catch((err) => {
  console.error('[JC] Fatal error:', err);
  process.exit(1);
});
