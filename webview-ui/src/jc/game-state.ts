// ── Slice1 game state (webview volatile store, DEV-SPEC §4.2) ──────────
// Holds affinity badges + quality gauge fill + company score for the office
// game overlay. Imperative store with a subscribe API (Observer pattern) so the
// React toast/HUD can react without polling. The canvas overlay reads synchronous
// getters each frame and interpolates the gauge locally.
//
// Speed/score multipliers are NOT redefined here — they are imported from the
// single source of truth in the extension-side constants, mirrored below.

/** Affinity tier: great=◎ / ok=△ / bad=✗ (mirror of affinity-constants.ts). */
export type GameTier = 'great' | 'ok' | 'bad';

export const TIER_GLYPH: Record<GameTier, string> = {
  great: '◎',
  ok: '△',
  bad: '✗',
};

// Mirror of src/jc/affinity-constants.ts (kept in sync — same numbers).
const T0_SEC = 60;
const BASE_RATE = 100 / T0_SEC;
const SPEED_MUL: Record<GameTier, number> = { great: 1.5, ok: 1.0, bad: 0.6 };

/** Gauge fill rate (units/sec) for a tier — the AC-1 visualization point. */
export function gaugeRate(tier: GameTier): number {
  return BASE_RATE * SPEED_MUL[tier];
}

/** Seconds of no progress_check before the gauge auto-stalls (mirror STALL_SEC). */
const STALL_SEC = 90;

interface MemberGame {
  tier: GameTier;
  fit: number;
  label: string;
  /** 0..100 gauge fill. Only meaningful while running. */
  gaugeValue: number;
  ratePerSec: number;
  running: boolean;
  stuck: boolean;
  /** ms timestamp of last interpolation tick (for local fill). */
  lastTick: number;
  /** ms timestamp of last poke (progress_check) or start; drives auto-stall. */
  lastPokeAt: number;
}

const memberGame = new Map<string, MemberGame>();

let companyScore = 0;
let todayCount = 0;
let lastDelta = 0;

// ── T10: affinity preview (Owner hovers a picked card over a member) ──
let previewMemberId: string | null = null;
let previewTier: GameTier | null = null;
export function gameSetPreview(memberId: string | null, tier: GameTier | null): void {
  if (previewMemberId === memberId && previewTier === tier) return;
  previewMemberId = memberId;
  previewTier = tier;
  // No notify: read by the canvas overlay each frame, not by React.
}
export function gameGetPreview(): { memberId: string; tier: GameTier } | null {
  return previewMemberId && previewTier ? { memberId: previewMemberId, tier: previewTier } : null;
}

// ── Toast queue (React consumes) ──
export interface ToastEntry {
  id: number;
  memberName: string;
  tier: GameTier;
  delta: number;
  todayCount: number;
}
let toastSeq = 0;
let currentToast: ToastEntry | null = null;

// ── Subscribe API (Observer, see imperative-store-subscribe-pattern skill) ──
const listeners = new Set<() => void>();
let pendingNotify = false;

function scheduleGameNotify(): void {
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
        console.error('[game-state] listener error:', e);
      }
    }
  });
}

/** Subscribe to game-state changes. Returns unsubscribe fn for useEffect cleanup. */
export function subscribeGame(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ── Mutators (called from useExtensionMessages dispatch) ──

export function gameSetFitBadge(
  memberId: string,
  tier: GameTier,
  fit: number,
  label: string,
): void {
  const g = memberGame.get(memberId);
  memberGame.set(memberId, {
    tier,
    fit,
    label,
    gaugeValue: g?.gaugeValue ?? 0,
    ratePerSec: gaugeRate(tier),
    running: g?.running ?? false,
    stuck: g?.stuck ?? false,
    lastTick: Date.now(),
    lastPokeAt: g?.lastPokeAt ?? Date.now(),
  });
  scheduleGameNotify();
}

export function gameStartGauge(memberId: string, tier: GameTier): void {
  const g = memberGame.get(memberId);
  memberGame.set(memberId, {
    tier,
    fit: g?.fit ?? (tier === 'great' ? 2 : tier === 'bad' ? 0 : 1),
    label: g?.label ?? '',
    gaugeValue: 0,
    ratePerSec: gaugeRate(tier),
    running: true,
    stuck: false,
    lastTick: Date.now(),
    lastPokeAt: Date.now(),
  });
  scheduleGameNotify();
}

export function gameStopGauge(memberId: string): void {
  const g = memberGame.get(memberId);
  if (g) {
    g.running = false;
    g.gaugeValue = 100;
    scheduleGameNotify();
  }
}

export function gameSetStuck(memberId: string, stuck: boolean): void {
  const g = memberGame.get(memberId);
  if (g) {
    g.stuck = stuck;
    if (!stuck) g.lastPokeAt = Date.now(); // poke resets the stall timer
    scheduleGameNotify();
  }
}

export function gameClearMember(memberId: string): void {
  if (memberGame.delete(memberId)) scheduleGameNotify();
}

export function gameSetCompanyScore(
  total: number,
  delta: number,
  count: number,
  memberName: string,
  tier: GameTier,
): void {
  companyScore = total;
  lastDelta = delta;
  todayCount = count;
  currentToast = { id: ++toastSeq, memberName, tier, delta, todayCount: count };
  scheduleGameNotify();
}

// ── Getters (overlay reads synchronously per frame) ──

/**
 * Interpolate the gauge locally for smooth fill between backend ticks.
 * Called each frame by the overlay. Advances running gauges by elapsed × rate.
 */
export function gameTickGauges(): void {
  const now = Date.now();
  for (const g of memberGame.values()) {
    if (!g.running || g.gaugeValue >= 100) continue;
    // T8: auto-stall after STALL_SEC with no poke (progress_check).
    if (!g.stuck && now - g.lastPokeAt > STALL_SEC * 1000) {
      g.stuck = true;
    }
    const dt = (now - g.lastTick) / 1000;
    g.lastTick = now;
    const rate = g.stuck ? g.ratePerSec * 0.5 : g.ratePerSec;
    g.gaugeValue = Math.min(100, g.gaugeValue + dt * rate);
  }
  // No notify here — overlay reads directly; React HUD does not need per-frame.
}

export function gameGetMember(memberId: string): Readonly<MemberGame> | undefined {
  return memberGame.get(memberId);
}

export function gameGetCompanyScore(): number {
  return companyScore;
}
export function gameGetTodayCount(): number {
  return todayCount;
}
export function gameGetLastDelta(): number {
  return lastDelta;
}
export function gameGetCurrentToast(): ToastEntry | null {
  return currentToast;
}
export function gameClearToast(id: number): void {
  if (currentToast && currentToast.id === id) {
    currentToast = null;
    scheduleGameNotify();
  }
}
