// ── Living-loop routing: Owner delegates to the SECRETARY or a DEPARTMENT ──
// (living-loop rethink §1). The Owner no longer picks an individual member — no
// one should have to remember who is who. Instead a picked task card is dropped
// on:
//   • the SECRETARY (exec zone)  → best-◎ member across the WHOLE company
//   • a DEPARTMENT zone          → best-◎ member WITHIN that department
// The secretary/department then auto-selects the most suitable (◎) member. This
// module owns the board hit-test (click → scope) and the auto-selection.

import { previewFit } from './affinity-preview.js';
import { jcGetAllMembers } from './jc-state.js';

/** A resolved delegation target: whom the Owner is handing the card to. */
export type RoutingScope = 'secretary' | 'engineering' | 'marketing' | 'research';

export interface RoutingTarget {
  scope: RoutingScope;
  /** Zone label shown to the Owner (e.g. "秘書", "Engineering"). */
  label: string;
}

// ── Board zones (tile rects), mirror of jc-state DESK_POSITIONS layout ──
// The secretary desk is at (8,4); dept zones are the big member clusters.
// A generous secretary rect makes the exec desk an easy drop target.
const SECRETARY_RECT = { c0: 7, c1: 13, r0: 2, r1: 5 }; // exec desks (sec + PM)
const DEPT_RECTS: Array<{
  scope: RoutingScope;
  label: string;
  rect: { c0: number; c1: number; r0: number; r1: number };
}> = [
  { scope: 'marketing', label: 'Marketing', rect: { c0: 1, c1: 12, r0: 6, r1: 13 } },
  { scope: 'research', label: 'Research', rect: { c0: 13, c1: 24, r0: 6, r1: 13 } },
  { scope: 'engineering', label: 'Engineering', rect: { c0: 1, c1: 12, r0: 15, r1: 21 } },
];

function inRect(
  col: number,
  row: number,
  r: { c0: number; c1: number; r0: number; r1: number },
): boolean {
  return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1;
}

/**
 * Hit-test a board click → routing scope. Secretary desk wins (checked first),
 * then department zones. Returns null when the click is outside any drop target.
 */
export function resolveRoutingTarget(col: number, row: number): RoutingTarget | null {
  if (inRect(col, row, SECRETARY_RECT)) return { scope: 'secretary', label: '秘書' };
  for (const d of DEPT_RECTS) {
    if (inRect(col, row, d.rect)) return { scope: d.scope, label: d.label };
  }
  return null;
}

/** Candidate member IDs for a routing scope (secretary = whole company). */
function candidatesFor(scope: RoutingScope): string[] {
  const members = jcGetAllMembers();
  return members
    .filter((m) => {
      if (m.department === 'exec') return false; // don't self-assign to the secretary
      if (scope === 'secretary') return true;
      return m.department === scope;
    })
    .map((m) => m.id);
}

export interface PickedMember {
  memberId: string;
  tier: 'great' | 'ok' | 'bad';
  fit: number;
}

/**
 * Auto-select the most suitable member for a task within a routing scope.
 * Highest fit wins (◎ > △ > ✗); ties broken deterministically by member-id so
 * the same task always routes the same way (reproducible screenshots/replays).
 * Returns null only when the scope has no candidates (config not loaded).
 */
export function pickBestMember(task: string, scope: RoutingScope): PickedMember | null {
  const ids = candidatesFor(scope);
  if (ids.length === 0) return null;
  let best: PickedMember | null = null;
  for (const id of [...ids].sort()) {
    const { fit, tier } = previewFit(task, id);
    if (!best || fit > best.fit) best = { memberId: id, tier, fit };
  }
  return best;
}
