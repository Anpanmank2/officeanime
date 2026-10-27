import assert from 'node:assert/strict';
import test from 'node:test';

import { createCharacter, getCharacterSprite } from '../src/office/engine/characters.js';
import type { ChibiPoses } from '../src/office/sprites/chibi/chibiFrames.js';
import { buildChibiFrames } from '../src/office/sprites/chibi/chibiFrames.js';
import { toChibiCharacterSprites } from '../src/office/sprites/chibi/chibiSprites.js';
import heads from '../src/office/sprites/chibi/heads.json';
import poses from '../src/office/sprites/chibi/poses.json';
import {
  getChibiCharacterSprites,
  hasChibiMember,
} from '../src/office/sprites/chibi/chibiCatalog.js';
import {
  getCharacterHeightCorrection,
  getCharacterSprites,
  setCharacterTemplates,
} from '../src/office/sprites/spriteData.js';
import { renderMatrixEffect } from '../src/office/engine/matrixEffect.js';
import { CharacterState, Direction, MATRIX_EFFECT_DURATION } from '../src/office/types.js';

test('IDLE uses standing frames and preserves the legacy walk fallback in every direction', () => {
  const ch = createCharacter(1, 0, null, null);
  ch.state = CharacterState.IDLE;
  const sprites = toChibiCharacterSprites(
    buildChibiFrames(heads.members[0], poses as unknown as ChibiPoses),
    poses.columns,
  );
  const { idle, ...legacy } = sprites;
  for (const dir of Object.values(Direction)) {
    ch.dir = dir;
    assert.equal(getCharacterSprite(ch, sprites), idle![dir]);
    assert.equal(getCharacterSprite(ch, legacy), legacy.walk[dir][1]);
  }
});

test('catalog caches all members; hue is ignored, idle retains scale, and other IDs use legacy sprites', () => {
  for (const member of heads.members) {
    assert.equal(hasChibiMember(member.id), true);
    const sprites = getChibiCharacterSprites(member.id)!;
    assert.equal(getChibiCharacterSprites(member.id), sprites);
    assert.equal(getCharacterSprites(0, 0, null, member.id), sprites);
    assert.equal(getCharacterSprites(6, 240, null, member.id), sprites);
    const idle = getCharacterSprites(0, 0, 'idle', member.id);
    assert.equal(idle.pixelScale, 0.5);
    assert.ok(idle.idle);
    assert.notDeepEqual(idle.idle, sprites.idle);
    assert.equal(getCharacterSprites(2, 90, 'idle', member.id), idle);
  }
  assert.equal(hasChibiMember('generic'), false);
  assert.equal(getChibiCharacterSprites('generic'), null);
  assert.equal(getCharacterSprites(0, 0, null, 'generic'), getCharacterSprites(0));
  assert.equal(getCharacterSprites(0).pixelScale, undefined);
});

test('height correction measures opaque standing data and leaves legacy positions unchanged', () => {
  const frame = Array.from({ length: 32 }, (_, r) =>
    Array<string>(16).fill(r < 8 ? '' : '#123456'),
  );
  const frames = Array.from({ length: 11 }, () => frame);
  setCharacterTemplates([{ down: frames, up: frames, right: frames }]);
  const member = heads.members[0].id;
  const standing = getCharacterSprites(0, 0, null, member).idle![Direction.DOWN];
  const top = standing.findIndex((row) => row.some((pixel) => pixel !== ''));
  assert.equal(getCharacterHeightCorrection(0, member), 24 - (standing.length - top) * 0.5);
  assert.equal(getCharacterHeightCorrection(0), 0);
  assert.equal(getCharacterHeightCorrection(0, 'generic'), 0);
});

test('matrix effect covers all 32 by 48 pixels at fractional scales with empty or short seeds', () => {
  const ch = createCharacter(1, 0, null, null);
  ch.matrixEffect = 'spawn';
  ch.matrixEffectTimer = MATRIX_EFFECT_DURATION;
  const sprite = Array.from({ length: 48 }, () => Array<string>(32).fill('#123456'));
  const rects: number[][] = [];
  const ctx = {
    fillStyle: '',
    fillRect: (...rect: number[]) => rects.push(rect),
  } as unknown as CanvasRenderingContext2D;
  for (const seeds of [[], [0, 0.1]])
    for (const scale of [0.5, 1, 1.5, 2]) {
      rects.length = 0;
      ch.matrixEffectSeeds = seeds;
      renderMatrixEffect(ctx, ch, sprite, 7, 11, scale);
      assert.ok(rects.length > 0);
      assert.ok(
        rects.every(([x, y, w, h]) => Number.isInteger(x) && Number.isInteger(y) && w > 0 && h > 0),
      );
      assert.equal(Math.max(...rects.map(([x, , w]) => x + w)), 7 + 32 * scale);
      assert.equal(Math.max(...rects.map(([, y, , h]) => y + h)), 11 + 48 * scale);
    }
});
