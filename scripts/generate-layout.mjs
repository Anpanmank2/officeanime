// scripts/generate-layout.mjs
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COLS = 24;
const ROWS = 20;
const VOID = 255;
const WALL = 0;
const ENTRANCE = 1;
const EXEC = 2;
const BREAK = 3;
const ENGINEERING = 4;
const MARKETING = 5;
const RESEARCH = 6;

// Zone colors
const WALL_COLOR = { h: 214, s: 30, b: -100, c: -55 };
const ENTRANCE_COLOR = { h: 30, s: 20, b: -30, c: -60 };
const EXEC_COLOR = { h: 270, s: 40, b: -35, c: -70 };
const BREAK_COLOR = { h: 120, s: 35, b: -30, c: -75 };
const ENG_COLOR = { h: 209, s: 39, b: -25, c: -80 };
const MKT_COLOR = { h: 25, s: 48, b: -43, c: -88 };
const RES_COLOR = { h: 180, s: 35, b: -30, c: -75 };

function tileColor(tileType) {
  switch (tileType) {
    case WALL:
      return WALL_COLOR;
    case VOID:
      return null;
    case ENTRANCE:
      return ENTRANCE_COLOR;
    case EXEC:
      return EXEC_COLOR;
    case BREAK:
      return BREAK_COLOR;
    case ENGINEERING:
      return ENG_COLOR;
    case MARKETING:
      return MKT_COLOR;
    case RESEARCH:
      return RES_COLOR;
    default:
      return null;
  }
}

// Build tile grid
const tiles = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (r === 0) {
      tiles.push(VOID);
    } else if (r === 1 || r === 19) {
      // Top and bottom walls
      tiles.push(WALL);
    } else if (r >= 2 && r <= 4) {
      // Entrance (left) + Exec (right)
      if (c === 0 || c === 23) tiles.push(WALL);
      else if (c === 12) tiles.push(WALL);
      else if (c >= 1 && c <= 11) tiles.push(ENTRANCE);
      else tiles.push(EXEC); // cols 13-22
    } else if (r === 5) {
      // Divider wall with doorways
      if (c === 5 || c === 6)
        tiles.push(BREAK); // left doorway
      else if (c === 17 || c === 18)
        tiles.push(ENGINEERING); // right doorway
      else tiles.push(WALL);
    } else if (r >= 6 && r <= 10) {
      // Break (left) + Engineering (right)
      if (c === 0 || c === 23) tiles.push(WALL);
      else if (c === 12) tiles.push(WALL);
      else if (c >= 1 && c <= 11) tiles.push(BREAK);
      else tiles.push(ENGINEERING); // cols 13-22
    } else if (r === 11) {
      // Divider wall with doorways
      if (c === 5 || c === 6)
        tiles.push(MARKETING); // left doorway
      else if (c === 17 || c === 18)
        tiles.push(RESEARCH); // right doorway
      else tiles.push(WALL);
    } else if (r >= 12 && r <= 18) {
      // Marketing (left) + Research (right)
      if (c === 0 || c === 23) tiles.push(WALL);
      else if (c === 12) tiles.push(WALL);
      else if (c >= 1 && c <= 11) tiles.push(MARKETING);
      else tiles.push(RESEARCH); // cols 13-22
    } else {
      tiles.push(WALL);
    }
  }
}

const tileColors = tiles.map((t) => tileColor(t));

// Furniture
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

// ━━━ ENGINEERING (6 desks) ━━━
addDeskStation(14, 6, 'dev-seat-01');
addDeskStation(17, 6, 'dev-seat-02');
addDeskStation(20, 6, 'dev-seat-03');
addDeskStation(15, 8, 'dev-seat-04');
addDeskStation(18, 8, 'dev-seat-05');
addDeskStation(21, 8, 'dev-seat-06');

// ━━━ MARKETING (11 desks) ━━━
// Row A (row 12): 4 desks
addDeskStation(1, 12, 'mkt-seat-01');
addDeskStation(4, 12, 'mkt-seat-02');
addDeskStation(7, 12, 'mkt-seat-03');
addDeskStation(10, 12, 'mkt-seat-04');

// Row B (row 15): 4 desks
addDeskStation(1, 15, 'mkt-seat-05');
addDeskStation(4, 15, 'mkt-seat-06');
addDeskStation(7, 15, 'mkt-seat-07');
addDeskStation(10, 15, 'mkt-seat-08');

// Remaining 3: standalone benches in aisle
furniture.push({ uid: 'mkt-seat-09', type: 'CUSHIONED_BENCH', col: 3, row: 14 });
furniture.push({ uid: 'mkt-seat-10', type: 'CUSHIONED_BENCH', col: 6, row: 14 });
furniture.push({ uid: 'mkt-seat-11', type: 'CUSHIONED_BENCH', col: 9, row: 14 });

// ━━━ RESEARCH (6 desks) ━━━
addDeskStation(14, 12, 'res-seat-01');
addDeskStation(17, 12, 'res-seat-02');
addDeskStation(20, 12, 'res-seat-03');
addDeskStation(15, 15, 'res-seat-04');
addDeskStation(18, 15, 'res-seat-05');
addDeskStation(21, 15, 'res-seat-06');

// ━━━ BREAK ZONE (lounge area) ━━━
furniture.push({ uid: fuid('fur'), type: 'COFFEE_TABLE', col: 5, row: 7 });
furniture.push({ uid: fuid('fur'), type: 'SOFA_FRONT', col: 5, row: 6 });
furniture.push({ uid: fuid('fur'), type: 'SOFA_BACK', col: 5, row: 9 });
furniture.push({ uid: fuid('fur'), type: 'SOFA_SIDE', col: 4, row: 7 });
furniture.push({ uid: fuid('fur'), type: 'SOFA_SIDE:left', col: 7, row: 7 });
furniture.push({ uid: fuid('fur'), type: 'COFFEE', col: 5, row: 8 });
furniture.push({ uid: fuid('fur'), type: 'COFFEE', col: 6, row: 8 });

// ━━━ ENTRANCE ━━━
furniture.push({ uid: fuid('fur'), type: 'LARGE_PLANT', col: 1, row: 2 });
furniture.push({ uid: fuid('fur'), type: 'PLANT', col: 10, row: 2 });

// ━━━ EXEC AREA ━━━
furniture.push({ uid: fuid('fur'), type: 'WHITEBOARD', col: 15, row: 0 });
furniture.push({ uid: fuid('fur'), type: 'LARGE_PLANT', col: 21, row: 2 });
furniture.push({ uid: fuid('fur'), type: 'SMALL_PAINTING', col: 18, row: 0 });

// ━━━ WALL DECORATIONS ━━━
furniture.push({ uid: fuid('fur'), type: 'CLOCK', col: 6, row: 0 });
furniture.push({ uid: fuid('fur'), type: 'BOOKSHELF', col: 2, row: 0 });
furniture.push({ uid: fuid('fur'), type: 'DOUBLE_BOOKSHELF', col: 8, row: 0 });
furniture.push({ uid: fuid('fur'), type: 'LARGE_PAINTING', col: 13, row: 0 });
furniture.push({ uid: fuid('fur'), type: 'HANGING_PLANT', col: 1, row: 5 });
furniture.push({ uid: fuid('fur'), type: 'HANGING_PLANT', col: 11, row: 5 });
furniture.push({ uid: fuid('fur'), type: 'SMALL_PAINTING_2', col: 20, row: 11 });

// ── Output ──
const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  layoutRevision: 2,
  tiles,
  tileColors,
  furniture,
};

const outPath = join(__dirname, '..', 'webview-ui', 'public', 'assets', 'default-layout-2.json');
writeFileSync(outPath, JSON.stringify(layout, null, 2));
console.log(`✓ Wrote layout to ${outPath}`);
console.log(`  Tiles: ${tiles.length} (${COLS}x${ROWS})`);
console.log(`  Furniture: ${furniture.length} items`);
console.log(
  `  Seats: ${furniture.filter((f) => f.type.includes('BENCH') || f.type.includes('CHAIR') || f.type.includes('SOFA')).length}`,
);
