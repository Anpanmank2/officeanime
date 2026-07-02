// ── Request(write型) Result store (webview volatile store) ──────────────
// Holds the latest WRITE-kind (資料 doc / 実装 impl) 依頼 result so the office
// can surface a prominent, dismissible 「下書きができました」panel with the
// 下書き置き場のパス + 作成ファイル + 要約 (2026-07-02 横展開 AC: write型完了時).
//
// Display-layer only: it does NOT drive any spawn/permission/backend logic.
// Data source is the backend broadcast `jcRequestResult` (fired when the
// scoped-write execute spawn finishes — or immediately with status
// 'disabled'/'blocked' when the --jc-live-spawn gate / plan-confirm gate holds).
//
// Mirrors research-result-state.ts (imperative store + Observer subscribe,
// see imperative-store-subscribe-pattern skill). ResearchResultPanel /
// research-result-state are 触るな — this is a separate parallel store.

/** Terminal status of a write-kind request execution. */
export type RequestResultStatus = 'done' | 'error' | 'disabled' | 'blocked';

/** A finished (or gated) write-kind 依頼 ready to be shown in the office panel. */
export interface RequestResult {
  /** Request id — dedupes repeated broadcasts of the same result. */
  id: string;
  /** Roster member id (e.g. "mkt-01") for the accent color / dept tag. */
  memberId: string;
  /** Resolved member name. Falls back to member id. */
  memberName: string;
  /** Department id (e.g. "marketing") for accent coloring. */
  department: string;
  /** Card kind ('doc' | 'impl'). */
  kind: string;
  /** 下書き置き場 — the ONLY dir the execute spawn could write to. */
  stagingDir: string;
  /** done = 下書き完成 / error = spawn 異常 / disabled = flag OFF / blocked = plan未確認. */
  status: RequestResultStatus;
  /** Files created under the staging dir (relative paths, capped by backend). */
  files: string[];
  /** The execute spawn's closing report (要約) or the gate notice text. */
  summary: string;
}

let current: RequestResult | null = null;

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
        console.error('[request-result-state] listener error:', e);
      }
    }
  });
}

/**
 * Push a write-kind request result to the store (replaces any prior one).
 * No-op if the same request id AND status is already displayed (rebroadcast
 * guard; a status change for the same id — e.g. never in practice — re-renders).
 */
export function setRequestResult(result: RequestResult): void {
  if (current && current.id === result.id && current.status === result.status) return;
  current = result;
  scheduleNotify();
}

/** Get the currently displayed request result, or null if none. */
export function getRequestResult(): RequestResult | null {
  return current;
}

/** Dismiss the panel (close ✕). */
export function clearRequestResult(): void {
  if (!current) return;
  current = null;
  scheduleNotify();
}

/** Subscribe to store changes. Returns unsubscribe fn for useEffect cleanup. */
export function subscribeRequestResult(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
