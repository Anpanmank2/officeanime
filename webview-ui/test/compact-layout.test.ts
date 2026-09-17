import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  COMPACT_DESK_SEAT_UIDS,
  resolveCompactDeskSeatPositions,
} from '../src/jc/desk-seat-registry.js';
import { reconcileRegisteredSeats } from '../src/jc/seat-reconciliation.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import {
  buildDynamicCatalog,
  getCatalogEntry,
  type LoadedAssetData,
} from '../src/office/layout/furnitureCatalog.js';
import {
  getBlockedTiles,
  layoutToSeats,
  layoutToTileMap,
} from '../src/office/layout/layoutSerializer.js';
import { findPath } from '../src/office/layout/tileMap.js';
import type { OfficeLayout } from '../src/office/types.js';

type ManifestNode = {
  type: 'asset' | 'group';
  id?: string;
  width?: number;
  height?: number;
  footprintW?: number;
  footprintH?: number;
  orientation?: string;
  state?: string;
  frame?: number;
  members?: ManifestNode[];
};
type Manifest = ManifestNode & {
  id: string;
  name: string;
  category: string;
  backgroundTiles?: number;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
};

const layout = JSON.parse(
  readFileSync(new URL('../public/assets/default-layout-4.json', import.meta.url), 'utf8'),
) as OfficeLayout;
const legacyLayout = JSON.parse(
  readFileSync(new URL('../public/assets/default-layout-3.json', import.meta.url), 'utf8'),
) as OfficeLayout;

/** Load the shipped manifests so geometry stays tied to the real furniture contracts. */
function loadCatalogEntry(directory: string) {
  const manifest = JSON.parse(
    readFileSync(
      new URL(`../public/assets/furniture/${directory}/manifest.json`, import.meta.url),
      'utf8',
    ),
  ) as Manifest;
  const catalog: LoadedAssetData['catalog'] = [];
  const sprites: Record<string, string[][]> = {};
  const visit = (node: ManifestNode) => {
    if (node.type === 'asset') {
      assert.ok(node.id && node.width && node.height && node.footprintW && node.footprintH);
      catalog.push({
        id: node.id,
        label: manifest.name,
        category: manifest.category,
        width: node.width,
        height: node.height,
        footprintW: node.footprintW,
        footprintH: node.footprintH,
        isDesk: manifest.category === 'desks',
        groupId: manifest.id,
        orientation: node.orientation,
        state: node.state,
        frame: node.frame,
        backgroundTiles: manifest.backgroundTiles,
        canPlaceOnWalls: manifest.canPlaceOnWalls,
        canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
      });
      sprites[node.id] = Array.from({ length: node.height }, () => Array(node.width).fill(''));
      return;
    }
    for (const member of node.members ?? []) visit(member);
  };
  if (manifest.type === 'asset') visit(manifest);
  else visit({ type: 'group', members: manifest.members });
  return { catalog, sprites };
}

const loaded = ['SMALL_TABLE', 'TABLE_FRONT', 'GAMING_CHAIR', 'BOOKSHELF', 'ULTRAWIDE_MONITOR'].map(
  loadCatalogEntry,
);
assert.equal(
  buildDynamicCatalog({
    catalog: loaded.flatMap((entry) => entry.catalog),
    sprites: Object.assign({}, ...loaded.map((entry) => entry.sprites)),
  }),
  true,
);

const activeDeskIds = [
  'dev-desk-01',
  'exec-desk-pm',
  'dev-desk-07',
  'mkt-desk-01',
  'mkt-desk-02',
  'mkt-desk-03',
  'mkt-desk-04',
  'mkt-desk-12',
  'mkt-desk-05',
  'res-desk-01',
  'res-desk-02',
  'res-desk-07',
  'res-desk-09',
  'exec-desk-sec',
];

function assertReachable(target: { col: number; row: number }) {
  const blocked = getBlockedTiles(layout.furniture);
  blocked.delete(`${target.col},${target.row}`);
  const path = findPath(14, 9, target.col, target.row, layoutToTileMap(layout), blocked);
  assert.ok(
    path.length > 0 || (target.col === 14 && target.row === 9),
    `${target.col},${target.row}`,
  );
}

test('compact default contains only the Phase 1 work room', () => {
  assert.equal(layout.cols, 22);
  assert.equal(layout.rows, 16);
  assert.equal(layout.tiles.length, layout.cols * layout.rows);
  assert.deepEqual(
    layout.furniture.filter((item) => item.type.includes('BOOKSHELF')).map((item) => item.uid),
    ['office-history-bookshelf'],
  );
  assert.equal(
    layout.furniture.some((item) =>
      ['SOFA_FRONT', 'POKER_TABLE', 'ESPRESSO_MACHINE'].includes(item.type),
    ),
    false,
  );
});

test('all active roster desk IDs resolve to distinct real chairs at their current layout positions', () => {
  const seats = layoutToSeats(layout.furniture);
  const resolved = activeDeskIds.map((deskId) => {
    const seatUid = COMPACT_DESK_SEAT_UIDS[deskId];
    assert.ok(seatUid, deskId);
    const seat = seats.get(seatUid);
    assert.ok(seat, `${deskId} → ${seatUid}`);
    return seatUid;
  });
  assert.equal(new Set(resolved).size, activeDeskIds.length);
  const movedFurniture = layout.furniture.map((item) =>
    item.uid === 'eng-bench-01' ? { ...item, col: 3, row: 2 } : item,
  );
  assert.deepEqual(resolveCompactDeskSeatPositions(movedFurniture)['dev-desk-01'], {
    col: 3,
    row: 2,
  });
});

test('facing islands, shared surface, and owner/secretary seats match the intended geometry', () => {
  const seats = layoutToSeats(layout.furniture);
  assert.equal(seats.get('eng-bench-01')?.facingDir, 0);
  assert.equal(seats.get('eng-bench-07')?.facingDir, 3);
  assert.equal(seats.get('mkt-bench-01')?.facingDir, 0);
  assert.equal(seats.get('mkt-bench-04')?.facingDir, 3);
  assert.equal(seats.get('owner-chair')?.facingDir, 3);
  assert.equal(seats.get('exec-bench-01')?.facingDir, 3);
  assert.ok(layout.furniture.some((item) => item.uid === 'eng-shared-table'));
  assert.equal(
    layout.furniture.some(
      (item) => item.type === 'GAMING_CHAIR' && item.col === 4 && item.row === 7,
    ),
    false,
  );
  assert.equal(
    layout.furniture.some((item) => item.uid === 'eng-pc-b2'),
    false,
  );
});

test('real catalog footprints do not intersect, and every seat and shelf approach is pathable', () => {
  const deskTiles = new Set<string>();
  for (const item of layout.furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry?.isDesk) continue;
    for (let row = item.row; row < item.row + entry.footprintH; row++)
      for (let col = item.col; col < item.col + entry.footprintW; col++)
        deskTiles.add(`${col},${row}`);
  }
  const occupied = new Map<string, string>();
  for (const item of layout.furniture) {
    const entry = getCatalogEntry(item.type);
    assert.ok(entry, item.type);
    for (let row = item.row; row < item.row + entry.footprintH; row++)
      for (let col = item.col; col < item.col + entry.footprintW; col++) {
        const key = `${col},${row}`;
        if (entry.canPlaceOnSurfaces) {
          assert.equal(deskTiles.has(key), true, `${item.uid} must sit on a desk`);
          continue;
        }
        assert.equal(occupied.has(key), false, `${item.uid} intersects ${occupied.get(key)}`);
        occupied.set(key, item.uid);
      }
  }
  for (const seat of layoutToSeats(layout.furniture).values()) {
    assertReachable({ col: seat.seatCol, row: seat.seatRow });
  }
  assertReachable({ col: 9, row: 1 });
});

test('live members and owner reclaim registered seats when switching compact and legacy layouts', () => {
  const officeState = new OfficeState(legacyLayout);
  const legacySeats = new Map([
    ['res-07', 'res-bench-07'],
    ['mkt-12', 'mkt-bench-09'],
    ['codex-01', 'eng-bench-05'],
  ]);
  let agentId = 1;
  for (const [memberId, seatId] of legacySeats) {
    officeState.addAgent(agentId, 0, 0, seatId, true);
    officeState.characters.get(agentId++)!.jcMemberId = memberId;
  }
  officeState.addAgent(-9999, 0, 0, 'mkt-bench-10', true);

  officeState.rebuildFromLayout(layout);
  // Model the arbitrary fallback permutation created by rebuildFromLayout: every
  // registered target is currently occupied by another registered character.
  for (const seat of officeState.seats.values()) seat.assigned = false;
  const compactPermutation = [
    [1, 'mkt-bench-05'],
    [2, 'eng-bench-07'],
    [3, 'owner-chair'],
    [-9999, 'res-bench-03'],
  ] as const;
  for (const [id, seatId] of compactPermutation) {
    const character = officeState.characters.get(id)!;
    character.seatId = seatId;
    character.path = [{ col: 0, row: 0 }];
    officeState.seats.get(seatId)!.assigned = true;
  }
  reconcileRegisteredSeats(
    officeState,
    new Map([
      ['res-07', 'res-bench-03'],
      ['mkt-12', 'mkt-bench-05'],
      ['codex-01', 'eng-bench-07'],
    ]),
    -9999,
    'owner-chair',
  );
  assert.equal(officeState.characters.get(1)?.seatId, 'res-bench-03');
  assert.equal(officeState.characters.get(2)?.seatId, 'mkt-bench-05');
  assert.equal(officeState.characters.get(3)?.seatId, 'eng-bench-07');
  assert.equal(officeState.characters.get(-9999)?.seatId, 'owner-chair');
  assert.deepEqual(officeState.characters.get(1)?.path, []);
  assert.deepEqual(officeState.characters.get(-9999)?.path, []);

  officeState.rebuildFromLayout(legacyLayout);
  reconcileRegisteredSeats(officeState, legacySeats);
  assert.equal(officeState.characters.get(1)?.seatId, 'res-bench-07');
  assert.equal(officeState.characters.get(2)?.seatId, 'mkt-bench-09');
  assert.equal(officeState.characters.get(3)?.seatId, 'eng-bench-05');
});
