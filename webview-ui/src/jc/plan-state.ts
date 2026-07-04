// ── Approval Tray (plan) store (webview volatile store) ─────────────────
// MVP Step2 — Fork B (plan → approval → execute). Holds the PENDING PLANS that
// a write-type card produced during its READ-ONLY plan spawn, so the office can
// surface an "承認まち" (approval-waiting) tray where the Owner decides
// 〇実行 / ✕却下 / ✎修正 for each plan.
//
// Display-layer + intent only: this store does NOT itself spawn anything or
// touch permissions. It mirrors research-result-state.ts (imperative store +
// Observer subscribe API, see imperative-store-subscribe-pattern). The backend
// pushes `jcPlanReady` (a completed plan) → useExtensionMessages mirrors it here;
// the Owner's 〇/✕/✎ decision posts a message back to the backend, which is the
// ONLY place that fires the scoped-write execute spawn.
//
// origin field = the "requested (依頼制) vs permitted (許可制)" seam. Today every
// card is Owner-clicked ('requested'); AI-initiated ('permitted') is a future
// source — the field is here so the tray can already carry it (frame only).

/** Who raised this plan. 'requested' = Owner-clicked card (依頼制, today).
 *  'permitted' = AI/office self-raised (許可制, future source —枠 only). */
export type PlanOrigin = 'requested' | 'permitted';

/** Lifecycle of a plan card in the tray. */
export type PlanStatus = 'awaiting' | 'approved' | 'rejected';

/** A plan produced by a read-only plan spawn, awaiting the Owner's decision. */
export interface PlanCard {
  /** Plan id — matches the backend pending-plan id (dedupe + decision routing). */
  id: string;
  /** Roster member id (e.g. "eng-01") that would execute — accent color / dept tag. */
  memberId: string;
  /** Resolved member name (e.g. "田中 健太"). Falls back to member id. */
  memberName: string;
  /** Department id (e.g. "engineering") for accent coloring. */
  department: string;
  /** Who raised it (依頼制 requested / 許可制 permitted). */
  origin: PlanOrigin;
  /** What the card asked for (the original task title). */
  task: string;
  /** The plan body the researcher returned (steps / write-target / cost — multi-line). */
  plan: string;
  /** The staging dir the execute spawn is confined to (下書き置き場). */
  stagingDir: string;
  /** Card lifecycle. */
  status: PlanStatus;
}

let cards: PlanCard[] = [];

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
        console.error('[plan-state] listener error:', e);
      }
    }
  });
}

/**
 * Add a completed plan to the tray (awaiting the Owner's decision).
 * No-op if the same plan id is already present — the backend can rebroadcast
 * the same jcPlanReady and we don't want duplicate cards.
 */
export function addPlan(card: PlanCard): void {
  if (cards.some((c) => c.id === card.id)) return;
  cards = [...cards, card];
  scheduleNotify();
}

/** Get the current tray cards (awaiting first, most-recent last). */
export function getPlans(): PlanCard[] {
  return cards;
}

/** Count of plans still awaiting a decision (drives the "承認まち N件" badge). */
export function getAwaitingCount(): number {
  return cards.filter((c) => c.status === 'awaiting').length;
}

/** Remove a plan from the tray (after the decision is dispatched). */
export function removePlan(id: string): void {
  if (!cards.some((c) => c.id === id)) return;
  cards = cards.filter((c) => c.id !== id);
  scheduleNotify();
}

// ── R2 ‼️導線 (2026-07-03 差戻しv2): キャラクリック → 該当カードを誘目 ──
// 表示だけの層 — 承認フローの挙動 (jcPlanDecision) は無改変。
let highlightMemberId: string | null = null;
let highlightUntil = 0;

/** ‼️ のキャラをクリックした member の awaiting カードを一定時間ハイライト */
export function flashPlansForMember(memberId: string): void {
  highlightMemberId = memberId;
  highlightUntil = Date.now() + 3000;
  scheduleNotify();
}

/** 現在ハイライト中の member (期限切れは null) */
export function getPlanHighlightMemberId(): string | null {
  if (!highlightMemberId || Date.now() > highlightUntil) return null;
  return highlightMemberId;
}

/** Subscribe to store changes. Returns unsubscribe fn for useEffect cleanup. */
export function subscribePlans(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
