// ── Just Curious Virtual Office — Desk Registry ─────────────────
// Maps every member to a physical desk position in the office grid.
// Grid: 24 cols × 20 rows (TILE_SIZE=16 → 384×320 px)

import type { DeskEntry } from './types.js';

/**
 * Office Layout (24×20 grid):
 *
 * Rows 0-1:   Wall (top border)
 * Rows 2-5:   Entrance (left) + Exec Area (right)
 * Rows 6-7:   Poker Table (left) + Break Zone (center) + Dev Zone top (right)
 * Rows 8-11:  Poker/Break (left) + Dev Zone (right, 6 desks)
 * Rows 12-17: Marketing Zone (left, 11 desks) + Research Lab (right, 6 desks)
 * Rows 18-19: Ops Hub (full width)
 */

// Direction constants matching fork's Direction enum
const DOWN = 0;
const LEFT = 1;
const RIGHT = 2;
const UP = 3;

export const DESK_REGISTRY: DeskEntry[] = [
  // ═══════════════════════════════════════════════════
  // Engineering — Dev Zone (cols 14-22, rows 6-11)
  // 3 rows of 2 desks each, facing their desks
  // ═══════════════════════════════════════════════════
  {
    deskId: 'dev-desk-01',
    memberId: 'eng-01',
    zone: 'dev',
    seatCol: 15,
    seatRow: 7,
    facingDir: UP,
    nameplate: '田中 健太',
    nameplateEn: 'K.Tanaka',
  },
  {
    deskId: 'dev-desk-02',
    memberId: 'eng-02',
    zone: 'dev',
    seatCol: 18,
    seatRow: 7,
    facingDir: UP,
    nameplate: '佐藤 涼',
    nameplateEn: 'R.Sato',
  },
  {
    deskId: 'dev-desk-03',
    memberId: 'eng-03',
    zone: 'dev',
    seatCol: 15,
    seatRow: 9,
    facingDir: UP,
    nameplate: '中村 陽菜',
    nameplateEn: 'H.Nakamura',
  },
  {
    deskId: 'dev-desk-04',
    memberId: 'eng-04',
    zone: 'dev',
    seatCol: 18,
    seatRow: 9,
    facingDir: UP,
    nameplate: '山本 真帆',
    nameplateEn: 'M.Yamamoto',
  },
  {
    deskId: 'dev-desk-05',
    memberId: 'eng-05',
    zone: 'dev',
    seatCol: 15,
    seatRow: 11,
    facingDir: UP,
    nameplate: '藤井 蓮',
    nameplateEn: 'R.Fujii',
  },
  {
    deskId: 'dev-desk-06',
    memberId: 'eng-06',
    zone: 'dev',
    seatCol: 18,
    seatRow: 11,
    facingDir: UP,
    nameplate: '黒田 翔太',
    nameplateEn: 'S.Kuroda',
  },

  // ═══════════════════════════════════════════════════
  // Marketing — Marketing Zone (cols 1-12, rows 12-17)
  // Director front-center, others in rows behind
  // ═══════════════════════════════════════════════════
  {
    deskId: 'mkt-desk-01',
    memberId: 'mkt-01',
    zone: 'marketing',
    seatCol: 3,
    seatRow: 13,
    facingDir: UP,
    nameplate: '黒田 涼',
    nameplateEn: 'R.Kuroda',
  },
  {
    deskId: 'mkt-desk-02',
    memberId: 'mkt-02',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 13,
    facingDir: UP,
    nameplate: '伊藤 美咲',
    nameplateEn: 'M.Ito',
  },
  {
    deskId: 'mkt-desk-03',
    memberId: 'mkt-03',
    zone: 'marketing',
    seatCol: 9,
    seatRow: 13,
    facingDir: UP,
    nameplate: '渡辺 蓮',
    nameplateEn: 'R.Watanabe',
  },
  {
    deskId: 'mkt-desk-04',
    memberId: 'mkt-04',
    zone: 'marketing',
    seatCol: 3,
    seatRow: 15,
    facingDir: UP,
    nameplate: '小林 萌',
    nameplateEn: 'M.Kobayashi',
  },
  {
    deskId: 'mkt-desk-05',
    memberId: 'mkt-05',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 15,
    facingDir: UP,
    nameplate: '加藤 翼',
    nameplateEn: 'T.Kato',
  },
  {
    deskId: 'mkt-desk-06',
    memberId: 'mkt-06',
    zone: 'marketing',
    seatCol: 9,
    seatRow: 15,
    facingDir: UP,
    nameplate: '高橋 里奈',
    nameplateEn: 'R.Takahashi',
  },
  {
    deskId: 'mkt-desk-07',
    memberId: 'mkt-07',
    zone: 'marketing',
    seatCol: 3,
    seatRow: 17,
    facingDir: UP,
    nameplate: '松本 芽衣',
    nameplateEn: 'M.Matsumoto',
  },
  {
    deskId: 'mkt-desk-08',
    memberId: 'mkt-08',
    zone: 'marketing',
    seatCol: 6,
    seatRow: 17,
    facingDir: UP,
    nameplate: '井上 花',
    nameplateEn: 'H.Inoue',
  },
  {
    deskId: 'mkt-desk-09',
    memberId: 'mkt-09',
    zone: 'marketing',
    seatCol: 9,
    seatRow: 17,
    facingDir: UP,
    nameplate: '木村 翔',
    nameplateEn: 'S.Kimura',
  },
  {
    deskId: 'mkt-desk-10',
    memberId: 'mkt-10',
    zone: 'marketing',
    seatCol: 11,
    seatRow: 15,
    facingDir: UP,
    nameplate: '林 優衣',
    nameplateEn: 'Y.Hayashi',
  },
  {
    deskId: 'mkt-desk-11',
    memberId: 'mkt-11',
    zone: 'marketing',
    seatCol: 11,
    seatRow: 17,
    facingDir: UP,
    nameplate: '清水 大地',
    nameplateEn: 'D.Shimizu',
  },

  // ═══════════════════════════════════════════════════
  // Research — Research Lab (cols 14-22, rows 12-17)
  // Walled off section, 6 desks
  // ═══════════════════════════════════════════════════
  {
    deskId: 'res-desk-01',
    memberId: 'res-01',
    zone: 'research',
    seatCol: 16,
    seatRow: 13,
    facingDir: UP,
    nameplate: 'Owner',
    nameplateEn: 'Owner',
  },
  {
    deskId: 'res-desk-02',
    memberId: 'res-02',
    zone: 'research',
    seatCol: 19,
    seatRow: 13,
    facingDir: UP,
    nameplate: '田村 結月',
    nameplateEn: 'Y.Tamura',
  },
  {
    deskId: 'res-desk-03',
    memberId: 'res-03',
    zone: 'research',
    seatCol: 16,
    seatRow: 15,
    facingDir: UP,
    nameplate: '森 颯太',
    nameplateEn: 'S.Mori',
  },
  {
    deskId: 'res-desk-04',
    memberId: 'res-04',
    zone: 'research',
    seatCol: 19,
    seatRow: 15,
    facingDir: UP,
    nameplate: '山口 凛',
    nameplateEn: 'R.Yamaguchi',
  },
  {
    deskId: 'res-desk-05',
    memberId: 'res-05',
    zone: 'research',
    seatCol: 16,
    seatRow: 17,
    facingDir: UP,
    nameplate: '中島 悠人',
    nameplateEn: 'Y.Nakajima',
  },
  {
    deskId: 'res-desk-06',
    memberId: 'res-06',
    zone: 'research',
    seatCol: 19,
    seatRow: 17,
    facingDir: UP,
    nameplate: '空席',
    nameplateEn: 'Vacant',
  },
];

/** Entrance tile position (spawn/despawn point) */
export const ENTRANCE_TILE = { col: 2, row: 3 };

/** Poker Table center tiles (meeting point) */
export const POKER_TABLE_SEATS = [
  { col: 3, row: 8 },
  { col: 5, row: 8 },
  { col: 3, row: 9 },
  { col: 5, row: 9 },
  { col: 4, row: 7 },
  { col: 4, row: 10 },
];

/** Exec display positions (icon-only, no character) */
export const EXEC_POSITIONS = [
  { id: 'exec-01', col: 14, row: 3, label: 'Owner/COO' },
  { id: 'exec-02', col: 17, row: 3, label: 'CEO' },
  { id: 'exec-03', col: 20, row: 3, label: '秘書' },
  { id: 'exec-04', col: 22, row: 3, label: 'PM' },
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
