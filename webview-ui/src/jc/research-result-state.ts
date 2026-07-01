// ── Research Result store (webview volatile store) ─────────────────────
// Holds the latest completed RESEARCH finding so the office can surface a
// prominent, dismissible "調査結果" panel ("click → see the answer").
//
// Display-layer only: it does NOT drive any spawn/permission/backend logic.
// Data source is the EXISTING return path — the extension already broadcasts
// `jcTaskUpdate` with the full TaskDefinition (assignee / label / status /
// result). We only pick research-labeled DONE tasks that carry a result and
// mirror them into this store for the panel to render.
//
// Imperative store with a subscribe API (Observer pattern, mirrors
// game-state.ts) so the React panel reacts without polling.

/** A completed research finding ready to be shown in the office panel. */
export interface ResearchResult {
  /** Task id — used to dedupe repeated jcTaskUpdate broadcasts of the same task. */
  id: string;
  /** Resolved member name (e.g. "古賀 春樹"). Falls back to member id. */
  memberName: string;
  /** Roster member id (e.g. "res-01") for the accent color / dept tag. */
  memberId: string;
  /** Department id (e.g. "research") for accent coloring. */
  department: string;
  /** What was investigated (the task title / prompt). */
  subject: string;
  /** The findings body — the researcher's answer text (may be multi-line). */
  findings: string;
}

let current: ResearchResult | null = null;

// ── Subscribe API (Observer, see imperative-store-subscribe-pattern skill) ──
const listeners = new Set<() => void>();
let pendingNotify = false;

function scheduleNotify(): void {
  if (pendingNotify) return;
  pendingNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingNotify = false;
    for (const fn of listeners) {
      try {
        fn();
      } catch (e) {
        console.error('[research-result-state] listener error:', e);
      }
    }
  });
}

/**
 * Push a completed research finding to the store (replaces any prior one).
 * No-op if the same task id is already displayed — jcTaskUpdate can rebroadcast
 * the same done task, and we don't want the panel to flicker/re-open.
 */
export function setResearchResult(result: ResearchResult): void {
  if (current && current.id === result.id) return;
  current = result;
  scheduleNotify();
}

/** Get the currently displayed research finding, or null if none. */
export function getResearchResult(): ResearchResult | null {
  return current;
}

/** Dismiss the panel (close ✕). */
export function clearResearchResult(): void {
  if (!current) return;
  current = null;
  scheduleNotify();
}

/** Subscribe to store changes. Returns unsubscribe fn for useEffect cleanup. */
export function subscribeResearchResult(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
