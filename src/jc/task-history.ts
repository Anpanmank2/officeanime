// ── Just Curious Virtual Office — Task History ─────────────────
// Reads completed/error/cancelled tasks from tasks.json for the
// Task History panel. Supports pagination and date grouping.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LAYOUT_FILE_DIR } from '../constants.js';
import type { TaskDefinition, TasksFile } from './types.js';
import { TaskStatus } from './types.js';

const TASKS_FILE_NAME = 'tasks.json';
const DEFAULT_LIMIT = 50;

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

/** Terminal statuses that appear in history */
const HISTORY_STATUSES = new Set<string>([TaskStatus.DONE, TaskStatus.ERROR, TaskStatus.CANCELLED]);

/** Get completed/error/cancelled tasks, sorted by completedAt descending. */
export function getTaskHistory(
  limit?: number,
  offset?: number,
): { tasks: TaskDefinition[]; hasMore: boolean } {
  const tasksFile = readTasksFile();
  if (!tasksFile) return { tasks: [], hasMore: false };

  const historyTasks = tasksFile.tasks
    .filter((t) => HISTORY_STATUSES.has(t.status))
    .sort((a, b) => {
      const aTime = a.completedAt ?? a.createdAt;
      const bTime = b.completedAt ?? b.createdAt;
      return bTime.localeCompare(aTime); // descending
    });

  const start = offset ?? 0;
  const count = limit ?? DEFAULT_LIMIT;
  const sliced = historyTasks.slice(start, start + count);
  const hasMore = start + count < historyTasks.length;

  return { tasks: sliced, hasMore };
}
