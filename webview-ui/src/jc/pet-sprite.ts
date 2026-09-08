import type { PetAppearance, PetDirection, PetLineage } from '../../../shared/agent-pet.js';
import { PET_SPRITE_PALETTE } from '../constants.js';

/**
 * The companion's bare pixel body.  Clothing and job tools deliberately live
 * in other layers: this module only answers what the pet has grown into.
 */
export type { PetAppearance, PetDirection, PetLineage } from '../../../shared/agent-pet.js';
export { PET_SPRITE_PALETTE } from '../constants.js';
export interface PetSprite {
  width: number;
  height: number;
  pixels: (string | null)[][];
}

/** The small canvas surface the sprite renderer needs; keeps Node test builds DOM-free. */
export interface PetDrawingContext {
  fillStyle: string | object;
  fillRect(x: number, y: number, width: number, height: number): void;
}

const WIDTH = 26;
const STAGE_HEIGHTS = [12, 16, 21, 26, 29, 32] as const;
type PixelGrid = (string | null)[][];
const spriteCache = new Map<string, PetSprite>();

function grid(height: number): PixelGrid {
  return Array.from({ length: height }, () => Array<string | null>(WIDTH).fill(null));
}

function put(pixels: PixelGrid, x: number, y: number, color: string): void {
  if (y >= 0 && y < pixels.length && x >= 0 && x < WIDTH) pixels[y][x] = color;
}

function span(
  pixels: PixelGrid,
  y: number,
  from: number,
  to: number,
  color: string = PET_SPRITE_PALETTE.sage,
): void {
  for (let x = from; x <= to; x++) put(pixels, x, y, color);
}

/** Fill a rounded body from left/right extents, then give it a one-pixel outline. */
function body(pixels: PixelGrid, top: number, rows: readonly [number, number][]): void {
  for (let y = 0; y < rows.length; y++) {
    const [left, right] = rows[y];
    span(pixels, top + y, left, right);
  }
  const original = pixels.map((row) => row.slice());
  for (let y = 0; y < pixels.length; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (original[y][x] !== PET_SPRITE_PALETTE.sage) continue;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= pixels.length || nx < 0 || nx >= WIDTH || original[ny][nx] === null) {
          put(pixels, nx, ny, PET_SPRITE_PALETTE.dark);
        }
      }
    }
  }
}

function face(
  pixels: PixelGrid,
  y: number,
  leftEye: number,
  rightEye: number,
  cute: boolean,
): void {
  put(pixels, leftEye, y, PET_SPRITE_PALETTE.dark);
  put(pixels, rightEye, y, PET_SPRITE_PALETTE.dark);
  put(pixels, leftEye, y + 1, PET_SPRITE_PALETTE.dark);
  put(pixels, rightEye, y + 1, PET_SPRITE_PALETTE.dark);
  if (cute) {
    put(pixels, leftEye - 2, y + 2, PET_SPRITE_PALETTE.coral);
    put(pixels, rightEye + 2, y + 2, PET_SPRITE_PALETTE.coral);
  }
  const bellyRows = [
    [11, 14],
    [10, 15],
    [9, 16],
    [9, 16],
    [10, 15],
    [11, 14],
  ] as const;
  for (let row = 0; row < bellyRows.length; row++) {
    const [from, to] = bellyRows[row];
    span(pixels, y + 4 + row, from, to, PET_SPRITE_PALETTE.cream);
  }
}

function droplet(): PixelGrid {
  const pixels = grid(STAGE_HEIGHTS[0]);
  body(pixels, 0, [
    [12, 13],
    [11, 14],
    [10, 15],
    [9, 16],
    [9, 16],
    [9, 16],
    [10, 15],
    [10, 15],
    [11, 14],
    [11, 14],
  ]);
  put(pixels, 11, 4, PET_SPRITE_PALETTE.cream);
  put(pixels, 11, 5, PET_SPRITE_PALETTE.cream);
  put(pixels, 14, 8, PET_SPRITE_PALETTE.honey);
  return pixels;
}

function sprout(): PixelGrid {
  const pixels = grid(STAGE_HEIGHTS[1]);
  body(pixels, 3, [
    [11, 14],
    [10, 15],
    [9, 16],
    [8, 17],
    [8, 17],
    [8, 17],
    [9, 16],
    [9, 16],
    [10, 15],
    [10, 15],
    [11, 14],
  ]);
  sproutCrown(pixels, 3);
  armsAndFeet(pixels, 9, 14, 5, 1, false);
  face(pixels, 6, 11, 14, false);
  return pixels;
}

function neutral(stage: number): PixelGrid {
  const height = STAGE_HEIGHTS[stage];
  const pixels = grid(height);
  const top = stage === 2 ? 4 : stage === 3 ? 5 : 6;
  body(pixels, top, pearRows(height - top - 4, 8));
  // The unknown lineage stays a leaf-topped familiar, never silently becoming maru.
  sproutCrown(pixels, top);
  armsAndFeet(pixels, height - 9, height - 3, 8, stage, false);
  face(pixels, top + 4, 11, 14, false);
  return pixels;
}

/** A two-leaf crown and stem, painted after the body outline so it stays green. */
function sproutCrown(pixels: PixelGrid, bodyTop: number): void {
  const top = bodyTop - 3;
  put(pixels, 10, top, PET_SPRITE_PALETTE.sage);
  put(pixels, 15, top, PET_SPRITE_PALETTE.sage);
  span(pixels, top + 1, 9, 11, PET_SPRITE_PALETTE.sage);
  span(pixels, top + 1, 14, 16, PET_SPRITE_PALETTE.sage);
  span(pixels, top + 2, 10, 12, PET_SPRITE_PALETTE.sage);
  span(pixels, top + 2, 13, 15, PET_SPRITE_PALETTE.sage);
  span(pixels, bodyTop - 1, 12, 13, PET_SPRITE_PALETTE.sage);
}

function pearRows(count: number, halfWidth: number): [number, number][] {
  const center = 12;
  return Array.from({ length: count }, (_, y): [number, number] => {
    const grow = y < 2 ? 3 - y : y < 5 ? 1 : 0;
    const taper = y > count - 3 ? y - (count - 3) : 0;
    return [center - halfWidth + grow + taper, center + halfWidth - grow - taper];
  });
}

function armsAndFeet(
  pixels: PixelGrid,
  armY: number,
  feetY: number,
  halfWidth: number,
  stage: number,
  honeyFeet: boolean,
): void {
  const left = 12 - halfWidth - 1;
  const right = 12 + halfWidth + 1;
  // Little rounded arms sit outside the pear body, instead of reading as a capsule.
  for (const [x, direction] of [
    [left, -1],
    [right, 1],
  ] as const) {
    put(pixels, x, armY, PET_SPRITE_PALETTE.dark);
    put(pixels, x + direction, armY + 1, PET_SPRITE_PALETTE.dark);
    put(pixels, x + direction, armY + 2, PET_SPRITE_PALETTE.dark);
    put(pixels, x, armY + 1, PET_SPRITE_PALETTE.sage);
    put(pixels, x, armY + 2, PET_SPRITE_PALETTE.sage);
  }
  for (const center of [9, 15]) {
    span(pixels, feetY, center - 1, center + 1, PET_SPRITE_PALETTE.dark);
    span(
      pixels,
      feetY - 1,
      center,
      center,
      honeyFeet || stage === 5 ? PET_SPRITE_PALETTE.honey : PET_SPRITE_PALETTE.sage,
    );
  }
}

function animal(stage: number, lineage: PetLineage, direction: PetDirection | null): PixelGrid {
  const height = STAGE_HEIGHTS[stage];
  const pixels = grid(height);
  const adult = stage >= 3;
  const cute = adult && (direction === 'cute' || direction === 'mixed');
  const top = lineage === 'rabbit' ? (stage === 2 ? 8 : 10) : stage === 2 ? 5 : 7;
  const half = lineage === 'dog' ? 9 : lineage === 'maru' ? 8 : 8;
  body(pixels, top, pearRows(height - top - 4, half));

  switch (lineage) {
    case 'cat':
      ears(pixels, top, false, stage);
      curlTail(pixels, height - 10);
      break;
    case 'dog':
      floppyEars(pixels, top, stage);
      put(pixels, 20, height - 6, PET_SPRITE_PALETTE.sage);
      put(pixels, 21, height - 6, PET_SPRITE_PALETTE.honey);
      break;
    case 'rabbit':
      ears(pixels, top, true, stage);
      put(pixels, 21, height - 6, PET_SPRITE_PALETTE.cream);
      break;
    case 'maru':
      // Smooth outline: deliberately no ears, muzzle, tail or tufts.
      break;
  }
  armsAndFeet(pixels, height - 10, height - 3, half, stage, lineage === 'maru');
  const eyeY = top + (adult ? 5 : 4);
  face(pixels, eyeY, cute ? 10 : 11, cute ? 15 : 14, cute);
  if (lineage === 'dog') {
    span(pixels, eyeY + 2, 11, 14, PET_SPRITE_PALETTE.cream);
    put(pixels, 12, eyeY + 2, PET_SPRITE_PALETTE.dark);
  }
  if (stage === 5) honeyAccents(pixels, lineage, top, height);
  return pixels;
}

function ears(pixels: PixelGrid, top: number, long: boolean, stage: number): void {
  if (!long) {
    // Broad bases make these read as triangle ears rather than antennae.
    const earTop = top - (stage === 2 ? 4 : 5);
    for (const [y, leftFrom, leftTo, rightFrom, rightTo] of [
      [earTop, 8, 8, 17, 17],
      [earTop + 1, 7, 9, 16, 18],
      [earTop + 2, 7, 10, 15, 18],
      [earTop + 3, 8, 10, 15, 17],
      [earTop + 4, 8, 11, 14, 17],
    ] as const) {
      put(pixels, leftFrom - 1, y, PET_SPRITE_PALETTE.dark);
      put(pixels, rightTo + 1, y, PET_SPRITE_PALETTE.dark);
      span(
        pixels,
        y,
        leftFrom,
        leftTo,
        y === earTop ? PET_SPRITE_PALETTE.honey : PET_SPRITE_PALETTE.sage,
      );
      span(
        pixels,
        y,
        rightFrom,
        rightTo,
        y === earTop ? PET_SPRITE_PALETTE.honey : PET_SPRITE_PALETTE.sage,
      );
    }
    return;
  }
  const length = stage === 2 ? 7 : 10;
  const earTop = top - length;
  for (let i = 0; i < length; i++) {
    const y = earTop + i;
    const left = i < length - 2 ? 7 : 6;
    const right = i < length - 2 ? 15 : 16;
    // Five-pixel-wide rounded ears with a three-pixel cream inner, never antennae.
    if (i === 0) {
      put(pixels, left + 2, y, PET_SPRITE_PALETTE.honey);
      put(pixels, right + 2, y, PET_SPRITE_PALETTE.honey);
    } else if (i === 1) {
      span(pixels, y, left + 1, left + 3, PET_SPRITE_PALETTE.dark);
      span(pixels, y, right + 1, right + 3, PET_SPRITE_PALETTE.dark);
      put(pixels, left + 2, y, PET_SPRITE_PALETTE.cream);
      put(pixels, right + 2, y, PET_SPRITE_PALETTE.cream);
    } else {
      span(pixels, y, left, left + 4, PET_SPRITE_PALETTE.dark);
      span(pixels, y, right, right + 4, PET_SPRITE_PALETTE.dark);
      span(pixels, y, left + 1, left + 3, PET_SPRITE_PALETTE.cream);
      span(pixels, y, right + 1, right + 3, PET_SPRITE_PALETTE.cream);
    }
  }
}

function floppyEars(pixels: PixelGrid, top: number, stage: number): void {
  const length = stage === 2 ? 6 : 8;
  for (let i = 0; i < length; i++) {
    const left = i < 2 ? 3 : 2;
    const right = i < 2 ? 19 : 20;
    span(pixels, top + i, left, left + 3, PET_SPRITE_PALETTE.dark);
    span(pixels, top + i, right, right + 3, PET_SPRITE_PALETTE.dark);
    span(
      pixels,
      top + i,
      left + 1,
      left + 2,
      i === length - 1 ? PET_SPRITE_PALETTE.honey : PET_SPRITE_PALETTE.sage,
    );
    span(
      pixels,
      top + i,
      right + 1,
      right + 2,
      i === length - 1 ? PET_SPRITE_PALETTE.honey : PET_SPRITE_PALETTE.sage,
    );
  }
}

function curlTail(pixels: PixelGrid, y: number): void {
  span(pixels, y, 20, 22, PET_SPRITE_PALETTE.dark);
  put(pixels, 21, y + 1, PET_SPRITE_PALETTE.sage);
  put(pixels, 22, y + 1, PET_SPRITE_PALETTE.sage);
  put(pixels, 22, y + 2, PET_SPRITE_PALETTE.sage);
  put(pixels, 21, y + 3, PET_SPRITE_PALETTE.honey);
  put(pixels, 20, y + 3, PET_SPRITE_PALETTE.dark);
}

function honeyAccents(
  pixels: PixelGrid,
  lineage: Exclude<PetLineage, null>,
  top: number,
  height: number,
): void {
  span(pixels, height - 5, 11, 14, PET_SPRITE_PALETTE.honey);
  if (lineage === 'maru') span(pixels, height - 6, 12, 13, PET_SPRITE_PALETTE.honey);
  if (lineage === 'cat') put(pixels, 22, height - 8, PET_SPRITE_PALETTE.honey);
  if (lineage === 'dog') put(pixels, 7, top + 7, PET_SPRITE_PALETTE.honey);
}

/** Preserve the stage canvas height while removing tile-sized side gutters. */
function trimHorizontal(pixels: PixelGrid): PetSprite {
  let first = WIDTH;
  let last = -1;
  for (const row of pixels) {
    for (let x = 0; x < WIDTH; x++) {
      if (row[x] === null) continue;
      first = Math.min(first, x);
      last = Math.max(last, x);
    }
  }
  const width = last >= first ? last - first + 1 : 1;
  return { width, height: pixels.length, pixels: pixels.map((row) => row.slice(first, last + 1)) };
}

/**
 * A canonical, transparent-background sprite.  Stages are clamped because
 * this is only a renderer; it never changes the authoritative pet record.
 */
export function getPetSprite(stage: number, appearance: PetAppearance): PetSprite {
  const safeStage = Math.max(0, Math.min(5, Math.floor(Number.isFinite(stage) ? stage : 0)));
  const lineage = appearance.lineage;
  const cacheKey = `${safeStage}:${lineage ?? 'neutral'}:${appearance.direction ?? 'neutral'}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;
  const pixels =
    safeStage === 0
      ? droplet()
      : safeStage === 1
        ? sprout()
        : lineage === null
          ? neutral(safeStage)
          : animal(safeStage, lineage, appearance.direction);
  const sprite = trimHorizontal(pixels);
  spriteCache.set(cacheKey, sprite);
  return sprite;
}

/** Paint each source pixel as an integral canvas rectangle; no anti-aliasing. */
export function drawPetSprite(
  ctx: PetDrawingContext,
  x: number,
  y: number,
  pixelSize: number,
  sprite: PetSprite,
): void {
  for (let row = 0; row < sprite.height; row++) {
    for (let col = 0; col < sprite.width; col++) {
      const color = sprite.pixels[row]?.[col];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + col * pixelSize, y + row * pixelSize, pixelSize, pixelSize);
    }
  }
}
