// ── Just Curious Virtual Office — Task Watcher ────────────────────
// Watches ~/.pixel-agents/tasks.json for pending tasks and launches
// Claude Code terminals via agentManager when tasks are detected.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LAYOUT_FILE_DIR } from '../constants.js';

/** Minimal postMessage interface (works with both vscode.Webview and pseudo-webview) */
interface MessageSink {
  postMessage(message: unknown): void;
}
import type { AgentState } from '../types.js';
import { getDeskByMemberId } from './desk-registry.js';
import { getTaskHistory as getTaskHistoryFromFile } from './task-history.js';
import { TaskHistoryWriter } from './task-history-writer.js';
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
  private webview: MessageSink | undefined;
  private maxConcurrent: number;
  private launchFn: (memberId: string, prompt: string, workingDir?: string) => Promise<void>;
  /** Track which task IDs are currently being launched (prevent double-launch) */
  private launching = new Set<string>();
  /** Map task ID → agent ID for tracking completions */
  private taskAgentMap = new Map<string, number>();
  /** Persists completed tasks to JSONL history */
  private historyWriter = new TaskHistoryWriter();
  /** When false, poll() only syncs UI — does NOT mark tasks as running or launch them.
   *  Standalone mode sets this to false so Cursor's extension handles launching. */
  private launchEnabled: boolean;

  constructor(
    config: JCConfig,
    agents: Map<number, AgentState>,
    maxConcurrent: number | undefined,
    launchFn: (memberId: string, prompt: string, workingDir?: string) => Promise<void>,
    launchEnabled = true,
  ) {
    this.config = config;
    this.agents = agents;
    this.maxConcurrent = maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.launchFn = launchFn;
    this.launchEnabled = launchEnabled;
  }

  start(webview: MessageSink): void {
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

    // Migrate existing completed tasks from queue to history log
    this.migrateCompletedTasks();

    // Initial sync
    this.syncToWebview();
  }

  /** Move completed/error tasks from tasks.json to history JSONL */
  private migrateCompletedTasks(): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;

    const terminalStatuses: Set<string> = new Set([
      TaskStatus.DONE,
      TaskStatus.ERROR,
      TaskStatus.CANCELLED,
    ]);
    const completed = tasksFile.tasks.filter((t) => terminalStatuses.has(t.status));

    if (completed.length === 0) return;

    for (const task of completed) {
      this.historyWriter.writeEntry(task, this.config);
    }

    // Remove from active queue
    tasksFile.tasks = tasksFile.tasks.filter((t) => !terminalStatuses.has(t.status));
    writeTasksFile(tasksFile);

    console.log(`[JC TaskWatcher] Migrated ${completed.length} completed tasks to history log`);
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

    // In read-only mode (standalone), only sync UI — don't launch tasks.
    // Cursor's extension TaskWatcher handles the actual launching.
    if (!this.launchEnabled) {
      this.syncToWebview();
      return;
    }

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

            // Persist to history log
            this.historyWriter.writeEntry(task, this.config);

            // Remove from active queue
            tasksFile.tasks = tasksFile.tasks.filter((t) => t.id !== taskId);
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

  /** Cancel a task by ID */
  cancelTask(taskId: string): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;
    const task = tasksFile.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = TaskStatus.CANCELLED;
    task.completedAt = new Date().toISOString();

    // Persist to history log
    this.historyWriter.writeEntry(task, this.config);

    // Remove from active queue
    tasksFile.tasks = tasksFile.tasks.filter((t) => t.id !== taskId);
    writeTasksFile(tasksFile);
    this.webview?.postMessage({ type: 'jcTaskUpdate', task });
  }

  /** Update task status or priority */
  updateTaskStatus(taskId: string, newStatus: TaskStatus): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;
    const task = tasksFile.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = newStatus;
    writeTasksFile(tasksFile);
    this.webview?.postMessage({ type: 'jcTaskUpdate', task });
  }

  /** Reassign a task to a different member */
  reassignTask(taskId: string, newAssignee: string): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;
    const task = tasksFile.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.assignee = newAssignee;
    writeTasksFile(tasksFile);
    this.webview?.postMessage({ type: 'jcTaskUpdate', task });
  }

  /** Get tasks for a specific member */
  getTasksForMember(memberId: string): TaskDefinition[] {
    const tasksFile = readTasksFile();
    if (!tasksFile) return [];
    return tasksFile.tasks.filter((t) => t.assignee === memberId);
  }

  /** Get task history (completed/error/cancelled tasks) — legacy (tasks.json only) */
  getTaskHistory(limit?: number, offset?: number): { tasks: TaskDefinition[]; hasMore: boolean } {
    return getTaskHistoryFromFile(limit, offset);
  }

  /** Get the history writer for advanced queries */
  getHistoryWriter(): TaskHistoryWriter {
    return this.historyWriter;
  }

  /** Reorder tasks by providing ordered task IDs */
  reorderTasks(taskIds: string[]): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;

    // Assign sortOrder based on position in the provided array
    for (let i = 0; i < taskIds.length; i++) {
      const task = tasksFile.tasks.find((t) => t.id === taskIds[i]);
      if (task) {
        task.sortOrder = i;
      }
    }

    writeTasksFile(tasksFile);

    // Broadcast updated task list
    const activeTasks = tasksFile.tasks.filter(
      (t) => t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING,
    );
    this.webview?.postMessage({ type: 'jcTaskReorder', tasks: activeTasks });
  }

  /** Review a task (approve or reject) */
  reviewTask(taskId: string, action: 'approve' | 'reject'): void {
    const tasksFile = readTasksFile();
    if (!tasksFile) return;
    const task = tasksFile.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.reviewState = action === 'approve' ? 'approved' : 'rejected';
    if (task.status === TaskStatus.REVIEWING) {
      task.status = action === 'approve' ? TaskStatus.DONE : TaskStatus.PENDING;
    }

    writeTasksFile(tasksFile);
    this.webview?.postMessage({ type: 'jcTaskUpdate', task });
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
