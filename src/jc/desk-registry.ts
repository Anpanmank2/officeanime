// ── Just Curious Virtual Office — Desk Registry ─────────────────
// Maps every member to a physical desk position in the office grid.
// Grid: 24 cols × 20 rows (TILE_SIZE=16 → 384×320 px)
// Seat positions must match the CUSHIONED_BENCH uid+col+row in default-layout-2.json.

import type { DeskEntry } from './types.js';

/**
 * Office Layout (24×20 grid):
 *
 * Row 0:       Void
 * Row 1:       Wall (top)
 * Rows 2-4:    Entrance (left) + Exec Area (right)
 * Row 5:       Divider wall (doorways at cols 5-6, 17-18)
 * Rows 6-10:   Break Zone (left) + Engineering (right)
 * Row 11:      Divider wall (doorways at cols 5-6, 17-18)
 * Rows 12-18:  Marketing (left) + Research (right)
 * Row 19:      Wall (bottom)
 */

// Direction constants matching fork's Direction enum
const DOWN = 0;
const LEFT = 1;
const RIGHT = 2;
const UP = 3;

export const DESK_REGISTRY: DeskEntry[] = [
  // ═══════════════════════════════════════════════════
  // Engineering — Dev Zone (cols 13-22, rows 6-10)
  // Row A: desks at row 6, chairs at row 8
  // Row B: desks at row 8 (staggered +1 col), chairs at row 10
  // ═══════════════════════════════════════════════════
  {
    deskId: 'dev-desk-01',
    memberId: 'eng-01',
    zone: 'dev',
    seatCol: 14,
    seatRow: 8,
    facingDir: UP,
    nameplate: '田中 健太',
    nameplateEn: 'K.Tanaka',
  },
  {
    deskId: 'dev-desk-02',
    memberId: 'eng-02',
    zone: 'dev',
    seatCol: 17,
    seatRow: 8,
    facingDir: UP,
    nameplate: '佐藤 涼',
    nameplateEn: 'R.Sato',
  },
  {
    deskId: 'dev-desk-03',
    memberId: 'eng-03',
    zone: 'dev',
    seatCol: 20,
    seatRow: 8,
    facingDir: UP,
    nameplate: '中村 陽菜',
    nameplateEn: 'H.Nakamura',
  },
  {
    deskId: 'dev-desk-04',
    memberId: 'eng-04',
    zone: 'dev',
    seatCol: 15,
    seatRow: 10,
    facingDir: UP,
    nameplate: '山本 真帆',
    nameplateEn: 'M.Yamamoto',
  },
  {
    deskId: 'dev-desk-05',
    memberId: 'eng-05',
    zone: 'dev',
    seatCol: 18,
    seatRow: 10,
    facingDir: UP,
    nameplate: '藤井 蓮',
    nameplateEn: 'R.Fujii',
  },
  {
    deskId: 'dev-desk-06',
    memberId: 'eng-06',
    zone: 'dev',
    seatCol: 21,
    seatRow: 10,
    facingDir: UP,
    nameplate: '黒田 翔太',
    nameplateEn: 'S.Kuroda',
  },

  // ═══════════════════════════════════════════════════
  // Marketing — Marketing Zone (cols 1-11, rows 12-18)
  // Row A: desks at row 12, chairs at row 14
  // Row B: desks at row 15, chairs at row 17
  // + 3 standalone benches at row 14
  // ═══════════════════════════════════════════════════
  {
    deskId: 'mkt-desk-01',
    memberId: 'mkt-01',
    zone: 'marketing',
    seatCol: 1,
    seatRow: 14,
    facingDir: UP,
    nameplate: '黒田 涼',
    nameplateEn: 'R.Kuroda',
  },
  {
    deskId: 'mkt-desk-02',
    memberId: 'mkt-02',
    zone: 'marketing',
    seatCol: 4,
    seatRow: 14,
    facingDir: UP,
    nameplate: '清水 夏希',
    nameplateEn: 'N.Shimizu',
  },
  {
    deskId: 'mkt-desk-03',
    memberId: 'mkt-03',
    zone: 'marketing',
    seatCol: 7,
    seatRow: 14,
    facingDir: UP,
    nameplate: 'トマス・ベガ',
    nameplateEn: 'T.Vega',
  },
  {
    deskId: 'mkt-desk-04',
    memberId: 'mkt-04',
    zone: 'marketing',
    seatCol: 10,
    seatRow: 14,
    facingDir: UP,
    nameplate: 'サーシャ・ブレナン',
    nameplateEn: 'S.Brennan',
  },
  {
    deskId: 'mkt-desk-05',
    memberId: 'mkt-05',
    zone: 'marketing',
    seatCol: 1,
    seatRow: 17,
    facingDir: UP,
    nameplate: '足立 賢治',
    nameplateEn: 'K.Adachi',
  },
  {
    deskId: 'mkt-desk-06',
    memberId: 'mkt-06',
    zone: 'marketing',
    seatCol: 4,
    seatRow: 17,
    facingDir: UP,
    nameplate: '高橋 里奈',
    nameplateEn: 'R.Takahashi',
  },
  {
    deskId: 'mkt-desk-07',
    memberId: 'mkt-07',
    zone: 'marketing',
    seatCol: 7,
    seatRow: 17,
    facingDir: UP,
    nameplate: '谷口 芽依',
    nameplateEn: 'M.Taniguchi',
  },
  {
    deskId: 'mkt-desk-08',
    memberId: 'mkt-08',
    zone: 'marketing',
    seatCol: 10,
    seatRow: 17,
    facingDir: UP,
    nameplate: 'ジェイク・フローレス＝太田',
    nameplateEn: 'J.Flores-Ota',
  },
  {
    deskId: 'mkt-desk-09',
    memberId: 'mkt-09',
    zone: 'marketing',
    seatCol: 3,
    seatRow: 14,
    facingDir: DOWN,
    nameplate: '北川 花',
    nameplateEn: 'H.Kitagawa',
  },
  {
    deskId: 'mkt-desk-10',
    memberId: 'mkt-10',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 14,
    facingDir: DOWN,
    nameplate: '森 大地',
    nameplateEn: 'D.Mori',
  },
  {
    deskId: 'mkt-desk-11',
    memberId: 'mkt-11',
    zone: 'marketing',
    seatCol: 9,
    seatRow: 14,
    facingDir: DOWN,
    nameplate: 'レナ・パク',
    nameplateEn: 'L.Park',
  },

  // ═══════════════════════════════════════════════════
  // Research — Research Lab (cols 13-22, rows 12-18)
  // Row A: desks at row 12, chairs at row 14
  // Row B: desks at row 15 (staggered), chairs at row 17
  // ═══════════════════════════════════════════════════
  {
    deskId: 'res-desk-01',
    memberId: 'res-01',
    zone: 'research',
    seatCol: 14,
    seatRow: 14,
    facingDir: UP,
    nameplate: 'Owner',
    nameplateEn: 'Owner',
  },
  {
    deskId: 'res-desk-02',
    memberId: 'res-02',
    zone: 'research',
    seatCol: 17,
    seatRow: 14,
    facingDir: UP,
    nameplate: 'Sora Miyake',
    nameplateEn: 'S.Miyake',
  },
  {
    deskId: 'res-desk-03',
    memberId: 'res-03',
    zone: 'research',
    seatCol: 20,
    seatRow: 14,
    facingDir: UP,
    nameplate: 'Marina Ríos-Delgado',
    nameplateEn: 'M.Rios',
  },
  {
    deskId: 'res-desk-04',
    memberId: 'res-04',
    zone: 'research',
    seatCol: 15,
    seatRow: 17,
    facingDir: UP,
    nameplate: 'Kai Nakamura-Chen',
    nameplateEn: 'K.Nakamura',
  },
  {
    deskId: 'res-desk-05',
    memberId: 'res-05',
    zone: 'research',
    seatCol: 18,
    seatRow: 17,
    facingDir: UP,
    nameplate: 'Dr. Priya Okonkwo-Singh',
    nameplateEn: 'P.Okonkwo',
  },
  {
    deskId: 'res-desk-06',
    memberId: 'res-06',
    zone: 'research',
    seatCol: 21,
    seatRow: 17,
    facingDir: UP,
    nameplate: '空席',
    nameplateEn: 'Vacant',
  },
];

/** Entrance tile position (spawn/despawn point) */
export const ENTRANCE_TILE = { col: 5, row: 3 };

/** Poker Table center tiles (meeting point) — in break zone */
export const POKER_TABLE_SEATS = [
  { col: 5, row: 7 },
  { col: 6, row: 7 },
  { col: 5, row: 8 },
  { col: 6, row: 8 },
];

/** Exec display positions (icon-only, no character) */
export const EXEC_POSITIONS = [
  { id: 'exec-01', col: 15, row: 3, label: 'Owner/COO' },
  { id: 'exec-02', col: 17, row: 3, label: 'CEO' },
  { id: 'exec-03', col: 19, row: 3, label: '秘書' },
  { id: 'exec-04', col: 21, row: 3, label: 'PM' },
];

/** Look up a desk entry by member ID */
export function getDeskByMemberId(memberId: string): DeskEntry | undefined {
  return DESK_REGISTRY.find((d) => d.memberId === memberId);
}

/** Look up a desk entry by desk ID */
export function getDeskByDeskId(deskId: string): DeskEntry | undefined {
  return DESK_REGISTRY.find((d) => d.deskId === deskId);
}

/** Get all desks in a specific zone */
export function getDesksByZone(zone: string): DeskEntry[] {
  return DESK_REGISTRY.filter((d) => d.zone === zone);
}
