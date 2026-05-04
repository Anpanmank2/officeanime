// ── Office Log State — Ring Buffer ──────────────────────────────
// Accumulates OfficeLogEntry items from existing JC messages.
// Fixed-size ring buffer (MAX_ENTRIES) to bound memory.

import type { OfficeLogEntry } from './jc-types.js';

const MAX_ENTRIES = 500;

let entries: OfficeLogEntry[] = [];
let nextId = 1;

/** Add a log entry. Trims oldest entries when buffer is full. */
export function addLogEntry(entry: Omit<OfficeLogEntry, 'id'>): void {
  const full: OfficeLogEntry = { ...entry, id: String(nextId++) };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  scheduleLogNotify();
}

/** Get all log entries, optionally filtered by department. */
export function getLogEntries(department?: string): OfficeLogEntry[] {
  if (!department || department === 'All') {
    return entries;
  }
  return entries.filter((e) => e.department === department);
}

/** Get entries newer than a given timestamp. */
export function getLogEntriesSince(since: number, department?: string): OfficeLogEntry[] {
  const filtered = getLogEntries(department);
  return filtered.filter((e) => e.timestamp > since);
}

/** Get entry count. */
export function getLogEntryCount(): number {
  return entries.length;
}

/** Clear all entries (e.g., on config reload). */
export function clearLog(): void {
  entries = [];
  nextId = 1;
  scheduleLogNotify();
}

// ── Subscribe API ────────────────────────────────────────────────

const logListeners = new Set<() => void>();
let pendingLogNotify = false;

/** scheduleLogNotify: requestAnimationFrame 単位で listener 呼び出しを batch 化。
 *  bulk update 時に過剰更新を抑える。SSR/test 環境では setTimeout(16ms) fallback。 */
function scheduleLogNotify(): void {
  if (pendingLogNotify) return;
  pendingLogNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingLogNotify = false;
    for (const fn of logListeners) {
      try {
        fn();
      } catch (e) {
        console.error('[office-log-state] listener error:', e);
      }
    }
  });
}

/** Subscribe to log changes. Returns an unsubscribe function for useEffect cleanup. */
export function subscribeLog(fn: () => void): () => void {
  logListeners.add(fn);
  return () => {
    logListeners.delete(fn);
  };
}
