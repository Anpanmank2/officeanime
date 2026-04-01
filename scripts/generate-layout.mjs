// scripts/generate-layout.mjs
// Generates default-layout-3.json — Just Curious 8-zone office layout
// Grid: 26 cols × 24 rows
//
// Zone arrangement:
//   Top:    Exec (left)   | Entrance+Poker (center) | Break (right)
//   Middle: Dev (left)    | Marketing (right)
//   Bottom: Research (left, restricted entry) | Ops Hub (right)

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COLS = 26;
const ROWS = 24;
const VOID = 255;
const WALL = 0;
const EXEC = 1;
const ENTRANCE = 2; // also poker table area
const BREAK = 3;
const DEV = 4;
const MARKETING = 5;
const RESEARCH = 6;
const OPS = 7;

// Zone colors (Colorize mode: h=hue, s=sat, b=brightness, c=contrast)
const COLORS = {
  [WALL]: { h: 214, s: 30, b: -100, c: -55 },
  [EXEC]: { h: 260, s: 35, b: -35, c: -70 },
  [ENTRANCE]: { h: 30, s: 25, b: -25, c: -65 },
  [BREAK]: { h: 140, s: 30, b: -30, c: -70 },
  [DEV]: { h: 200, s: 38, b: -28, c: -75 },
  [MARKETING]: { h: 25, s: 48, b: -40, c: -85 },
  [RESEARCH]: { h: 270, s: 40, b: -35, c: -70 },
  [OPS]: { h: 210, s: 18, b: -25, c: -60 },
  [VOID]: null,
};

function tileColor(t) {
  return COLORS[t] ?? null;
}

// ── Build tile grid ──────────────────────────────────────────────
const tiles = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === 23) {
      // Top/bottom void
      tiles.push(VOID);
    } else if (r === 1 || r === 22) {
      // Top/bottom wall
      tiles.push(WALL);
    } else if (r >= 2 && r <= 5) {
      // ── Top section: Exec | Entrance+Poker | Break ──
      if (c === 0 || c === 25) tiles.push(WALL);
      else if (c === 7 && (r === 4 || r === 5))
        tiles.push(ENTRANCE); // doorway exec↔poker
      else if (c === 7)
        tiles.push(WALL); // divider exec/poker
      else if (c === 17 && (r === 4 || r === 5))
        tiles.push(BREAK); // doorway poker↔break
      else if (c === 17)
        tiles.push(WALL); // divider poker/break
      else if (c >= 1 && c <= 6) tiles.push(EXEC);
      else if (c >= 8 && c <= 16) tiles.push(ENTRANCE);
      else tiles.push(BREAK); // cols 18-24
    } else if (r === 6) {
      // ── Separator: top → middle ──
      // Doorways: cols 5-6 (exec→dev), cols 12-13 (poker→both), cols 23-24 (break→mkt)
      if (c === 5 || c === 6) tiles.push(DEV);
      else if (c === 12) tiles.push(DEV);
      else if (c === 13) tiles.push(MARKETING);
      else if (c === 23 || c === 24) tiles.push(MARKETING);
      else tiles.push(WALL);
    } else if (r >= 7 && r <= 13) {
      // ── Middle section: Dev | Marketing ──
      if (c === 0 || c === 25) tiles.push(WALL);
      else if (c === 12 && (r === 10 || r === 11))
        tiles.push(DEV); // doorway dev↔mkt
      else if (c === 12)
        tiles.push(WALL); // center divider
      else if (c >= 1 && c <= 11) tiles.push(DEV);
      else tiles.push(MARKETING); // cols 13-24
    } else if (r === 14) {
      // ── Separator: middle → bottom ──
      // Doorways: cols 3-4 (dev→research, restricted), cols 12-13 (dev↔ops), cols 23-24 (mkt→ops)
      if (c === 3 || c === 4) tiles.push(RESEARCH);
      else if (c === 12 || c === 13)
        tiles.push(OPS); // cross-corridor
      else if (c === 23 || c === 24) tiles.push(OPS);
      else tiles.push(WALL);
    } else if (r >= 15 && r <= 21) {
      // ── Bottom section: Research | Ops Hub ──
      if (c === 0 || c === 25) tiles.push(WALL);
      else if (c === 12)
        tiles.push(WALL); // center divider
      else if (c >= 1 && c <= 11) tiles.push(RESEARCH);
      else tiles.push(OPS); // cols 13-24
    } else {
      tiles.push(WALL);
    }
  }
}

const tileColors = tiles.map((t) => tileColor(t));

// ── Furniture ────────────────────────────────────────────────────
let fid = 1;
const furniture = [];

function fuid(prefix) {
  return `${prefix}-${String(fid++).padStart(3, '0')}`;
}

function addDeskStation(col, row, seatUid) {
  furniture.push({ uid: fuid('tbl'), type: 'SMALL_TABLE_FRONT', col, row });
  furniture.push({ uid: seatUid, type: 'CUSHIONED_BENCH', col, row: row + 2 });
  furniture.push({ uid: fuid('pc'), type: 'PC_FRONT_OFF', col, row });
}

// ━━━ DEV ZONE (6 desks, cols 1-11, rows 7-13) ━━━
// Row A: tables at row 7, benches at row 9
addDeskStation(1, 7, 'dev-desk-02'); // eng-02 R.Sato (left)
addDeskStation(4, 7, 'dev-desk-01'); // eng-01 K.Tanaka (center) — Tech Lead
addDeskStation(7, 7, 'dev-desk-03'); // eng-03 H.Nakamura (right)
// Row B: tables at row 10, benches at row 12
addDeskStation(2, 10, 'dev-desk-04'); // eng-04 M.Yamamoto (center-left)
addDeskStation(5, 10, 'dev-desk-05'); // eng-05 R.Fujii (down-left)
addDeskStation(8, 10, 'dev-desk-06'); // eng-06 S.Kuroda (down-right)

// ━━━ MARKETING ZONE (11 desks, cols 13-24, rows 7-13) ━━━
// Row A: 4 desks, tables at row 7, benches at row 9
addDeskStation(14, 7, 'mkt-desk-01'); // mkt-01 R.Kuroda (Director)
addDeskStation(17, 7, 'mkt-desk-02'); // mkt-02 N.Shimizu (Strategy)
addDeskStation(20, 7, 'mkt-desk-03'); // mkt-03 T.Vega (Strategy)
addDeskStation(23, 7, 'mkt-desk-04'); // mkt-04 S.Brennan (Strategy)
// Row B: 4 desks, tables at row 10, benches at row 12
addDeskStation(14, 10, 'mkt-desk-05'); // mkt-05 K.Adachi (Strategy)
addDeskStation(17, 10, 'mkt-desk-06'); // mkt-06 R.Takahashi (Ops)
addDeskStation(20, 10, 'mkt-desk-07'); // mkt-07 M.Taniguchi (Execution)
addDeskStation(23, 10, 'mkt-desk-08'); // mkt-08 J.Flores-Ota (Execution)
// 3 standalone benches (face-to-face with Row A benches)
furniture.push({ uid: 'mkt-desk-09', type: 'CUSHIONED_BENCH', col: 16, row: 9 }); // H.Kitagawa
furniture.push({ uid: 'mkt-desk-10', type: 'CUSHIONED_BENCH', col: 19, row: 9 }); // D.Mori
furniture.push({ uid: 'mkt-desk-11', type: 'CUSHIONED_BENCH', col: 22, row: 9 }); // L.Park

// ━━━ RESEARCH LAB (6 desks, cols 1-11, rows 15-21) ━━━
// Row A: tables at row 15, benches at row 17
addDeskStation(1, 15, 'res-desk-01'); // res-01 Owner/Research Lead (back)
addDeskStation(4, 15, 'res-desk-02'); // res-02 Sora Miyake (left)
addDeskStation(7, 15, 'res-desk-03'); // res-03 Marina Ríos-Delgado (center)
// Row B: tables at row 18, benches at row 20
addDeskStation(2, 18, 'res-desk-04'); // res-04 Kai Nakamura-Chen (right)
addDeskStation(5, 18, 'res-desk-05'); // res-05 Dr. Priya Okonkwo-Singh (right-back)
addDeskStation(8, 18, 'res-desk-06'); // res-06 Vacant

// ━━━ POKER TABLE / MEETING ROOM (cols 8-16, rows 2-5) ━━━
furniture.push({ uid: fuid('fur'), type: 'COFFEE_TABLE', col: 11, row: 3 });
// 6 chairs around the table
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_FRONT', col: 10, row: 2 });
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_FRONT', col: 13, row: 2 });
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_BACK', col: 10, row: 5 });
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_BACK', col: 13, row: 5 });
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_SIDE', col: 9, row: 3 });
furniture.push({ uid: fuid('fur'), type: 'CUSHIONED_CHAIR_SIDE:left', col: 14, row: 3 });
// KPI monitor on wall
furniture.push({ uid: fuid('fur'), type: 'WHITEBOARD', col: 14, row: 0 });

// ━━━ EXEC AREA (cols 1-6, rows 2-5) ━━━
// Exec icons rendered programmatically — just add decorations
furniture.push({ uid: fuid('fur'), type: 'LARGE_PAINTING', col: 2, row: 0 }); // wall art
furniture.push({ uid: fuid('fur'), type: 'CLOCK', col: 5, row: 0 }); // wall clock
furniture.push({ uid: fuid('fur'), type: 'PLANT', col: 1, row: 2 }); // plant
furniture.push({ uid: fuid('fur'), type: 'PLANT_2', col: 6, row: 4 }); // plant

// ━━━ BREAK ZONE (cols 18-24, rows 2-5) ━━━
furniture.push({ uid: fuid('fur'), type: 'SOFA_FRONT', col: 19, row: 2 }); // sofa 1
furniture.push({ uid: fuid('fur'), type: 'SOFA_FRONT', col: 22, row: 2 }); // sofa 2
furniture.push({ uid: fuid('fur'), type: 'COFFEE_TABLE', col: 20, row: 4 }); // coffee area
furniture.push({ uid: fuid('fur'), type: 'COFFEE', col: 20, row: 4 }); // cup on table
furniture.push({ uid: fuid('fur'), type: 'COFFEE', col: 21, row: 4 }); // cup on table
furniture.push({ uid: fuid('fur'), type: 'PLANT', col: 18, row: 2 }); // plant
furniture.push({ uid: fuid('fur'), type: 'CACTUS', col: 24, row: 2 }); // cactus
furniture.push({ uid: fuid('fur'), type: 'DOUBLE_BOOKSHELF', col: 20, row: 0 }); // "arcade cabinet"

// ━━━ OPS HUB (cols 13-24, rows 15-21) ━━━
furniture.push({ uid: fuid('fur'), type: 'WHITEBOARD', col: 14, row: 13 }); // task board on wall
furniture.push({ uid: fuid('fur'), type: 'WHITEBOARD', col: 18, row: 13 }); // bulletin board on wall
furniture.push({ uid: fuid('fur'), type: 'SOFA_FRONT', col: 15, row: 19 }); // guest sofa 1
furniture.push({ uid: fuid('fur'), type: 'SOFA_FRONT', col: 19, row: 19 }); // guest sofa 2
furniture.push({ uid: fuid('fur'), type: 'COFFEE_TABLE', col: 17, row: 17 }); // table
furniture.push({ uid: fuid('fur'), type: 'PLANT', col: 22, row: 15 }); // plant
furniture.push({ uid: fuid('fur'), type: 'BIN', col: 24, row: 20 }); // bin

// ━━━ WALL DECORATIONS ━━━
// Dev zone walls
furniture.push({ uid: fuid('fur'), type: 'DOUBLE_BOOKSHELF', col: 10, row: 5 }); // "server rack"
furniture.push({ uid: fuid('fur'), type: 'BOOKSHELF', col: 1, row: 5 }); // bookshelf
furniture.push({ uid: fuid('fur'), type: 'HANGING_PLANT', col: 6, row: 5 }); // hanging plant
// Marketing zone walls
furniture.push({ uid: fuid('fur'), type: 'LARGE_PAINTING', col: 13, row: 5 }); // "SNS dashboard"
furniture.push({ uid: fuid('fur'), type: 'SMALL_PAINTING', col: 21, row: 5 }); // painting
// Research lab walls
furniture.push({ uid: fuid('fur'), type: 'WHITEBOARD', col: 1, row: 13 }); // "intelligence monitor"
furniture.push({ uid: fuid('fur'), type: 'HANGING_PLANT', col: 10, row: 13 }); // hanging plant
// Ops hub
furniture.push({ uid: fuid('fur'), type: 'SMALL_PAINTING_2', col: 22, row: 13 }); // painting
// General entrance area
furniture.push({ uid: fuid('fur'), type: 'LARGE_PLANT', col: 8, row: 2 }); // entrance plant

// ── Output ──────────────────────────────────────────────────────
const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  layoutRevision: 3,
  tiles,
  tileColors,
  furniture,
};

const outPath = join(__dirname, '..', 'webview-ui', 'public', 'assets', 'default-layout-3.json');
writeFileSync(outPath, JSON.stringify(layout, null, 2));
console.log(`✓ Wrote layout to ${outPath}`);
console.log(`  Grid: ${COLS}×${ROWS} = ${tiles.length} tiles`);
console.log(`  Furniture: ${furniture.length} items`);
console.log(
  `  Seats: ${furniture.filter((f) => f.type.includes('BENCH') || f.type.includes('CHAIR') || f.type.includes('SOFA')).length}`,
);
