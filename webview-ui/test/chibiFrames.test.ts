import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { ChibiFrames } from '../src/office/sprites/chibi/chibiFrames.ts';
import {
  buildChibiFrames,
  CHIBI_CELL_H,
  CHIBI_CELL_W,
} from '../src/office/sprites/chibi/chibiFrames.ts';

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../src/office/sprites/chibi/${name}.json`, import.meta.url), 'utf8'),
  );
const heads = read('heads'),
  poses = read('poses');
const members = heads.members;
const groups = members.map((member: Parameters<typeof buildChibiFrames>[0]) =>
  buildChibiFrames(member, poses),
);
const directions = ['down', 'up', 'right'] as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const r5 = [
  ['down', 'stand'],
  ['right', 'stand'],
  ['up', 'stand'],
  ['down', 'walk1'],
  ['down', 'walkpass'],
  ['down', 'walk3'],
  ['down', 'walkpass'],
] as const;

test('member IDs and order', () => {
  assert.deepEqual(
    members.map((m: { id: string }) => m.id),
    [
      'eng-01',
      'mkt-01',
      'res-01',
      'exec-sec',
      'eng-04',
      'mkt-02',
      'mkt-03',
      'mkt-04',
      'mkt-05',
      'res-02',
      'res-07',
      'res-09',
      'codex-01',
    ],
  );
});
test('468 nonempty 32×48 frames with eight transparent top rows', () => {
  assert.equal(CHIBI_CELL_W, 32);
  assert.equal(CHIBI_CELL_H, 48);
  for (const group of groups)
    for (const direction of directions) {
      assert.equal(group[direction].length, 12);
      for (const frame of group[direction]) {
        assert.equal(frame.length, 48);
        assert.ok(frame.every((row: string[]) => row.length === 32));
        assert.ok(
          frame
            .slice(0, 8)
            .flat()
            .every((pixel: string) => pixel === ''),
        );
        assert.ok(frame.flat().some((pixel: string) => pixel !== ''));
      }
    }
});
test('each member uses at most 20 colors', () => {
  for (const group of groups)
    assert.ok(new Set(directions.flatMap((d) => group[d].flat(2)).filter(Boolean)).size <= 20);
});
test('r5 frame parity', () => {
  assert.equal(
    hash(
      groups.map((group: ChibiFrames) => r5.map(([d, c]) => group[d][poses.columns.indexOf(c)])),
    ),
    'd2157f9afebfa4215c10ee056c0152a71dee3fd07e8df85e17dee39869e72ce3',
  );
});
test('all frame parity', () => {
  assert.equal(
    hash(groups.map((group: ChibiFrames) => directions.map((d) => group[d]))),
    'fc86eb4328260ba981195609ebf689e86b7ee010fce0226fe169c4e0927bc438',
  );
});
test('head and blueprint data hashes', () => {
  assert.equal(hash(heads), '320e2b7d0456418c60fea489d25402fa3ec6bf9071cfaadaedc3e6086b28193d');
  assert.equal(hash(poses), 'f0b0ec5d4ab678f36637394b53248df9d9baa108c13cfd926e9340ace1fadcec');
});
test('frames and rows are independent and rebuilding does not retain mutations', () => {
  const group = buildChibiFrames(members[0], poses);
  const frames = directions.flatMap((d) => group[d]);
  assert.equal(new Set(frames).size, 36);
  assert.equal(new Set(frames.flat()).size, 36 * 48);
  // eslint-disable-next-line pixel-agents/no-inline-colors -- テスト用の判定色
  group.down[0][0][0] = '#ffffff';
  assert.equal(buildChibiFrames(members[0], poses).down[0][0][0], '');
});
test('out of bounds painting throws', () => {
  for (const [x, y] of [
    [-1, 8],
    [32, 8],
    [0, -1],
    [0, 48],
  ]) {
    const invalid = structuredClone(poses);
    invalid.frames.walk1.down = [['r', x, y, 1, 1, 'ink', 'test']];
    assert.throws(() => buildChibiFrames(members[0], invalid), /pixel outside canvas/);
  }
});
