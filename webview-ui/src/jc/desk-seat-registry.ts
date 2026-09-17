/**
 * Stable member-desk → chair UID aliases. The layout sync resolves these UIDs
 * against the currently loaded furniture, so editor moves do not break members' seats.
 */
export const COMPACT_DESK_SEAT_UIDS: Record<string, string> = {
  'exec-desk-sec': 'exec-bench-01',
  'exec-desk-pm': 'exec-bench-03',
  'dev-desk-01': 'eng-bench-01',
  'dev-desk-07': 'eng-bench-07',
  'mkt-desk-01': 'mkt-bench-01',
  'mkt-desk-02': 'mkt-bench-02',
  'mkt-desk-03': 'mkt-bench-03',
  'mkt-desk-04': 'mkt-bench-04',
  'mkt-desk-12': 'mkt-bench-05',
  'mkt-desk-05': 'mkt-bench-06',
  'res-desk-01': 'res-bench-01',
  'res-desk-02': 'res-bench-02',
  'res-desk-07': 'res-bench-03',
  'res-desk-09': 'res-bench-04',
};

export function resolveCompactDeskSeatPositions(
  furniture: Array<{ uid: string; col: number; row: number }> | undefined,
): Record<string, { col: number; row: number }> {
  const positions: Record<string, { col: number; row: number }> = {};
  for (const [deskId, chairUid] of Object.entries(COMPACT_DESK_SEAT_UIDS)) {
    const chair = furniture?.find((item) => item.uid === chairUid);
    if (chair) positions[deskId] = { col: chair.col, row: chair.row };
  }
  return positions;
}
