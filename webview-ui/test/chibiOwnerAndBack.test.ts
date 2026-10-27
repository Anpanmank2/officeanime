import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildChibiFrames } from '../src/office/sprites/chibi/chibiFrames.ts';
import { toChibiCharacterSprites } from '../src/office/sprites/chibi/chibiSprites.ts';

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../src/office/sprites/chibi/${name}.json`, import.meta.url), 'utf8'),
  );
const owner = read('owner'),
  heads = read('heads'),
  poses = read('poses');
const directions = ['down', 'up', 'right'] as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const group = buildChibiFrames(owner.members[0], poses);

test('owner identity and exact data', () => {
  assert.equal(owner.members.length, 1);
  assert.equal(owner.members[0].id, 'exec-01');
  assert.ok(!heads.members.some((member: { id: string }) => member.id === owner.members[0].id));
  assert.equal(hash(owner), '9f52494bce0298362ce6aac0ef7fee4878512622b14141c130076cda34cc532f');
});

test('owner has 36 nonempty 32×48 frames with transparent top rows and exact parity', () => {
  for (const direction of directions) {
    assert.equal(group[direction].length, 12);
    for (const frame of group[direction]) {
      assert.equal(frame.length, 48);
      assert.ok(frame.every((row) => row.length === 32));
      assert.ok(
        frame
          .slice(0, 8)
          .flat()
          .every((pixel) => pixel === ''),
      );
      assert.ok(frame.flat().some(Boolean));
    }
  }
  assert.ok(new Set(directions.flatMap((d) => group[d].flat(2)).filter(Boolean)).size <= 20);
  assert.equal(
    hash(directions.map((d) => group[d])),
    'cd684b6a9d4bb88af959cea87c714dbfe57a0099dc71f86e057a32961c9204ab',
  );
});

test('owner gold badge and cord are hidden from behind', () => {
  const gold = owner.members[0].acc[1];
  assert.equal(gold, '#e7b53c');
  const backFrames = group.up.filter((_, index) => poses.columns[index] !== 'error');
  assert.equal(backFrames.length, 11);
  for (const frame of backFrames) assert.ok(!frame.flat().includes(gold));
  assert.ok(group.down[poses.columns.indexOf('stand')].flat().includes(gold));
});

test('res-09 back ribbon appears only on the right', () => {
  const member = heads.members.find((member: { id: string }) => member.id === 'res-09');
  const ribbon = member.acc[1];
  assert.equal(ribbon, '#e04a64');
  const frame = buildChibiFrames(member, poses).up[poses.columns.indexOf('stand')];
  assert.ok(frame.some((row) => row.slice(16).includes(ribbon)));
  assert.ok(frame.every((row) => !row.slice(0, 16).includes(ribbon)));
});

test('owner uses the shared half-scale sprite converter', () => {
  assert.equal(toChibiCharacterSprites(group, poses.columns).pixelScale, 0.5);
});
