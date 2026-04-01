// ── Just Curious Virtual Office — Task Watcher ────────────────────
// Watches ~/.pixel-agents/tasks.json for pending tasks and launches
// Claude Code terminals via agentManager when tasks are detected.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import { LAYOUT_FILE_DIR } from '../constants.js';
import type { AgentState } from '../types.js';
import { getDeskByMemberId } from './desk-registry.js';
import type { JCConfig, TaskDefinition, TasksFile } from './types.js';
import { TaskStatus } from './types.js';

const TASKS_FILE_NAME = 'tasks.json';
const POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_CONCURRENT = 5;

function getTasksFilePath(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, TASKS_FILE_NAME);
}

function readTasksFile(): TasksFile | null {
  const filePath = getTasksFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TasksFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTasksFile(data: TasksFile): void {
  const filePath = getTasksFilePath();
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(data, null, 2);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[JC TaskWatcher] Failed to write tasks file:', err);
  }
}

export class TaskWatcher {
  private config: JCConfig;
  private agents: Map<number, AgentState>;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private fsWatcher: fs.FSWatcher | null = null;
  private webview: vscode.Webview | undefined;
  private maxConcurrent: number;
  private launchFn: (memberId: string, prompt: string, workingDir?: string) => Promise<void>;
  /** Track which task IDs are currently being launched (prevent double-launch) */
  private launching = new Set<string>();
  /** Map task ID → agent ID for tracking completions */
  private taskAgentMap = new Map<string, number>();

  constructor(
    config: JCConfig,
    agents: Map<number, AgentState>,
    maxConcurrent: number | undefined,
    launchFn: (memberId: string, prompt: string, workingDir?: string) => Promise<void>,
  ) {
    this.config = config;
    this.agents = agents;
    this.maxConcurrent = maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.launchFn = launchFn;
  }

  start(webview: vscode.Webview): void {
    this.webview = webview;
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);

    // Also try fs.watch for faster response
    const filePath = getTasksFilePath();
    try {
      const dir = path.dirname(filePath);
      if (fs.existsSync(dir)) {
        this.fsWatcher = fs.watch(dir, (_, filename) => {
          if (filename === TASKS_FILE_NAME) {
            this.poll();
          }
        });
        this.fsWatcher.on('error', () => {
          // fs.watch can be unreliable — polling is the fallback
        });
      }
    } catch {
      // Ignore watch errors
    }

    // Initial sync
    this.syncToWebview();
  }

  /** Submit a new task (from UI or API) */
  submitTask(
    memberId: string,
    prompt: string,
    priority: number,
    workingDirectory?: string,
  ): TaskDefinition {
    let tasksFile = readTasksFile();
    if (!tasksFile) {
      tasksFile = { version: 1, tasks: [] };
    }

    const task: TaskDefinition = {
      id: crypto.randomUUID(),
      assignee: memberId,
      prompt,
      status: TaskStatus.PENDING,
      priority,
      createdAt: new Date().toISOString(),
      workingDirectory,
    };

    tasksFile.tasks.push(task);
    writeTasksFile(tasksFile);

    // Notify webview
    this.webview?.postMessage({ type: 'jcTaskUpdate', task });

    // Trigger immediate poll to pick up the new task
    this.poll();

    return task;
  }

  /** Poll for pending tasks and launch them */
  private poll(): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;

    // Count currently running tasks
    const runningCount = tasksFile.tasks.filter((t) => t.status === TaskStatus.RUNNING).length;
    const available = this.maxConcurrent - runningCount;
    if (available <= 0) return;

    // Get pending tasks sorted by priority (lower number = higher priority)
    const pending = tasksFile.tasks
      .filter((t) => t.status === TaskStatus.PENDING && !this.launching.has(t.id))
      .sort((a, b) => a.priority - b.priority);

    const toProcess = pending.slice(0, available);
    if (toProcess.length === 0) return;

    let modified = false;
    for (const task of toProcess) {
      // Verify assignee exists in roster
      const member = this.config.members.find((m) => m.id === task.assignee);
      if (!member) {
        task.status = TaskStatus.ERROR;
        task.result = `Unknown assignee: ${task.assignee}`;
        modified = true;
        continue;
      }

      // Verify assignee has a desk
      const desk = getDeskByMemberId(task.assignee);
      if (!desk) {
        task.status = TaskStatus.ERROR;
        task.result = `No desk found for assignee: ${task.assignee}`;
        modified = true;
        continue;
      }

      // Mark as running
      task.status = TaskStatus.RUNNING;
      task.startedAt = new Date().toISOString();
      modified = true;

      // Prevent double-launch
      this.launching.add(task.id);

      // Launch terminal
      void this.launchFn(task.assignee, task.prompt, task.workingDirectory)
        .then(() => {
          this.launching.delete(task.id);
        })
        .catch((err) => {
          console.error(`[JC TaskWatcher] Failed to launch task ${task.id}:`, err);
          this.launching.delete(task.id);
          // Mark as error in tasks file
          const tf = readTasksFile();
          if (tf) {
            const t = tf.tasks.find((x) => x.id === task.id);
            if (t) {
              t.status = TaskStatus.ERROR;
              t.result = `Launch failed: ${String(err)}`;
              writeTasksFile(tf);
              this.webview?.postMessage({ type: 'jcTaskUpdate', task: t });
            }
          }
        });

      this.webview?.postMessage({ type: 'jcTaskUpdate', task });
    }

    if (modified) {
      writeTasksFile(tasksFile);
    }
  }

  /** Mark a task as done (called when terminal closes) */
  markTaskDone(agentId: number): void {
    // Find task by agent mapping
    for (const [taskId, aId] of this.taskAgentMap) {
      if (aId === agentId) {
        const tasksFile = readTasksFile();
        if (tasksFile) {
          const task = tasksFile.tasks.find((t) => t.id === taskId);
          if (task && task.status === TaskStatus.RUNNING) {
            task.status = TaskStatus.DONE;
            task.completedAt = new Date().toISOString();
            writeTasksFile(tasksFile);
            this.webview?.postMessage({ type: 'jcTaskUpdate', task });
          }
        }
        this.taskAgentMap.delete(taskId);
        break;
      }
    }
  }

  /** Associate a task with a launched agent */
  registerTaskAgent(taskId: string, agentId: number): void {
    this.taskAgentMap.set(taskId, agentId);
  }

  /** Send full task list to webview */
  syncToWebview(): void {
    if (!this.webview) return;
    const tasksFile = readTasksFile();
    const tasks = tasksFile?.tasks ?? [];
    this.webview.postMessage({ type: 'jcTasksBulkSync', tasks });
  }

  /** Get tasks for a specific member */
  getTasksForMember(memberId: string): TaskDefinition[] {
    const tasksFile = readTasksFile();
    if (!tasksFile) return [];
    return tasksFile.tasks.filter((t) => t.assignee === memberId);
  }

  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }
}
