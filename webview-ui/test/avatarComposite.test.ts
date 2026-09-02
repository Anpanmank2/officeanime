import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AvatarPartAsset,
  AvatarSlot as AvatarSlotType,
  CharacterDirectionSprites,
} from '../../shared/assets/types.ts';
import {
  avatarConfigCacheKey,
  composeAvatar,
  overlaySprites,
} from '../src/office/sprites/avatarComposite.ts';
import type {
  AvatarConfig,
  AvatarLayerConfig,
  LoadedAvatarParts,
} from '../src/office/sprites/avatarTypes.ts';
import {
  AvatarSlot,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
} from '../src/office/sprites/avatarTypes.ts';
import type { FloorColor, SpriteData } from '../src/office/types.ts';
import { Direction } from '../src/office/types.ts';

type DirectionName = keyof CharacterDirectionSprites;

const DIRECTION_NAMES: DirectionName[] = ['down', 'up', 'right'];
const DIRECTION_VALUES = {
  down: Direction.DOWN,
  up: Direction.UP,
  right: Direction.RIGHT,
} as const;

function emptySprite(): SpriteData {
  return Array.from({ length: CHAR_FRAME_H }, () => new Array<string>(CHAR_FRAME_W).fill(''));
}

function markerSprite(value: string, row = 0, column = 0): SpriteData {
  const result = emptySprite();
  result[row][column] = value;
  return result;
}

function opaquePixel(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((component) => component.toString(16).padStart(2, '0'))
    .join('')}`;
}

function repeatedFrames(value: string): CharacterDirectionSprites {
  const makeFrames = () => Array.from({ length: CHAR_FRAMES_PER_ROW }, () => markerSprite(value));
  return { down: makeFrames(), up: makeFrames(), right: makeFrames() };
}

function indexedFrames(prefix: string, row = 0, columnOffset = 0): CharacterDirectionSprites {
  const makeFrames = (direction: DirectionName) =>
    Array.from({ length: CHAR_FRAMES_PER_ROW }, (_, frameIndex) =>
      markerSprite(
        `${prefix}:${direction}:${frameIndex.toString()}`,
        row,
        (frameIndex + columnOffset) % CHAR_FRAME_W,
      ),
    );
  return {
    down: makeFrames('down'),
    up: makeFrames('up'),
    right: makeFrames('right'),
  };
}

function asset(id: string, slot: AvatarSlotType, colorable = false): AvatarPartAsset {
  return {
    id,
    slot,
    name: id,
    file: `${id}.png`,
    avatarPath: `avatar-parts/${slot}/${id}/${id}.png`,
    width: CHAR_FRAME_W * CHAR_FRAMES_PER_ROW,
    height: CHAR_FRAME_H * DIRECTION_NAMES.length,
    frames: CHAR_FRAMES_PER_ROW,
    colorable,
  };
}

function loadedParts(
  entries: Array<{
    id: string;
    slot: AvatarSlotType;
    sprites: CharacterDirectionSprites;
    colorable?: boolean;
  }>,
): LoadedAvatarParts {
  return {
    catalog: entries.map((entry) => asset(entry.id, entry.slot, entry.colorable ?? false)),
    sprites: new Map(entries.map((entry) => [entry.id, entry.sprites])),
  };
}

function avatarConfig(basePart: string, layers: AvatarLayerConfig[] = []): AvatarConfig {
  return { base: { part: basePart, color: null }, layers };
}

function assertMarker(
  sprite: SpriteData,
  value: string,
  frameIndex: number,
  flipped = false,
  row = 0,
  columnOffset = 0,
): void {
  const sourceColumn = (frameIndex + columnOffset) % CHAR_FRAME_W;
  const expectedColumn = flipped ? CHAR_FRAME_W - sourceColumn - 1 : sourceColumn;
  assert.equal(sprite[row][expectedColumn], value);
}

test('overlaySprites gives non-transparent upper pixels priority without mutating either input', () => {
  const lower: SpriteData = [
    ['lower-a', ''],
    ['lower-b', 'lower-c'],
  ];
  const upper: SpriteData = [
    ['', 'upper-a'],
    ['', 'upper-b'],
  ];
  const lowerBefore = structuredClone(lower);
  const upperBefore = structuredClone(upper);

  const result = overlaySprites(lower, upper);

  assert.deepEqual(result, [
    ['lower-a', 'upper-a'],
    ['lower-b', 'upper-b'],
  ]);
  assert.deepEqual(lower, lowerBefore);
  assert.deepEqual(upper, upperBefore);
  assert.notStrictEqual(result, lower);
  assert.notStrictEqual(result[0], lower[0]);
});

test('composeAvatar applies fixed slot z-order regardless of config layer order', () => {
  const parts = loadedParts([
    { id: 'base', slot: AvatarSlot.BASE, sprites: repeatedFrames('base') },
    { id: 'top', slot: AvatarSlot.TOP, sprites: repeatedFrames('top') },
    { id: 'hair', slot: AvatarSlot.HAIR, sprites: repeatedFrames('hair') },
  ]);
  const config = avatarConfig('base', [
    { slot: AvatarSlot.HAIR, part: 'hair', color: null },
    { slot: AvatarSlot.TOP, part: 'top', color: null },
  ]);
  const layersBefore = structuredClone(config.layers);

  const result = composeAvatar(config, parts);

  assert.equal(result.walk[Direction.DOWN][0][0][0], 'hair');
  assert.deepEqual(
    config.layers,
    layersBefore,
    'composition must not sort the persisted array in place',
  );
});

test('accessories preserve config array order within their shared slot', () => {
  const parts = loadedParts([
    { id: 'base', slot: AvatarSlot.BASE, sprites: repeatedFrames('base') },
    { id: 'accessory-a', slot: AvatarSlot.ACCESSORY, sprites: repeatedFrames('a') },
    { id: 'accessory-b', slot: AvatarSlot.ACCESSORY, sprites: repeatedFrames('b') },
  ]);

  const aThenB = composeAvatar(
    avatarConfig('base', [
      { slot: AvatarSlot.ACCESSORY, part: 'accessory-a', color: null },
      { slot: AvatarSlot.ACCESSORY, part: 'accessory-b', color: null },
    ]),
    parts,
  );
  const bThenA = composeAvatar(
    avatarConfig('base', [
      { slot: AvatarSlot.ACCESSORY, part: 'accessory-b', color: null },
      { slot: AvatarSlot.ACCESSORY, part: 'accessory-a', color: null },
    ]),
    parts,
  );

  assert.equal(aThenB.walk[Direction.DOWN][0][0][0], 'b');
  assert.equal(bThenA.walk[Direction.DOWN][0][0][0], 'a');
});

test('missing optional parts are skipped while available lower layers still render', () => {
  const baseFrames = repeatedFrames('');
  for (const direction of DIRECTION_NAMES) {
    for (const frame of baseFrames[direction]) {
      frame[0][0] = 'base-left';
      frame[0][1] = 'base-right';
    }
  }
  const topFrames = repeatedFrames('');
  for (const direction of DIRECTION_NAMES) {
    for (const frame of topFrames[direction]) frame[0][0] = 'top';
  }
  const parts = loadedParts([
    { id: 'base', slot: AvatarSlot.BASE, sprites: baseFrames },
    { id: 'top', slot: AvatarSlot.TOP, sprites: topFrames },
  ]);

  const result = composeAvatar(
    avatarConfig('base', [
      { slot: AvatarSlot.TOP, part: 'top', color: null },
      { slot: AvatarSlot.HAIR, part: 'missing-hair', color: null },
    ]),
    parts,
  );

  assert.equal(result.walk[Direction.DOWN][0][0][0], 'top');
  assert.equal(result.walk[Direction.DOWN][0][0][1], 'base-right');
});

test('a non-colorable asset ignores a configured color adjustment', () => {
  const nativePixel = 'native-pixel';
  const redFrames = repeatedFrames(nativePixel);
  const parts = loadedParts([
    { id: 'fixed-base', slot: AvatarSlot.BASE, sprites: redFrames, colorable: false },
  ]);
  const color: FloorColor = { h: 180, s: 0, b: 0, c: 0 };
  const config: AvatarConfig = {
    base: { part: 'fixed-base', color },
    layers: [],
  };

  const result = composeAvatar(config, parts);

  assert.equal(result.walk[Direction.DOWN][0][0][0], nativePixel);
});

test('colorized frame caching keeps directions and frame columns independent', () => {
  const frames = repeatedFrames(opaquePixel(30, 60, 90));
  frames.down[0][0][0] = opaquePixel(200, 40, 20);
  frames.down[1][0][0] = opaquePixel(20, 200, 40);
  frames.right[0][0][0] = opaquePixel(40, 20, 200);
  const parts = loadedParts([
    { id: 'color-cache-base', slot: AvatarSlot.BASE, sprites: frames, colorable: true },
  ]);
  const config: AvatarConfig = {
    base: {
      part: 'color-cache-base',
      color: { h: 60, s: 0, b: 0, c: 0 },
    },
    layers: [],
  };

  const result = composeAvatar(config, parts);
  const downFrameZero = result.walk[Direction.DOWN][0][0][0];
  const downFrameOne = result.walk[Direction.DOWN][1][0][0];
  const rightFrameZero = result.walk[Direction.RIGHT][0][0][0];

  assert.notEqual(downFrameZero, frames.down[0][0][0], 'colorable parts should be adjusted');
  assert.notEqual(downFrameZero, downFrameOne, 'frame index must be part of the color cache key');
  assert.notEqual(downFrameZero, rightFrameZero, 'direction must be part of the color cache key');
});

test('composeAvatar preserves every frame mapping, flips the composed right side, and reuses error rows', () => {
  const baseFrames = indexedFrames('base');
  const accessoryFrames = indexedFrames('accessory', 1, 2);
  const parts = loadedParts([
    { id: 'base', slot: AvatarSlot.BASE, sprites: baseFrames },
    {
      id: 'accessory',
      slot: AvatarSlot.ACCESSORY,
      sprites: accessoryFrames,
    },
  ]);
  const result = composeAvatar(
    avatarConfig('base', [{ slot: AvatarSlot.ACCESSORY, part: 'accessory', color: null }]),
    parts,
  );

  const mappings = [
    { group: 'walk' as const, frames: [0, 1, 2, 1] },
    { group: 'typing' as const, frames: [3, 4] },
    { group: 'reading' as const, frames: [5, 6] },
    { group: 'thinking' as const, frames: [7, 8, 9] },
  ];

  for (const direction of DIRECTION_NAMES) {
    const directionValue = DIRECTION_VALUES[direction];
    for (const { group, frames } of mappings) {
      const actualFrames = result[group][directionValue];
      frames.forEach((sourceFrame, outputIndex) => {
        assertMarker(
          actualFrames[outputIndex],
          `base:${direction}:${sourceFrame.toString()}`,
          sourceFrame,
        );
        assertMarker(
          actualFrames[outputIndex],
          `accessory:${direction}:${sourceFrame.toString()}`,
          sourceFrame,
          false,
          1,
          2,
        );
      });
    }
  }

  for (const { group, frames } of mappings) {
    const actualFrames = result[group][Direction.LEFT];
    frames.forEach((sourceFrame, outputIndex) => {
      assertMarker(
        actualFrames[outputIndex],
        `base:right:${sourceFrame.toString()}`,
        sourceFrame,
        true,
      );
      assertMarker(
        actualFrames[outputIndex],
        `accessory:right:${sourceFrame.toString()}`,
        sourceFrame,
        true,
        1,
        2,
      );
    });
  }

  for (const direction of [Direction.DOWN, Direction.UP, Direction.RIGHT, Direction.LEFT]) {
    const errorFrames = result.error[direction];
    assertMarker(errorFrames[0], 'base:down:10', 10);
    assertMarker(errorFrames[1], 'base:up:10', 10);
    assertMarker(errorFrames[2], 'base:right:10', 10);
    assertMarker(errorFrames[0], 'accessory:down:10', 10, false, 1, 2);
    assertMarker(errorFrames[1], 'accessory:up:10', 10, false, 1, 2);
    assertMarker(errorFrames[2], 'accessory:right:10', 10, false, 1, 2);
  }
});

test('avatarConfigCacheKey is canonical by slot, sensitive to accessory order, and serializes color fields', () => {
  const blue: FloorColor = { h: 210, s: 10, b: -5, c: 0 };
  const sameBlueWithExplicitMode: FloorColor = {
    h: 210,
    s: 10,
    b: -5,
    c: 0,
    colorize: false,
  };
  const configA: AvatarConfig = {
    base: { part: 'base', color: null },
    layers: [
      { slot: AvatarSlot.HAIR, part: 'hair', color: null },
      { slot: AvatarSlot.TOP, part: 'top', color: blue },
      { slot: AvatarSlot.ACCESSORY, part: 'a', color: null },
      { slot: AvatarSlot.ACCESSORY, part: 'b', color: null },
    ],
  };
  const configB: AvatarConfig = {
    base: { part: 'base', color: null },
    layers: [
      { slot: AvatarSlot.TOP, part: 'top', color: sameBlueWithExplicitMode },
      { slot: AvatarSlot.ACCESSORY, part: 'a', color: null },
      { slot: AvatarSlot.HAIR, part: 'hair', color: null },
      { slot: AvatarSlot.ACCESSORY, part: 'b', color: null },
    ],
  };

  assert.equal(avatarConfigCacheKey(configA), avatarConfigCacheKey(configB));

  const reversedAccessories: AvatarConfig = {
    ...configA,
    layers: [
      { slot: AvatarSlot.HAIR, part: 'hair', color: null },
      { slot: AvatarSlot.TOP, part: 'top', color: blue },
      { slot: AvatarSlot.ACCESSORY, part: 'b', color: null },
      { slot: AvatarSlot.ACCESSORY, part: 'a', color: null },
    ],
  };
  assert.notEqual(avatarConfigCacheKey(configA), avatarConfigCacheKey(reversedAccessories));

  const changedBrightness: AvatarConfig = {
    ...configA,
    layers: configA.layers.map((layer) =>
      layer.slot === AvatarSlot.TOP ? { ...layer, color: { ...blue, b: blue.b + 1 } } : layer,
    ),
  };
  const colorizeMode: AvatarConfig = {
    ...configA,
    layers: configA.layers.map((layer) =>
      layer.slot === AvatarSlot.TOP ? { ...layer, color: { ...blue, colorize: true } } : layer,
    ),
  };
  assert.notEqual(avatarConfigCacheKey(configA), avatarConfigCacheKey(changedBrightness));
  assert.notEqual(avatarConfigCacheKey(configA), avatarConfigCacheKey(colorizeMode));
  assert.match(avatarConfigCacheKey(configA), /210:10:-5:0:0/);
  assert.doesNotMatch(avatarConfigCacheKey(configA), /\[object Object\]/);
});
