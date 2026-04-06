// ── Office Log Writer — JSONL append + query ───────────────────
// Persists office log records to ~/.pixel-agents/office-log/YYYY-MM-DD.jsonl

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LAYOUT_FILE_DIR } from '../constants.js';
import type { OfficeLogQuery, OfficeLogRecord, OfficeLogResult } from './task-log-types.js';

const LOG_DIR = 'office-log';
const DEFAULT_LIMIT = 100;

function getLogDir(): string {
  return path.join(os.homedir(), LAYOUT_FILE_DIR, LOG_DIR);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class OfficeLogWriter {
  private dir: string;

  constructor() {
    this.dir = getLogDir();
    ensureDir(this.dir);
  }

  /** Append a log record to today's JSONL file */
  write(record: Omit<OfficeLogRecord, 'id'>): void {
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.dir, `${today}.jsonl`);

    const entry: OfficeLogRecord = {
      ...record,
      id: crypto.randomUUID(),
    };

    try {
      fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[OfficeLog] Failed to write record:', err);
    }
  }

  /** Query office log records with filters */
  query(options: OfficeLogQuery): OfficeLogResult {
    const startDate = options.startDate ?? new Date().toISOString().slice(0, 10);
    const endDate = options.endDate ?? new Date().toISOString().slice(0, 10);
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;

    const files = this.listFiles(startDate, endDate);
    const allEntries: OfficeLogRecord[] = [];

    // Read files in reverse chronological order
    for (let i = files.length - 1; i >= 0; i--) {
      const entries = this.readJsonl(files[i]);
      for (let j = entries.length - 1; j >= 0; j--) {
        allEntries.push(entries[j]);
      }
    }

    // Apply filters
    let filtered = allEntries;
    if (options.department) {
      filtered = filtered.filter((e) => e.department === options.department);
    }
    if (options.type) {
      filtered = filtered.filter((e) => e.type === options.type);
    }
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.summary.toLowerCase().includes(searchLower) ||
          e.memberName.toLowerCase().includes(searchLower),
      );
    }

    const sliced = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    return { entries: sliced, hasMore };
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

  private readJsonl(filePath: string): OfficeLogRecord[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as OfficeLogRecord;
          } catch {
            return null;
          }
        })
        .filter((e): e is OfficeLogRecord => e !== null);
    } catch {
      return [];
    }
  }
}
