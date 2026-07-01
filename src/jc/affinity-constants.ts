// ── Affinity / Quality Gauge shared constants (DEV-SPEC §5 / §4.2) ──────
// SINGLE SOURCE OF TRUTH for the speed/score multipliers. Both the extension
// backend (affinity.ts, score gain) and the webview overlay (gauge fill) import
// these from here — the frontend must NOT hold its own copy (DEV-SPEC §4.2).
//
// The ★hard condition (AC-1): a ◎ (great) and a ✗ (bad) placement of the SAME
// task must differ in BOTH gauge fill speed and company score gain. The numbers
// below make that difference deterministic (ratio 2.5, positive score delta 7).

/** Affinity tier: great=◎ / ok=△ / bad=✗ */
export type AffinityTier = 'great' | 'ok' | 'bad';

/** fit integer 0/1/2 → tier */
export function fitToTier(fit: number): AffinityTier {
  if (fit >= 2) return 'great';
  if (fit <= 0) return 'bad';
  return 'ok';
}

/** ◎/△/✗ display glyph */
export const TIER_GLYPH: Record<AffinityTier, string> = {
  great: '◎',
  ok: '△',
  bad: '✗',
};

/** Speed multiplier by tier (gauge fill rate). ◎ fills 2.5× faster than ✗. */
export const SPEED_MUL: Record<AffinityTier, number> = {
  great: 1.5,
  ok: 1.0,
  bad: 0.6,
};

/** Score multiplier by tier (company score gain). */
export const SCORE_MUL: Record<AffinityTier, number> = {
  great: 1.5,
  ok: 1.0,
  bad: 0.6,
};

/** Base seconds to fill the gauge at △ (mSpeed=1.0). ◎=40s, △=60s, ✗=100s. */
export const T0_SEC = 60;

/** Base gauge units per second at △ ( = 100 / T0_SEC ). */
export const BASE_RATE = 100 / T0_SEC;

/** Base company-score points before multipliers (DEV-SPEC §5.4). ◎=12, △=8, ✗=5. */
export const BASE_POINTS = 8;

/** Priority multiplier by TaskDefinition.priority (0=P0 … 4=P4). */
export const PRIORITY_MUL: Record<number, number> = {
  0: 1.5, // P0
  1: 1.5, // P1
  2: 1.2, // P2
  3: 1.0, // P3
  4: 0.8, // P4
};

/** Seconds of no progress_check before the gauge stalls (DEV-SPEC §5.3). */
export const STALL_SEC = 90;

/** Speed penalty applied while stalled; poke restores to 1.0. */
export const STALL_MUL = 0.5;

/**
 * Company score gain for one completed task (DEV-SPEC §5.4).
 * hofBonus defaults to 1 in the core layer (前倒し層 GO で >1)。
 */
export function scoreGain(tier: AffinityTier, priority: number, hofBonus = 1): number {
  const pm = PRIORITY_MUL[priority] ?? 1.0;
  return Math.round(BASE_POINTS * SCORE_MUL[tier] * pm * hofBonus);
}

/** Gauge fill rate (units/sec) for a tier. Used by the webview overlay interpolation. */
export function gaugeRate(tier: AffinityTier): number {
  return BASE_RATE * SPEED_MUL[tier];
}
