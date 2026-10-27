import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildChibiFrames } from '../src/office/sprites/chibi/chibiFrames.ts';
import {
  CHIBI_PIXEL_SCALE,
  toChibiCharacterSprites,
} from '../src/office/sprites/chibi/chibiSprites.ts';
import { getCachedSprite, scaledEdge } from '../src/office/sprites/spriteCache.ts';

const read = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../src/office/sprites/chibi/${name}.json`, import.meta.url), 'utf8'),
  );
const poses = read('poses');
for (const member of read('heads').members) {
  test(`${member.id}: frame references, left reflection and shared error animation`, () => {
    const frames = buildChibiFrames(member, poses);
    const sprites = toChibiCharacterSprites(frames, poses.columns);
    const col = (name: string) => poses.columns.indexOf(name);
    assert.equal(sprites.pixelScale, 0.5);
    for (const [direction, key] of [
      [0, 'down'],
      [3, 'up'],
      [2, 'right'],
    ] as const) {
      const source = frames[key];
      assert.equal(sprites.idle![direction], source[col('stand')]);
      for (const [kind, names] of [
        ['walk', ['walk1', 'walkpass', 'walk3', 'walkpass']],
        ['typing', ['type1', 'type2']],
        ['reading', ['read1', 'read2']],
        ['thinking', ['think1', 'think2', 'think3']],
      ] as const) {
        names.forEach((name, i) => assert.equal(sprites[kind][direction][i], source[col(name)]));
      }
    }
    for (const kind of ['walk', 'typing', 'reading', 'thinking'] as const) {
      sprites[kind][2].forEach((frame, i) => {
        assert.deepEqual(
          sprites[kind][1][i],
          frame.map((row) => [...row].reverse()),
        );
        assert.notEqual(sprites[kind][1][i], frame);
        frame.forEach((row, r) => assert.notEqual(sprites[kind][1][i][r], row));
      });
    }
    assert.deepEqual(
      sprites.idle![1],
      sprites.idle![2].map((row) => [...row].reverse()),
    );
    for (const d of [0, 1, 2, 3] as const) assert.equal(sprites.error[d], sprites.error[0]);
    for (const [i, d] of ['down', 'up', 'right'].entries()) {
      assert.equal(sprites.error[0][i], frames[d as keyof typeof frames][col('error')]);
    }
    for (const name of poses.columns) {
      assert.throws(
        () =>
          toChibiCharacterSprites(
            frames,
            poses.columns.filter((c: string) => c !== name),
          ),
        /Missing column/,
      );
    }
  });
}

test('direction constants match the engine without runtime imports', () => {
  const types = readFileSync(new URL('../src/office/types.ts', import.meta.url), 'utf8');
  const converter = readFileSync(
    new URL('../src/office/sprites/chibi/chibiSprites.ts', import.meta.url),
    'utf8',
  );
  for (const [name, value] of [
    ['DOWN', 0],
    ['LEFT', 1],
    ['RIGHT', 2],
    ['UP', 3],
  ]) {
    assert.match(types, new RegExp(`${name}: ${value}`));
    assert.match(converter, new RegExp(`${name}: ${value}`));
  }
  assert.equal(CHIBI_PIXEL_SCALE, 0.5);
});

test('rounded edges preserve integer scales and cover fractional canvases', () => {
  for (let scale = 1; scale <= 10; scale++) {
    for (let c = 0; c <= 48; c++) assert.equal(scaledEdge(c, scale), c * scale);
  }
  assert.deepEqual(
    Array.from({ length: 6 }, (_, c) => scaledEdge(c, 0.5)),
    [0, 1, 1, 2, 2, 3],
  );
  assert.deepEqual(
    Array.from({ length: 6 }, (_, c) => scaledEdge(c, 1.5)),
    [0, 2, 3, 5, 6, 8],
  );
});

test('canvas rasterization retains integer rectangles and skips collapsed pixels', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const calls: number[][] = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillRect: (...rect: number[]) => calls.push(rect) }),
      }),
    },
  });
  try {
    for (let zoom = 1; zoom <= 10; zoom++) {
      for (const scale of [zoom, zoom * 0.5]) {
        calls.length = 0;
        const sprite = [
          ['#111', '#222', ''],
          ['#333', '#444', '#555'],
        ];
        const canvas = getCachedSprite(sprite, scale);
        assert.equal(canvas.width, Math.round(3 * scale));
        assert.equal(canvas.height, Math.round(2 * scale));
        const expected = [];
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++) {
            const x = Math.round(c * scale),
              y = Math.round(r * scale);
            const w = Math.round((c + 1) * scale) - x,
              h = Math.round((r + 1) * scale) - y;
            if (sprite[r][c] && w && h) expected.push([x, y, w, h]);
          }
        assert.deepEqual(calls, expected);
        assert.equal(getCachedSprite(sprite, scale), canvas);
      }
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
