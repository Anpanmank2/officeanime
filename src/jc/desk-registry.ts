// ── Just Curious Virtual Office — Desk Registry ─────────────────
// Maps every member to a physical desk position in the office grid.
// Grid: 26 cols × 24 rows (TILE_SIZE=16 → 416×384 px)
// Seat positions must match the CUSHIONED_BENCH uid+col+row in default-layout-3.json.

import type { DeskEntry } from './types.js';

/**
 * Office Layout (26×24 grid):
 *
 * Row 0:       Void
 * Row 1:       Wall (top)
 * Rows 2-5:    Exec Area (left) + Entrance/Poker Table (center) + Break Zone (right)
 * Row 6:       Divider wall (doorways at cols 5-6, 12-13, 23-24)
 * Rows 7-13:   Dev Zone (left) + Marketing (right)
 * Row 14:      Divider wall (doorways at cols 3-4, 23-24)
 * Rows 15-21:  Research Lab (left) + Ops Hub (right)
 * Row 22:      Wall (bottom)
 * Row 23:      Void
 */

// Direction constants matching fork's Direction enum
const DOWN = 0;
const LEFT = 1;
const RIGHT = 2;
const UP = 3;

export const DESK_REGISTRY: DeskEntry[] = [
  // ═══════════════════════════════════════════════════
  // Executive — Exec Zone (cols 8-16, rows 2-5)
  // Permanent residents: Secretary and PM
  // ═══════════════════════════════════════════════════
  {
    deskId: 'exec-desk-sec',
    memberId: 'exec-sec',
    zone: 'exec',
    seatCol: 8,
    seatRow: 4,
    facingDir: UP,
    nameplate: '秘書',
    nameplateEn: 'Secretary',
  },
  {
    deskId: 'exec-desk-pm',
    memberId: 'eng-04',
    zone: 'exec',
    seatCol: 12,
    seatRow: 4,
    facingDir: UP,
    nameplate: '山本 真帆',
    nameplateEn: 'M.Yamamoto',
  },

  // ═══════════════════════════════════════════════════
  // Marketing — Marketing Zone (cols 1-12, rows 6-13)
  // ═══════════════════════════════════════════════════
  {
    deskId: 'mkt-desk-01',
    memberId: 'mkt-01',
    zone: 'marketing',
    seatCol: 2,
    seatRow: 8,
    facingDir: UP,
    nameplate: '黒田 涼',
    nameplateEn: 'R.Kuroda',
  },
  {
    deskId: 'mkt-desk-02',
    memberId: 'mkt-02',
    zone: 'marketing',
    seatCol: 4,
    seatRow: 8,
    facingDir: UP,
    nameplate: '清水 夏希',
    nameplateEn: 'N.Shimizu',
  },
  {
    deskId: 'mkt-desk-03',
    memberId: 'mkt-03',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 8,
    facingDir: UP,
    nameplate: 'トマス・ベガ',
    nameplateEn: 'T.Vega',
  },
  {
    deskId: 'mkt-desk-04',
    memberId: 'mkt-04',
    zone: 'marketing',
    seatCol: 8,
    seatRow: 8,
    facingDir: UP,
    nameplate: 'サーシャ・ブレナン',
    nameplateEn: 'S.Brennan',
  },
  {
    deskId: 'mkt-desk-05',
    memberId: 'mkt-05',
    zone: 'marketing',
    seatCol: 10,
    seatRow: 8,
    facingDir: UP,
    nameplate: '足立 賢治',
    nameplateEn: 'K.Adachi',
  },
  {
    deskId: 'mkt-desk-06',
    memberId: 'mkt-06',
    zone: 'marketing',
    seatCol: 2,
    seatRow: 12,
    facingDir: UP,
    nameplate: '高橋 里奈',
    nameplateEn: 'R.Takahashi',
  },
  {
    deskId: 'mkt-desk-07',
    memberId: 'mkt-07',
    zone: 'marketing',
    seatCol: 4,
    seatRow: 12,
    facingDir: UP,
    nameplate: '谷口 芽依',
    nameplateEn: 'M.Taniguchi',
  },
  {
    deskId: 'mkt-desk-08',
    memberId: 'mkt-08',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 12,
    facingDir: UP,
    nameplate: 'ジェイク・フローレス＝太田',
    nameplateEn: 'J.Flores-Ota',
  },
  {
    deskId: 'mkt-desk-09',
    memberId: 'mkt-09',
    zone: 'marketing',
    seatCol: 8,
    seatRow: 12,
    facingDir: UP,
    nameplate: '北川 花',
    nameplateEn: 'H.Kitagawa',
  },
  {
    deskId: 'mkt-desk-10',
    memberId: 'mkt-10',
    zone: 'marketing',
    seatCol: 10,
    seatRow: 12,
    facingDir: UP,
    nameplate: '森 大地',
    nameplateEn: 'D.Mori',
  },
  {
    deskId: 'mkt-desk-11',
    memberId: 'mkt-11',
    zone: 'marketing',
    seatCol: 2,
    seatRow: 10,
    facingDir: LEFT,
    nameplate: 'レナ・パク',
    nameplateEn: 'L.Park',
  },
  {
    deskId: 'mkt-desk-12',
    memberId: 'mkt-12',
    zone: 'marketing',
    seatCol: 11,
    seatRow: 10,
    facingDir: RIGHT,
    nameplate: 'ラングレー葵',
    nameplateEn: 'A.Langley',
  },

  // ═══════════════════════════════════════════════════
  // Research — Research Zone (cols 13-24, rows 6-13)
  // ═══════════════════════════════════════════════════
  {
    deskId: 'res-desk-01',
    memberId: 'res-01',
    zone: 'research',
    seatCol: 14,
    seatRow: 9,
    facingDir: UP,
    nameplate: '古賀 春樹',
    nameplateEn: 'H.Koga',
  },
  {
    deskId: 'res-desk-02',
    memberId: 'res-02',
    zone: 'research',
    seatCol: 16,
    seatRow: 9,
    facingDir: UP,
    nameplate: 'Sora Miyake',
    nameplateEn: 'S.Miyake',
  },
  {
    deskId: 'res-desk-03',
    memberId: 'res-03',
    zone: 'research',
    seatCol: 18,
    seatRow: 9,
    facingDir: UP,
    nameplate: 'Marina Ríos-Delgado',
    nameplateEn: 'M.Rios',
  },
  {
    deskId: 'res-desk-04',
    memberId: 'res-04',
    zone: 'research',
    seatCol: 20,
    seatRow: 9,
    facingDir: UP,
    nameplate: 'Kai Nakamura-Chen',
    nameplateEn: 'K.Nakamura',
  },
  {
    deskId: 'res-desk-05',
    memberId: 'res-05',
    zone: 'research',
    seatCol: 14,
    seatRow: 12,
    facingDir: UP,
    nameplate: 'Dr. Priya Okonkwo-Singh',
    nameplateEn: 'P.Okonkwo',
  },
  {
    deskId: 'res-desk-06',
    memberId: 'res-06',
    zone: 'research',
    seatCol: 16,
    seatRow: 12,
    facingDir: UP,
    nameplate: '島田 悠斗',
    nameplateEn: 'Y.Shimada',
  },
  {
    deskId: 'res-desk-07',
    memberId: 'res-07',
    zone: 'research',
    seatCol: 18,
    seatRow: 12,
    facingDir: UP,
    nameplate: 'マーカス Wei-Tanaka',
    nameplateEn: 'M.Wei-Tanaka',
  },
  {
    deskId: 'res-desk-08',
    memberId: 'res-08',
    zone: 'research',
    seatCol: 20,
    seatRow: 12,
    facingDir: UP,
    nameplate: '望月 綾音',
    nameplateEn: 'A.Mochizuki',
  },
  {
    deskId: 'res-desk-09',
    memberId: 'res-09',
    zone: 'research',
    seatCol: 22,
    seatRow: 12,
    facingDir: UP,
    nameplate: '藤沢 蓮',
    nameplateEn: 'R.Fujisawa',
  },

  // ═══════════════════════════════════════════════════
  // Engineering — Dev Zone (cols 1-12, rows 15-21)
  // ═══════════════════════════════════════════════════
  {
    deskId: 'dev-desk-01',
    memberId: 'eng-01',
    zone: 'dev',
    seatCol: 3,
    seatRow: 17,
    facingDir: UP,
    nameplate: '田中 健太',
    nameplateEn: 'K.Tanaka',
  },
  {
    deskId: 'dev-desk-02',
    memberId: 'eng-02',
    zone: 'dev',
    seatCol: 5,
    seatRow: 17,
    facingDir: UP,
    nameplate: '佐藤 涼',
    nameplateEn: 'R.Sato',
  },
  {
    deskId: 'dev-desk-03',
    memberId: 'eng-03',
    zone: 'dev',
    seatCol: 7,
    seatRow: 17,
    facingDir: UP,
    nameplate: '中村 陽菜',
    nameplateEn: 'H.Nakamura',
  },
  {
    deskId: 'dev-desk-05',
    memberId: 'eng-05',
    zone: 'dev',
    seatCol: 3,
    seatRow: 20,
    facingDir: UP,
    nameplate: '藤井 蓮',
    nameplateEn: 'R.Fujii',
  },
  {
    deskId: 'dev-desk-06',
    memberId: 'eng-06',
    zone: 'dev',
    seatCol: 5,
    seatRow: 20,
    facingDir: UP,
    nameplate: '黒田 翔太',
    nameplateEn: 'S.Kuroda',
  },
];

/** Entrance tile position (spawn/despawn point) — center of atrium floor */
export const ENTRANCE_TILE = { col: 12, row: 6 };

/** Poker Table seats — meeting gathering point in Poker Room around (17,17) */
export const POKER_TABLE_SEATS = [
  { col: 16, row: 17 },
  { col: 18, row: 17 },
  { col: 17, row: 16 },
  { col: 17, row: 18 },
];

/** Exec display positions (icon-only, no character) — exec zone rows 2-5 */
export const EXEC_POSITIONS = [
  { id: 'exec-01', col: 10, row: 3, label: 'Owner/COO' },
  { id: 'exec-pm', col: 12, row: 3, label: 'PM' },
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
