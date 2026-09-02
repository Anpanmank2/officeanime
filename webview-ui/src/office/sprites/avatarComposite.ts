import type {
  AvatarSlot as AvatarSlotType,
  CharacterDirectionSprites,
} from '../../../../shared/assets/types.js';
import { getColorizedSprite } from '../colorize.js';
import type { Direction, FloorColor, SpriteData } from '../types.js';
import { Direction as Dir } from '../types.js';
import type { AvatarConfig, AvatarLayerConfig, LoadedAvatarParts } from './avatarTypes.js';
import {
  AVATAR_ACCESSORY_MAX,
  AvatarSlot,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
} from './avatarTypes.js';
import type { CharacterSprites } from './spriteData.js';

const SLOT_ORDER: Readonly<Record<AvatarSlotType, number>> = {
  [AvatarSlot.BASE]: 0,
  [AvatarSlot.BOTTOM]: 1,
  [AvatarSlot.TOP]: 2,
  [AvatarSlot.FACE]: 3,
  [AvatarSlot.HAIR]: 4,
  [AvatarSlot.ACCESSORY]: 5,
};

interface OrderedLayer {
  slot: AvatarSlotType;
  part: string;
  color: FloorColor | null;
  index: number;
}

function emptySprite(): SpriteData {
  return Array.from({ length: CHAR_FRAME_H }, () => new Array<string>(CHAR_FRAME_W).fill(''));
}

function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

export function overlaySprites(lower: SpriteData, upper: SpriteData): SpriteData {
  return lower.map((row, rowIndex) =>
    row.map((pixel, columnIndex) => upper[rowIndex]?.[columnIndex] || pixel),
  );
}

function colorKey(color: FloorColor | null): string {
  if (!color) return 'native';
  return `${color.h}:${color.s}:${color.b}:${color.c}:${color.colorize === true ? 1 : 0}`;
}

function orderedLayers(config: AvatarConfig): OrderedLayer[] {
  const layers: OrderedLayer[] = [
    { slot: AvatarSlot.BASE, part: config.base.part, color: config.base.color, index: -1 },
  ];
  const seenSlots = new Set<AvatarSlotType>();
  let accessoryCount = 0;
  config.layers.forEach((layer: AvatarLayerConfig, index) => {
    if (layer.slot === AvatarSlot.ACCESSORY) {
      if (accessoryCount >= AVATAR_ACCESSORY_MAX) return;
      accessoryCount += 1;
    } else {
      if (seenSlots.has(layer.slot)) return;
      seenSlots.add(layer.slot);
    }
    layers.push({ ...layer, index });
  });
  return layers.sort(
    (left, right) => SLOT_ORDER[left.slot] - SLOT_ORDER[right.slot] || left.index - right.index,
  );
}

function resolveFrame(
  layer: OrderedLayer,
  direction: keyof CharacterDirectionSprites,
  frameIndex: number,
  parts: LoadedAvatarParts,
  catalogById: ReadonlyMap<string, LoadedAvatarParts['catalog'][number]>,
): SpriteData | null {
  const asset = catalogById.get(layer.part);
  const frame = parts.sprites.get(layer.part)?.[direction][frameIndex];
  if (!asset || !frame || asset.slot !== layer.slot) return null;
  if (!asset.colorable || !layer.color) return frame;
  const key = `avatar:${layer.part}:${direction}:${frameIndex}:${colorKey(layer.color)}`;
  return getColorizedSprite(key, frame, layer.color);
}

function composeDirection(
  direction: keyof CharacterDirectionSprites,
  layers: OrderedLayer[],
  parts: LoadedAvatarParts,
  catalogById: ReadonlyMap<string, LoadedAvatarParts['catalog'][number]>,
): SpriteData[] {
  return Array.from({ length: CHAR_FRAMES_PER_ROW }, (_, frameIndex) => {
    let result = emptySprite();
    for (const layer of layers) {
      const frame = resolveFrame(layer, direction, frameIndex, parts, catalogById);
      if (frame) result = overlaySprites(result, frame);
    }
    return result;
  });
}

function asWalk(frames: SpriteData[]): [SpriteData, SpriteData, SpriteData, SpriteData] {
  return [frames[0], frames[1], frames[2], frames[1]];
}

function asPair(frames: SpriteData[], offset: number): [SpriteData, SpriteData] {
  return [frames[offset], frames[offset + 1]];
}

function asThinking(frames: SpriteData[]): [SpriteData, SpriteData, SpriteData] {
  return [frames[7] ?? frames[1], frames[8] ?? frames[1], frames[9] ?? frames[1]];
}

export function composeAvatar(config: AvatarConfig, parts: LoadedAvatarParts): CharacterSprites {
  const catalogById = new Map(parts.catalog.map((asset) => [asset.id, asset]));
  const layers = orderedLayers(config);
  const down = composeDirection('down', layers, parts, catalogById);
  const up = composeDirection('up', layers, parts, catalogById);
  const right = composeDirection('right', layers, parts, catalogById);
  const left = right.map(flipSpriteHorizontal);
  const error: [SpriteData, SpriteData, SpriteData] = [down[10], up[10], right[10]];

  return {
    walk: {
      [Dir.DOWN]: asWalk(down),
      [Dir.UP]: asWalk(up),
      [Dir.RIGHT]: asWalk(right),
      [Dir.LEFT]: asWalk(left),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: asPair(down, 3),
      [Dir.UP]: asPair(up, 3),
      [Dir.RIGHT]: asPair(right, 3),
      [Dir.LEFT]: asPair(left, 3),
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: asPair(down, 5),
      [Dir.UP]: asPair(up, 5),
      [Dir.RIGHT]: asPair(right, 5),
      [Dir.LEFT]: asPair(left, 5),
    } as Record<Direction, [SpriteData, SpriteData]>,
    thinking: {
      [Dir.DOWN]: asThinking(down),
      [Dir.UP]: asThinking(up),
      [Dir.RIGHT]: asThinking(right),
      [Dir.LEFT]: asThinking(left),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData]>,
    error: {
      [Dir.DOWN]: error,
      [Dir.UP]: error,
      [Dir.RIGHT]: error,
      [Dir.LEFT]: error,
    } as Record<Direction, [SpriteData, SpriteData, SpriteData]>,
  };
}

export function avatarConfigCacheKey(config: AvatarConfig): string {
  return orderedLayers(config)
    .map((layer) => `${layer.slot}:${layer.part}:${colorKey(layer.color)}`)
    .join('|');
}
