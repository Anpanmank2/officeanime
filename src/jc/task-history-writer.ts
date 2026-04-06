// ── Task History Writer — JSONL append + query ─────────────────
// Persists completed task logs to ~/.pixel-agents/task-history/YYYY-MM-DD.jsonl

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LAYOUT_FILE_DIR } from '../constants.js';
import type {
  TaskHistoryQuery,
  TaskHistoryResult,
  TaskLabel,
  TaskLogEntry,
} from './task-log-types.js';
import type { JCConfig, TaskDefinition } from './types.js';

const HISTORY_DIR = 'task-history';
const DEFAULT_LIMIT = 50;

function getHistoryDir(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, HISTORY_DIR);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Classify task prompt into a label */
function classifyLabel(prompt: string, isIncident?: boolean): TaskLabel {
  if (isIncident) return 'incident';
  const rules: Array<{ label: TaskLabel; pattern: RegExp }> = [
    {
      label: 'incident',
      pattern: /\b(incident|outage|down|hotfix|emergency|urgent\s*fix|revert|障害|緊急)\b/i,
    },
    {
      label: 'bugfix',
      pattern: /\b(bug|fix|error|crash|broken|regression|patch|バグ|修正|不具合)\b/i,
    },
    {
      label: 'review',
      pattern: /\b(review|audit|check|inspect|approve|feedback|PR\s*review|レビュー|確認)\b/i,
    },
    {
      label: 'research',
      pattern: /\b(research|investigate|analyze|study|survey|explore|調査|分析|リサーチ|調べ)\b/i,
    },
    {
      label: 'design',
      pattern: /\b(design|UI|UX|layout|wireframe|mockup|prototype|デザイン|設計)\b/i,
    },
    {
      label: 'ops',
      pattern: /\b(deploy|CI|CD|pipeline|infra|monitor|ops|config|migration|設定|デプロイ|運用)\b/i,
    },
    {
      label: 'implementation',
      pattern: /\b(implement|build|create|add|develop|feature|write|code|実装|開発|作成|追加)\b/i,
    },
  ];
  for (const { label, pattern } of rules) {
    if (pattern.test(prompt)) return label;
  }
  return 'other';
}

function mapStatus(status: string): 'done' | 'failed' | 'cancelled' | 'incident' {
  switch (status) {
    case 'done':
      return 'done';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'done';
  }
}

export class TaskHistoryWriter {
  private dir: string;

  constructor() {
    this.dir = getHistoryDir();
    ensureDir(this.dir);
  }

  /** Write a completed task to the history log */
  writeEntry(task: TaskDefinition, config?: JCConfig): void {
    const completedDate = task.completedAt
      ? new Date(task.completedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const filePath = path.join(this.dir, `${completedDate}.jsonl`);

    const entry: TaskLogEntry = {
      taskId: task.id,
      title: task.prompt.slice(0, 100),
      label: classifyLabel(task.prompt, task.isIncident),
      priority: task.priority,
      status: task.isIncident ? 'incident' : mapStatus(task.status),
      createdAt: new Date(task.createdAt).getTime(),
      startedAt: task.startedAt ? new Date(task.startedAt).getTime() : undefined,
      completedAt: task.completedAt ? new Date(task.completedAt).getTime() : Date.now(),
      durationMs:
        task.startedAt && task.completedAt
          ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
          : undefined,
      delegationChain: task.delegationChain ?? [],
      assignedTo: task.assignee,
      pmReview:
        task.reviewState && task.reviewedBy
          ? {
              reviewer: task.reviewedBy,
              result: task.reviewState as 'approved' | 'rejected',
              timestamp: Date.now(),
            }
          : undefined,
      outputs: task.outputFiles,
      summary: task.completionSummary ?? task.result?.slice(0, 200),
      incidentRef: task.isIncident ? task.id : undefined,
      prompt: task.prompt,
    };

    try {
      fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[TaskHistory] Failed to write entry:', err);
    }
  }

  /** Query task history with filters */
  query(options: TaskHistoryQuery): TaskHistoryResult {
    const startDate = options.startDate ?? this.defaultStartDate();
    const endDate = options.endDate ?? new Date().toISOString().slice(0, 10);
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;

    const files = this.listFiles(startDate, endDate);
    const allEntries: TaskLogEntry[] = [];

    // Read files in reverse chronological order
    for (let i = files.length - 1; i >= 0; i--) {
      const entries = this.readJsonl(files[i]);
      // Reverse within file (newest first)
      for (let j = entries.length - 1; j >= 0; j--) {
        allEntries.push(entries[j]);
      }
    }

    // Apply filters
    let filtered = allEntries;
    if (options.status && options.status.length > 0) {
      const statusSet = new Set(options.status);
      filtered = filtered.filter((e) => statusSet.has(e.status));
    }
    if (options.labels && options.labels.length > 0) {
      const labelSet = new Set(options.labels);
      filtered = filtered.filter((e) => labelSet.has(e.labelOverride ?? e.label));
    }
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(searchLower) ||
          e.prompt.toLowerCase().includes(searchLower) ||
          (e.summary && e.summary.toLowerCase().includes(searchLower)),
      );
    }

    const totalCount = filtered.length;
    const sliced = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return { entries: sliced, hasMore, totalCount };
  }

  /** Update label override for a specific task */
  updateLabel(taskId: string, date: string, newLabel: TaskLabel): boolean {
    const filePath = path.join(this.dir, `${date}.jsonl`);
    if (!fs.existsSync(filePath)) return false;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      let found = false;

      const updated = lines.map((line) => {
        try {
          const entry = JSON.parse(line) as TaskLogEntry;
          if (entry.taskId === taskId) {
            entry.labelOverride = newLabel;
            found = true;
            return JSON.stringify(entry);
          }
        } catch {
          /* skip malformed */
        }
        return line;
      });

      if (found) {
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, updated.join('\n') + '\n', 'utf-8');
        fs.renameSync(tmpPath, filePath);
      }
      return found;
    } catch (err) {
      console.error('[TaskHistory] Failed to update label:', err);
      return false;
    }
  }

  private defaultStartDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }

  private listFiles(startDate: string, endDate: string): string[] {
    if (!fs.existsSync(this.dir)) return [];
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => f.endsWith('.jsonl'))
        .filter((f) => {
          const date = f.replace('.jsonl', '');
          return date >= startDate && date <= endDate;
        })
        .sort()
        .map((f) => path.join(this.dir, f));
    } catch {
      return [];
    }
  }

  private readJsonl(filePath: string): TaskLogEntry[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as TaskLogEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is TaskLogEntry => e !== null);
    } catch {
      return [];
    }
  }
}
