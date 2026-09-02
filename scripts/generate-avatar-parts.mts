import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import type { AvatarSlot } from '../shared/assets/types.ts';

const require = createRequire(import.meta.url);
const {
  AVATAR_ATLAS_HEIGHT,
  AVATAR_ATLAS_WIDTH,
  AVATAR_DEFAULTS_REVISION,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
} = require('../shared/assets/constants.ts') as typeof import('../shared/assets/constants.ts');

type Direction = (typeof CHARACTER_DIRECTIONS)[number];
type Action = 'walk' | 'type' | 'read' | 'think' | 'error';

interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
}

interface AvatarLayerConfig {
  slot: Exclude<AvatarSlot, 'base'>;
  part: string;
  color: FloorColor | null;
}

interface AvatarConfig {
  base: { part: string; color: FloorColor | null };
  layers: AvatarLayerConfig[];
}

interface Pose {
  direction: Direction;
  column: number;
  action: Action;
  gait: -1 | 0 | 1;
  headDx: number;
  headDy: number;
  bodyDy: number;
  errorStep: 0 | 1 | 2 | null;
}

interface PartDefinition {
  id: string;
  slot: AvatarSlot;
  name: string;
  colorable: boolean;
  draw: (canvas: CellCanvas, pose: Pose) => void;
}

interface AvatarDesign {
  id: string;
  bottom: string;
  top: string;
  face: string;
  hair: string;
  accessories: string[];
  topColor: FloorColor;
  bottomColor: FloorColor;
  hairColor: FloorColor | null;
}

type Rgba = readonly [number, number, number, number];

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const ASSETS_ROOT = path.join(REPO_ROOT, 'webview-ui', 'public', 'assets');
const AVATAR_ROOT = path.join(ASSETS_ROOT, 'avatar-parts');
const DEFAULT_AVATARS_PATH = path.join(ASSETS_ROOT, 'default-avatars.json');
const JC_CONFIG_PATH = path.join(REPO_ROOT, 'jc-config.json');

const TRANSPARENT: Rgba = [0, 0, 0, 0];
const SKIN_DARK = '#8F654A';
const SKIN_MID = '#D39B72';
const SKIN_LIGHT = '#F0C89D';
const GARMENT_DARK = '#41464D';
const GARMENT_MID = '#737B84';
const GARMENT_LIGHT = '#B1B8BF';
const GARMENT_HIGHLIGHT = '#D9DDE1';
const HAIR_DARK = '#292C30';
const HAIR_MID = '#555A60';
const HAIR_LIGHT = '#858B91';
const INK = '#2B2527';
const PAPER = '#E9E2D1';
const METAL = '#A8B0B8';
const GOLD = '#D6A43C';
const RED = '#C84E4E';
const BLUE = '#4D86B8';
const TEAL = '#3F9B91';
const VIOLET = '#8668B3';

function rgba(hex: string): Rgba {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6 && normalized.length !== 8) {
    throw new Error(`Invalid color: ${hex}`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255,
  ];
}

class CellCanvas {
  constructor(
    private readonly png: PNG,
    private readonly offsetX: number,
    private readonly offsetY: number,
  ) {}

  pixel(x: number, y: number, color: string | Rgba): void {
    if (x < 0 || x >= CHAR_FRAME_W || y < 0 || y >= CHAR_FRAME_H) return;
    const [r, g, b, a] = typeof color === 'string' ? rgba(color) : color;
    const index = ((this.offsetY + y) * this.png.width + this.offsetX + x) * 4;
    this.png.data[index] = r;
    this.png.data[index + 1] = g;
    this.png.data[index + 2] = b;
    this.png.data[index + 3] = a;
  }

  rect(x: number, y: number, width: number, height: number, color: string | Rgba): void {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) this.pixel(column, row, color);
    }
  }

  hLine(x: number, y: number, width: number, color: string | Rgba): void {
    this.rect(x, y, width, 1, color);
  }

  vLine(x: number, y: number, height: number, color: string | Rgba): void {
    this.rect(x, y, 1, height, color);
  }

  points(points: ReadonlyArray<readonly [number, number]>, color: string | Rgba): void {
    for (const [x, y] of points) this.pixel(x, y, color);
  }
}

function poseFor(row: number, column: number): Pose {
  if (column === 10) {
    const errorStep = row as 0 | 1 | 2;
    return {
      direction: 'down',
      column,
      action: 'error',
      gait: 0,
      headDx: 0,
      headDy: errorStep === 2 ? 1 : 0,
      bodyDy: errorStep === 2 ? 1 : 0,
      errorStep,
    };
  }
  const action: Action =
    column <= 2 ? 'walk' : column <= 4 ? 'type' : column <= 6 ? 'read' : 'think';
  const gait: -1 | 0 | 1 = column === 0 ? -1 : column === 2 ? 1 : 0;
  const headDx = action === 'think' ? column - 8 : 0;
  return {
    direction: CHARACTER_DIRECTIONS[row],
    column,
    action,
    gait,
    headDx,
    headDy: 0,
    bodyDy: 0,
    errorStep: null,
  };
}

function drawHead(canvas: CellCanvas, pose: Pose): void {
  const x = pose.headDx;
  const y = pose.headDy;
  if (pose.direction === 'right') {
    canvas.hLine(7 + x, 9 + y, 4, SKIN_DARK);
    canvas.rect(6 + x, 10 + y, 6, 6, SKIN_DARK);
    canvas.rect(7 + x, 10 + y, 4, 6, SKIN_MID);
    canvas.rect(8 + x, 10 + y, 3, 3, SKIN_LIGHT);
    canvas.pixel(12 + x, 13 + y, SKIN_DARK);
    canvas.pixel(12 + x, 14 + y, SKIN_MID);
    canvas.pixel(5 + x, 13 + y, SKIN_DARK);
    canvas.rect(7 + x, 16 + y, 3, 2, SKIN_MID);
    return;
  }
  canvas.hLine(6 + x, 9 + y, 4, SKIN_DARK);
  canvas.rect(5 + x, 10 + y, 6, 6, SKIN_DARK);
  canvas.rect(6 + x, 10 + y, 4, 6, SKIN_MID);
  canvas.rect(6 + x, 10 + y, 3, 3, SKIN_LIGHT);
  canvas.points(
    [
      [4 + x, 12 + y],
      [4 + x, 13 + y],
      [11 + x, 12 + y],
      [11 + x, 13 + y],
    ],
    SKIN_MID,
  );
  canvas.hLine(6 + x, 16 + y, 4, SKIN_DARK);
  canvas.rect(7 + x, 16 + y, 2, 2, SKIN_MID);
}

function drawBaseArms(canvas: CellCanvas, pose: Pose): void {
  const y = pose.bodyDy;
  if (pose.action === 'error') {
    if (pose.errorStep === 0) {
      canvas.vLine(3, 14, 7, SKIN_DARK);
      canvas.vLine(12, 14, 7, SKIN_DARK);
      canvas.pixel(3, 13, SKIN_LIGHT);
      canvas.pixel(12, 13, SKIN_LIGHT);
    } else if (pose.errorStep === 1) {
      canvas.vLine(4, 14, 6, SKIN_DARK);
      canvas.vLine(11, 14, 6, SKIN_DARK);
      canvas.points(
        [
          [4, 12],
          [5, 12],
          [10, 12],
          [11, 12],
        ],
        SKIN_LIGHT,
      );
    } else {
      canvas.vLine(4, 20 + y, 5, SKIN_DARK);
      canvas.vLine(11, 20 + y, 5, SKIN_DARK);
      canvas.pixel(4, 25 + y, SKIN_LIGHT);
      canvas.pixel(11, 25 + y, SKIN_LIGHT);
    }
    return;
  }
  if (pose.direction === 'right') {
    if (pose.action === 'type' || pose.action === 'read') {
      canvas.rect(10, 20, 4, 2, SKIN_DARK);
      canvas.pixel(14, 21, SKIN_LIGHT);
    } else if (pose.action === 'think') {
      canvas.vLine(11, 18, 4, SKIN_DARK);
      canvas.pixel(12 + pose.headDx, 15 + pose.headDy, SKIN_LIGHT);
    } else {
      canvas.vLine(11, 19 + (pose.gait === 1 ? 1 : 0), 6, SKIN_DARK);
      canvas.pixel(11, 25 + (pose.gait === 1 ? 1 : 0), SKIN_LIGHT);
    }
    canvas.vLine(5, 19 + (pose.gait === -1 ? 1 : 0), 5, SKIN_MID);
    return;
  }
  if (pose.action === 'type' || pose.action === 'read') {
    canvas.rect(3, 20, 4, 2, SKIN_DARK);
    canvas.rect(9, 20, 4, 2, SKIN_DARK);
    canvas.pixel(6, 22, SKIN_LIGHT);
    canvas.pixel(9, 22, SKIN_LIGHT);
  } else if (pose.action === 'think') {
    canvas.vLine(4, 19, 6, SKIN_DARK);
    canvas.vLine(11, 18, 3, SKIN_DARK);
    canvas.pixel(10 + pose.headDx, 15 + pose.headDy, SKIN_LIGHT);
    canvas.pixel(4, 25, SKIN_LIGHT);
  } else {
    const leftOffset = pose.gait === -1 ? -1 : pose.gait === 1 ? 1 : 0;
    canvas.vLine(4, 19 + Math.max(0, leftOffset), 6, SKIN_DARK);
    canvas.vLine(11, 19 + Math.max(0, -leftOffset), 6, SKIN_DARK);
    canvas.pixel(4, 25 + Math.max(0, leftOffset), SKIN_LIGHT);
    canvas.pixel(11, 25 + Math.max(0, -leftOffset), SKIN_LIGHT);
  }
}

function drawBase(canvas: CellCanvas, pose: Pose): void {
  drawHead(canvas, pose);
  const y = pose.bodyDy;
  if (pose.direction === 'right') {
    canvas.rect(6, 18 + y, 6, 7, SKIN_DARK);
    canvas.rect(7, 18 + y, 4, 6, SKIN_MID);
    canvas.rect(7, 19 + y, 2, 3, SKIN_LIGHT);
    canvas.rect(6, 24 + y, 2, 7, SKIN_DARK);
    canvas.rect(9, 24 + y, 2, 7, SKIN_MID);
  } else {
    canvas.rect(5, 18 + y, 6, 7, SKIN_DARK);
    canvas.rect(6, 18 + y, 4, 6, SKIN_MID);
    canvas.rect(6, 19 + y, 2, 3, SKIN_LIGHT);
    canvas.rect(5, 24 + y, 3, 7, SKIN_DARK);
    canvas.rect(8, 24 + y, 3, 7, SKIN_MID);
  }
  drawBaseArms(canvas, pose);
}

function drawTailoredBottom(canvas: CellCanvas, pose: Pose): void {
  const y = pose.bodyDy;
  const leftShift = pose.gait === -1 ? -1 : 0;
  const rightShift = pose.gait === 1 ? 1 : 0;
  if (pose.direction === 'right') {
    canvas.rect(6, 23 + y, 6, 3, GARMENT_DARK);
    canvas.rect(7, 24 + y, 4, 2, GARMENT_MID);
    canvas.rect(6 + leftShift, 26 + y, 2, 5, GARMENT_DARK);
    canvas.rect(9 + rightShift, 26 + y, 2, 5, GARMENT_MID);
    canvas.rect(5 + leftShift, 30 + y, 3, 2, '#292D33');
    canvas.rect(9 + rightShift, 30 + y, 3, 2, '#292D33');
    return;
  }
  canvas.rect(5, 23 + y, 6, 3, GARMENT_DARK);
  canvas.rect(6, 24 + y, 4, 2, GARMENT_LIGHT);
  canvas.rect(5 + leftShift, 26 + y, 3, 5, GARMENT_DARK);
  canvas.rect(8 + rightShift, 26 + y, 3, 5, GARMENT_MID);
  canvas.rect(4 + leftShift, 30 + y, 4, 2, '#292D33');
  canvas.rect(8 + rightShift, 30 + y, 4, 2, '#292D33');
}

function drawRelaxedBottom(canvas: CellCanvas, pose: Pose): void {
  const y = pose.bodyDy;
  const leftShift = pose.gait === -1 ? -1 : 0;
  const rightShift = pose.gait === 1 ? 1 : 0;
  if (pose.direction === 'right') {
    canvas.rect(5, 23 + y, 8, 4, GARMENT_DARK);
    canvas.rect(6, 24 + y, 6, 3, GARMENT_MID);
    canvas.rect(5 + leftShift, 27 + y, 3, 4, GARMENT_MID);
    canvas.rect(9 + rightShift, 27 + y, 3, 4, GARMENT_DARK);
    canvas.rect(4 + leftShift, 30 + y, 5, 2, GARMENT_HIGHLIGHT);
    canvas.rect(9 + rightShift, 30 + y, 5, 2, GARMENT_HIGHLIGHT);
    return;
  }
  canvas.rect(4, 23 + y, 8, 4, GARMENT_DARK);
  canvas.rect(5, 24 + y, 6, 3, GARMENT_MID);
  canvas.rect(4 + leftShift, 27 + y, 4, 4, GARMENT_MID);
  canvas.rect(8 + rightShift, 27 + y, 4, 4, GARMENT_DARK);
  canvas.rect(3 + leftShift, 30 + y, 5, 2, GARMENT_HIGHLIGHT);
  canvas.rect(8 + rightShift, 30 + y, 5, 2, GARMENT_HIGHLIGHT);
}

function drawTopSleeves(canvas: CellCanvas, pose: Pose, wide = false, rolled = false): void {
  const y = pose.bodyDy;
  const left = wide ? 3 : 4;
  const right = wide ? 12 : 11;
  if (pose.action === 'error') {
    if (pose.errorStep === 0) {
      canvas.vLine(left, 15, 5, GARMENT_DARK);
      canvas.vLine(right, 15, 5, GARMENT_MID);
    } else if (pose.errorStep === 1) {
      canvas.vLine(left + 1, 15, 4, GARMENT_DARK);
      canvas.vLine(right - 1, 15, 4, GARMENT_MID);
    } else {
      canvas.vLine(left, 20 + y, 4, GARMENT_DARK);
      canvas.vLine(right, 20 + y, 4, GARMENT_MID);
    }
    return;
  }
  if (pose.direction === 'right') {
    if (pose.action === 'type' || pose.action === 'read') {
      canvas.rect(9, 19 + y, 4, 2, GARMENT_MID);
    } else {
      canvas.vLine(wide ? 12 : 11, 19 + y, rolled ? 3 : 5, GARMENT_MID);
      canvas.vLine(5, 19 + y, rolled ? 3 : 4, GARMENT_DARK);
    }
    return;
  }
  if (pose.action === 'type' || pose.action === 'read') {
    canvas.rect(left, 19 + y, 3, 2, GARMENT_DARK);
    canvas.rect(right - 2, 19 + y, 3, 2, GARMENT_MID);
    return;
  }
  canvas.vLine(left, 19 + y, rolled ? 3 : 5, GARMENT_DARK);
  canvas.vLine(right, 19 + y, rolled ? 3 : 5, GARMENT_MID);
}

function torso(
  canvas: CellCanvas,
  pose: Pose,
  left: number,
  right: number,
  top: number,
  bottom: number,
): void {
  const y = pose.bodyDy;
  canvas.rect(left, top + y, right - left + 1, bottom - top + 1, GARMENT_DARK);
  if (right - left >= 4 && bottom - top >= 2) {
    canvas.rect(left + 1, top + 1 + y, right - left - 1, bottom - top - 1, GARMENT_MID);
    canvas.vLine(left + 1, top + 1 + y, Math.max(1, bottom - top - 1), GARMENT_LIGHT);
  }
}

function drawTop(style: string, canvas: CellCanvas, pose: Pose): void {
  const side = pose.direction === 'right';
  if (style === 'shirt_button') {
    torso(canvas, pose, side ? 6 : 5, side ? 11 : 10, 18, 24);
    drawTopSleeves(canvas, pose);
    canvas.vLine(side ? 9 : 7, 19 + pose.bodyDy, 5, GARMENT_HIGHLIGHT);
    canvas.points(
      [
        [side ? 9 : 8, 20 + pose.bodyDy],
        [side ? 9 : 8, 22 + pose.bodyDy],
      ],
      GARMENT_DARK,
    );
  } else if (style === 'hoodie_plain') {
    torso(canvas, pose, side ? 5 : 4, side ? 12 : 11, 18, 25);
    drawTopSleeves(canvas, pose, true);
    canvas.rect(side ? 6 : 5, 17 + pose.bodyDy, 6, 2, GARMENT_DARK);
    canvas.hLine(side ? 7 : 6, 23 + pose.bodyDy, 4, GARMENT_LIGHT);
    canvas.points(
      [
        [side ? 8 : 7, 19 + pose.bodyDy],
        [side ? 10 : 9, 19 + pose.bodyDy],
      ],
      GARMENT_HIGHLIGHT,
    );
  } else if (style === 'blazer_clean') {
    torso(canvas, pose, side ? 5 : 3, side ? 12 : 12, 18, 26);
    drawTopSleeves(canvas, pose, true);
    canvas.points(
      [
        [side ? 7 : 6, 19 + pose.bodyDy],
        [side ? 8 : 7, 20 + pose.bodyDy],
        [side ? 10 : 9, 19 + pose.bodyDy],
        [side ? 9 : 8, 20 + pose.bodyDy],
      ],
      GARMENT_HIGHLIGHT,
    );
    canvas.vLine(side ? 9 : 7, 21 + pose.bodyDy, 5, GARMENT_DARK);
  } else if (style === 'outfit_layered') {
    torso(canvas, pose, side ? 4 : 2, side ? 12 : 12, 18, 26);
    drawTopSleeves(canvas, pose, true);
    canvas.rect(side ? 5 : 3, 24 + pose.bodyDy, 4, 4, GARMENT_DARK);
    canvas.rect(side ? 9 : 8, 23 + pose.bodyDy, 4, 3, GARMENT_LIGHT);
    canvas.vLine(side ? 8 : 7, 18 + pose.bodyDy, 8, GARMENT_HIGHLIGHT);
  } else if (style === 'shirt_rolled') {
    torso(canvas, pose, side ? 6 : 5, side ? 11 : 10, 18, 24);
    drawTopSleeves(canvas, pose, false, true);
    canvas.hLine(side ? 6 : 5, 21 + pose.bodyDy, 6, GARMENT_LIGHT);
    canvas.vLine(side ? 9 : 7, 18 + pose.bodyDy, 6, GARMENT_HIGHLIGHT);
  } else if (style === 'blouse_clean') {
    torso(canvas, pose, side ? 6 : 4, side ? 11 : 11, 19, 25);
    drawTopSleeves(canvas, pose);
    canvas.points(
      [
        [side ? 7 : 6, 18 + pose.bodyDy],
        [side ? 8 : 7, 19 + pose.bodyDy],
        [side ? 10 : 9, 18 + pose.bodyDy],
        [side ? 9 : 8, 19 + pose.bodyDy],
      ],
      GARMENT_HIGHLIGHT,
    );
    canvas.hLine(side ? 7 : 6, 24 + pose.bodyDy, 4, GARMENT_LIGHT);
  } else if (style === 'streetwear_oversized') {
    torso(canvas, pose, side ? 4 : 2, side ? 13 : 13, 18, 26);
    drawTopSleeves(canvas, pose, true);
    canvas.rect(side ? 5 : 3, 18 + pose.bodyDy, 3, 8, GARMENT_LIGHT);
    canvas.rect(side ? 10 : 9, 20 + pose.bodyDy, 3, 6, GARMENT_MID);
    canvas.pixel(side ? 13 : 2, 24 + pose.bodyDy, GARMENT_HIGHLIGHT);
  } else if (style === 'jacket_field') {
    torso(canvas, pose, side ? 5 : 3, side ? 12 : 12, 17, 27);
    drawTopSleeves(canvas, pose, true);
    canvas.rect(side ? 6 : 4, 20 + pose.bodyDy, 3, 3, GARMENT_LIGHT);
    canvas.rect(side ? 10 : 9, 20 + pose.bodyDy, 3, 3, GARMENT_LIGHT);
    canvas.hLine(side ? 6 : 4, 24 + pose.bodyDy, side ? 6 : 9, GARMENT_DARK);
    canvas.points(
      [
        [side ? 7 : 6, 17 + pose.bodyDy],
        [side ? 10 : 9, 17 + pose.bodyDy],
      ],
      GARMENT_HIGHLIGHT,
    );
  } else {
    throw new Error(`Unknown top: ${style}`);
  }
}

function hairPalette(style: string): { dark: string; mid: string; light: string; accent: string } {
  if (style === 'hair_bob_streak') {
    return { dark: '#35243F', mid: '#704A83', light: '#B06BC2', accent: '#39C6CF' };
  }
  if (style === 'hair_business_gray') {
    return { dark: '#30343A', mid: '#555B64', light: '#959DA8', accent: '#D2D5D9' };
  }
  return { dark: HAIR_DARK, mid: HAIR_MID, light: HAIR_LIGHT, accent: HAIR_LIGHT };
}

function drawBasicCap(
  canvas: CellCanvas,
  pose: Pose,
  palette: ReturnType<typeof hairPalette>,
  width = 0,
): void {
  const x = pose.headDx;
  const y = pose.headDy;
  if (pose.direction === 'right') {
    canvas.hLine(7 + x - width, 8 + y, 4 + width, palette.dark);
    canvas.rect(6 + x - width, 9 + y, 6 + width, 4, palette.dark);
    canvas.rect(7 + x - width, 9 + y, 4 + width, 2, palette.mid);
    canvas.hLine(8 + x, 9 + y, 3, palette.light);
    return;
  }
  canvas.hLine(6 + x - width, 8 + y, 4 + width * 2, palette.dark);
  canvas.rect(5 + x - width, 9 + y, 6 + width * 2, 4, palette.dark);
  canvas.rect(6 + x - width, 9 + y, 4 + width * 2, 2, palette.mid);
  canvas.hLine(7 + x, 9 + y, 3, palette.light);
}

function drawHair(style: string, canvas: CellCanvas, pose: Pose): void {
  const p = hairPalette(style);
  const x = pose.headDx;
  const y = pose.headDy;
  const side = pose.direction === 'right';

  if (style === 'hair_crop_plain') {
    drawBasicCap(canvas, pose, p);
    if (side) canvas.vLine(6 + x, 11 + y, 3, p.mid);
    else
      canvas.points(
        [
          [5 + x, 11 + y],
          [10 + x, 11 + y],
        ],
        p.mid,
      );
  } else if (style === 'hair_sidepart_neat') {
    drawBasicCap(canvas, pose, p);
    if (side) {
      canvas.vLine(6 + x, 11 + y, 5, p.dark);
      canvas.points(
        [
          [9 + x, 11 + y],
          [10 + x, 12 + y],
          [11 + x, 12 + y],
        ],
        p.light,
      );
    } else {
      canvas.vLine(5 + x, 11 + y, 5, p.dark);
      canvas.points(
        [
          [7 + x, 11 + y],
          [8 + x, 12 + y],
          [9 + x, 12 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_bob_streak') {
    drawBasicCap(canvas, pose, p, 1);
    if (side) {
      canvas.vLine(5 + x, 11 + y, 8, p.dark);
      canvas.vLine(12 + x, 11 + y, 7, p.mid);
      canvas.vLine(11 + x, 10 + y, 6, p.accent);
      canvas.hLine(5 + x, 18 + y, 8, p.dark);
    } else {
      canvas.vLine(4 + x, 11 + y, 8, p.dark);
      canvas.vLine(11 + x, 11 + y, 8, p.mid);
      canvas.vLine(9 + x, 10 + y, 7, p.accent);
      canvas.points(
        [
          [5 + x, 19 + y],
          [10 + x, 19 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_ponytail_neat') {
    drawBasicCap(canvas, pose, p);
    if (side) {
      canvas.rect(3 + x, 12 + y, 3, 3, p.dark);
      canvas.vLine(3 + x, 15 + y, 7, p.mid);
      canvas.pixel(2 + x, 21 + y, p.light);
    } else {
      canvas.rect(11 + x, 12 + y, 3, 3, p.dark);
      canvas.vLine(13 + x, 15 + y, 7, p.mid);
      canvas.pixel(12 + x, 21 + y, p.light);
    }
  } else if (style === 'hair_wavy_shoulder') {
    drawBasicCap(canvas, pose, p, 1);
    if (side) {
      canvas.points(
        [
          [5 + x, 12 + y],
          [4 + x, 13 + y],
          [5 + x, 14 + y],
          [4 + x, 15 + y],
          [4 + x, 17 + y],
          [3 + x, 19 + y],
          [4 + x, 21 + y],
        ],
        p.dark,
      );
      canvas.vLine(12 + x, 12 + y, 9, p.mid);
    } else {
      for (let row = 12; row <= 21; row += 1) {
        canvas.pixel(4 + x + (row % 2), row + y, p.dark);
        canvas.pixel(11 + x - (row % 2), row + y, p.mid);
      }
      canvas.points(
        [
          [3 + x, 20 + y],
          [12 + x, 20 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_tousled_medium') {
    drawBasicCap(canvas, pose, p, 1);
    canvas.points(
      side
        ? [
            [5 + x, 8 + y],
            [7 + x, 8 + y],
            [10 + x, 8 + y],
            [12 + x, 10 + y],
            [5 + x, 15 + y],
            [12 + x, 16 + y],
          ]
        : [
            [4 + x, 9 + y],
            [5 + x, 8 + y],
            [7 + x, 8 + y],
            [10 + x, 8 + y],
            [11 + x, 9 + y],
            [4 + x, 16 + y],
            [11 + x, 17 + y],
          ],
      p.light,
    );
    canvas.vLine(side ? 5 + x : 4 + x, 12 + y, 6, p.dark);
  } else if (style === 'hair_business_sharp') {
    drawBasicCap(canvas, pose, p);
    canvas.points(
      side
        ? [
            [6 + x, 10 + y],
            [7 + x, 9 + y],
            [8 + x, 10 + y],
            [11 + x, 11 + y],
          ]
        : [
            [5 + x, 10 + y],
            [7 + x, 9 + y],
            [8 + x, 10 + y],
            [10 + x, 11 + y],
          ],
      p.light,
    );
    canvas.pixel(side ? 6 + x : 5 + x, 14 + y, p.dark);
  } else if (style === 'hair_wavy_gathered') {
    drawBasicCap(canvas, pose, p, 1);
    if (side) {
      canvas.rect(3 + x, 13 + y, 3, 4, p.dark);
      canvas.rect(2 + x, 15 + y, 3, 4, p.mid);
      canvas.points(
        [
          [12 + x, 14 + y],
          [12 + x, 16 + y],
          [11 + x, 18 + y],
        ],
        p.light,
      );
    } else {
      canvas.rect(11 + x, 13 + y, 4, 4, p.dark);
      canvas.rect(12 + x, 16 + y, 3, 4, p.mid);
      canvas.points(
        [
          [4 + x, 14 + y],
          [3 + x, 16 + y],
          [4 + x, 18 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_medium_straight') {
    drawBasicCap(canvas, pose, p, 1);
    if (side) {
      canvas.vLine(5 + x, 11 + y, 9, p.dark);
      canvas.vLine(12 + x, 11 + y, 8, p.mid);
    } else {
      canvas.vLine(4 + x, 11 + y, 9, p.dark);
      canvas.vLine(11 + x, 11 + y, 9, p.mid);
      canvas.points(
        [
          [5 + x, 19 + y],
          [10 + x, 19 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_high_pony') {
    drawBasicCap(canvas, pose, p);
    if (side) {
      canvas.rect(2 + x, 9 + y, 4, 3, p.dark);
      canvas.rect(1 + x, 11 + y, 4, 5, p.mid);
      canvas.points(
        [
          [1 + x, 16 + y],
          [2 + x, 18 + y],
          [3 + x, 19 + y],
        ],
        p.light,
      );
    } else {
      canvas.rect(11 + x, 9 + y, 4, 3, p.dark);
      canvas.rect(12 + x, 11 + y, 4, 5, p.mid);
      canvas.points(
        [
          [14 + x, 16 + y],
          [13 + x, 18 + y],
          [12 + x, 19 + y],
        ],
        p.light,
      );
    }
  } else if (style === 'hair_long_straight') {
    drawBasicCap(canvas, pose, p, 1);
    if (side) {
      canvas.rect(4 + x, 11 + y, 3, 13, p.dark);
      canvas.rect(11 + x, 11 + y, 3, 12, p.mid);
      canvas.vLine(12 + x, 12 + y, 10, p.light);
    } else if (pose.direction === 'up') {
      canvas.rect(4 + x, 11 + y, 8, 12, p.dark);
      canvas.rect(6 + x, 11 + y, 5, 11, p.mid);
      canvas.vLine(9 + x, 12 + y, 9, p.light);
    } else {
      canvas.rect(3 + x, 11 + y, 3, 13, p.dark);
      canvas.rect(10 + x, 11 + y, 3, 13, p.mid);
      canvas.vLine(11 + x, 12 + y, 11, p.light);
    }
  } else if (style === 'hair_short_spiky') {
    drawBasicCap(canvas, pose, p, 1);
    canvas.points(
      side
        ? [
            [4 + x, 10 + y],
            [5 + x, 8 + y],
            [8 + x, 8 + y],
            [11 + x, 8 + y],
            [13 + x, 10 + y],
            [12 + x, 14 + y],
          ]
        : [
            [3 + x, 10 + y],
            [5 + x, 8 + y],
            [8 + x, 8 + y],
            [11 + x, 8 + y],
            [12 + x, 10 + y],
            [4 + x, 15 + y],
            [11 + x, 15 + y],
          ],
      p.light,
    );
  } else if (style === 'hair_updo') {
    canvas.rect(6 + x, 8 + y, 4, 2, p.dark);
    canvas.rect(5 + x, 9 + y, 6, 3, p.mid);
    canvas.hLine(6 + x, 9 + y, 4, p.light);
    if (side) {
      canvas.rect(6 + x, 11 + y, 6, 3, p.dark);
      canvas.vLine(6 + x, 13 + y, 3, p.mid);
    } else {
      canvas.rect(5 + x, 11 + y, 6, 3, p.dark);
      canvas.points(
        [
          [5 + x, 14 + y],
          [10 + x, 14 + y],
        ],
        p.mid,
      );
    }
  } else if (style === 'hair_business_gray') {
    drawBasicCap(canvas, pose, p);
    if (side) {
      canvas.vLine(6 + x, 11 + y, 5, p.dark);
      canvas.points(
        [
          [6 + x, 14 + y],
          [7 + x, 13 + y],
          [11 + x, 11 + y],
        ],
        p.accent,
      );
    } else {
      canvas.vLine(5 + x, 11 + y, 5, p.dark);
      canvas.points(
        [
          [5 + x, 13 + y],
          [5 + x, 14 + y],
          [10 + x, 13 + y],
          [10 + x, 14 + y],
        ],
        p.accent,
      );
      canvas.hLine(6 + x, 9 + y, 5, p.light);
    }
  } else {
    throw new Error(`Unknown hair: ${style}`);
  }
}

function drawFace(style: string, canvas: CellCanvas, pose: Pose): void {
  const x = pose.headDx;
  const y = pose.headDy;
  if (pose.direction === 'up') {
    canvas.hLine(7 + x, 15 + y, 2, style === 'face_bright' ? '#6E4B43' : INK);
    return;
  }
  if (pose.direction === 'right') {
    canvas.pixel(10 + x, 12 + y, INK);
    if (style === 'face_bright') {
      canvas.points(
        [
          [11 + x, 14 + y],
          [10 + x, 15 + y],
        ],
        RED,
      );
    } else if (style === 'face_focused') {
      canvas.hLine(9 + x, 11 + y, 2, INK);
      canvas.pixel(11 + x, 15 + y, INK);
    } else {
      canvas.pixel(11 + x, 15 + y, INK);
    }
    return;
  }
  if (style === 'face_calm') {
    canvas.points(
      [
        [6 + x, 12 + y],
        [9 + x, 12 + y],
      ],
      INK,
    );
    canvas.hLine(7 + x, 15 + y, 2, INK);
  } else if (style === 'face_bright') {
    canvas.points(
      [
        [6 + x, 12 + y],
        [9 + x, 12 + y],
      ],
      '#342B31',
    );
    canvas.points(
      [
        [6 + x, 13 + y],
        [9 + x, 13 + y],
      ],
      '#F5F2E9',
    );
    canvas.points(
      [
        [6 + x, 15 + y],
        [7 + x, 16 + y],
        [8 + x, 16 + y],
        [9 + x, 15 + y],
      ],
      RED,
    );
  } else if (style === 'face_focused') {
    canvas.points(
      [
        [6 + x, 11 + y],
        [9 + x, 11 + y],
      ],
      INK,
    );
    canvas.hLine(6 + x, 12 + y, 2, INK);
    canvas.hLine(9 + x, 12 + y, 2, INK);
    canvas.hLine(7 + x, 15 + y, 3, INK);
  } else {
    throw new Error(`Unknown face: ${style}`);
  }
}

function drawAccessory(style: string, canvas: CellCanvas, pose: Pose): void {
  const hx = pose.headDx;
  const hy = pose.headDy;
  const by = pose.bodyDy;
  const side = pose.direction === 'right';
  if (style === 'glasses_thin') {
    if (pose.direction === 'up') {
      canvas.hLine(5 + hx, 13 + hy, 6, METAL);
    } else if (side) {
      canvas.rect(9 + hx, 11 + hy, 3, 3, METAL);
      canvas.rect(10 + hx, 12 + hy, 1, 1, TRANSPARENT);
      canvas.pixel(12 + hx, 12 + hy, METAL);
    } else {
      canvas.rect(4 + hx, 11 + hy, 4, 3, METAL);
      canvas.rect(8 + hx, 11 + hy, 4, 3, METAL);
      canvas.rect(5 + hx, 12 + hy, 2, 1, TRANSPARENT);
      canvas.rect(9 + hx, 12 + hy, 2, 1, TRANSPARENT);
      canvas.hLine(7 + hx, 12 + hy, 2, METAL);
    }
  } else if (style === 'earbud_single') {
    const x = side ? 5 + hx : 3 + hx;
    canvas.rect(x, 12 + hy, 2, 2, '#E5E7EA');
    canvas.vLine(x, 14 + hy, 6, '#7D8791');
    canvas.pixel(x + (side ? -1 : 1), 20 + hy, BLUE);
  } else if (style === 'handheld_pad') {
    const x = side ? 11 : pose.direction === 'up' ? 2 : 11;
    canvas.rect(x, 20 + by, 4, 6, '#343B43');
    canvas.rect(x + 1, 21 + by, 2, 4, '#ADB6C0');
    canvas.hLine(x + 1, 22 + by, 2, '#E2E6EA');
  } else if (style === 'swatch_strap') {
    if (side) {
      for (let i = 0; i < 7; i += 1) canvas.pixel(6 + i, 18 + by + i, GOLD);
      canvas.rect(3, 22 + by, 4, 5, '#474B52');
      canvas.points(
        [
          [4, 23 + by],
          [5, 24 + by],
          [4, 25 + by],
        ],
        [80, 184, 178, 255],
      );
    } else {
      for (let i = 0; i < 7; i += 1) canvas.pixel(5 + i, 18 + by + i, GOLD);
      canvas.rect(2, 22 + by, 4, 5, '#474B52');
      canvas.points(
        [
          [3, 23 + by],
          [4, 24 + by],
          [3, 25 + by],
        ],
        [80, 184, 178, 255],
      );
    }
  } else if (style === 'token_charm') {
    const x = side ? 13 : 12;
    canvas.vLine(x, 22 + by, 4, '#51473F');
    canvas.rect(x - 1, 26 + by, 3, 2, GOLD);
    canvas.pixel(x, 27 + by, RED);
  } else if (style === 'statement_earrings') {
    if (side) {
      canvas.pixel(5 + hx, 13 + hy, GOLD);
      canvas.rect(4 + hx, 14 + hy, 2, 3, RED);
    } else {
      canvas.points(
        [
          [3 + hx, 13 + hy],
          [12 + hx, 13 + hy],
        ],
        GOLD,
      );
      canvas.rect(3 + hx, 14 + hy, 2, 3, RED);
      canvas.rect(11 + hx, 14 + hy, 2, 3, RED);
    }
  } else if (style === 'chest_pen') {
    const x = side ? 11 : 10;
    canvas.vLine(x, 18 + by, 5, RED);
    canvas.pixel(x + 1, 18 + by, '#F4C7A1');
  } else if (style === 'glasses_oversize') {
    if (pose.direction === 'up') {
      canvas.hLine(3 + hx, 12 + hy, 10, BLUE);
      canvas.points(
        [
          [3 + hx, 13 + hy],
          [12 + hx, 13 + hy],
        ],
        BLUE,
      );
    } else if (side) {
      canvas.rect(8 + hx, 10 + hy, 5, 5, BLUE);
      canvas.rect(9 + hx, 11 + hy, 3, 3, TRANSPARENT);
      canvas.pixel(13 + hx, 12 + hy, BLUE);
    } else {
      canvas.rect(3 + hx, 10 + hy, 5, 5, BLUE);
      canvas.rect(8 + hx, 10 + hy, 5, 5, BLUE);
      canvas.rect(4 + hx, 11 + hy, 3, 3, TRANSPARENT);
      canvas.rect(9 + hx, 11 + hy, 3, 3, TRANSPARENT);
      canvas.hLine(7 + hx, 12 + hy, 2, BLUE);
    }
  } else if (style === 'phone_ringlight') {
    const x = side ? 11 : 12;
    canvas.points(
      [
        [x + 1, 16 + by],
        [x, 17 + by],
        [x + 2, 17 + by],
        [x - 1, 18 + by],
        [x + 3, 18 + by],
        [x, 19 + by],
        [x + 2, 19 + by],
        [x + 1, 20 + by],
      ],
      '#F1D982',
    );
    canvas.rect(x, 21 + by, 3, 5, '#313A44');
    canvas.rect(x + 1, 22 + by, 1, 3, '#6BBAC7');
  } else if (style === 'walkie_lanyard') {
    const x = side ? 3 : 2;
    canvas.vLine(x + 1, 15 + by, 4, '#1E2931');
    canvas.rect(x, 18 + by, 4, 6, '#37434D');
    canvas.hLine(x + 1, 19 + by, 2, TEAL);
    canvas.points(
      [
        [x + 1, 22 + by],
        [x + 2, 22 + by],
      ],
      GOLD,
    );
    canvas.vLine(x + 3, 24 + by, 3, RED);
  } else if (style === 'gaming_headset') {
    canvas.hLine(side ? 6 + hx : 4 + hx, 8 + hy, side ? 7 : 8, '#252A31');
    canvas.points(
      side
        ? [
            [5 + hx, 9 + hy],
            [4 + hx, 10 + hy],
            [4 + hx, 11 + hy],
            [12 + hx, 9 + hy],
            [13 + hx, 10 + hy],
            [13 + hx, 11 + hy],
          ]
        : [
            [3 + hx, 9 + hy],
            [2 + hx, 10 + hy],
            [2 + hx, 11 + hy],
            [12 + hx, 9 + hy],
            [13 + hx, 10 + hy],
            [13 + hx, 11 + hy],
          ],
      '#252A31',
    );
    canvas.rect(side ? 4 + hx : 2 + hx, 12 + hy, 3, 4, VIOLET);
    canvas.rect(side ? 12 + hx : 11 + hx, 12 + hy, 3, 4, VIOLET);
    canvas.hLine(side ? 12 + hx : 10 + hx, 16 + hy, 4, '#252A31');
  } else if (style === 'book_binder') {
    const x = side ? 10 : pose.direction === 'up' ? 1 : 10;
    canvas.rect(x, 19 + by, 6, 8, '#454047');
    canvas.rect(x + 1, 20 + by, 4, 6, PAPER);
    canvas.vLine(x + 2, 20 + by, 6, RED);
    canvas.hLine(x + 3, 22 + by, 2, '#77716A');
    canvas.hLine(x + 3, 24 + by, 2, '#77716A');
  } else if (style === 'can_cup') {
    const x = side ? 12 : 13;
    canvas.hLine(x, 20 + by, 3, METAL);
    canvas.rect(x, 21 + by, 3, 5, RED);
    canvas.vLine(x + 1, 21 + by, 4, '#F2A84A');
    canvas.hLine(x, 26 + by, 3, '#5B646D');
  } else {
    throw new Error(`Unknown accessory: ${style}`);
  }
}

const BASE_PARTS: PartDefinition[] = [
  { id: 'body_neutral', slot: 'base', name: 'Neutral Body', colorable: true, draw: drawBase },
];

const BOTTOM_PARTS: PartDefinition[] = [
  {
    id: 'pants_tailored',
    slot: 'bottom',
    name: 'Tailored Trousers',
    colorable: true,
    draw: drawTailoredBottom,
  },
  {
    id: 'pants_relaxed_sneakers',
    slot: 'bottom',
    name: 'Relaxed Pants and Sneakers',
    colorable: true,
    draw: drawRelaxedBottom,
  },
];

const TOP_IDS = [
  ['shirt_button', 'Button Shirt'],
  ['hoodie_plain', 'Plain Hoodie'],
  ['blazer_clean', 'Clean Blazer'],
  ['outfit_layered', 'Layered Outfit'],
  ['shirt_rolled', 'Rolled-Sleeve Shirt'],
  ['blouse_clean', 'Clean Blouse'],
  ['streetwear_oversized', 'Oversized Streetwear'],
  ['jacket_field', 'Field Jacket'],
] as const;
const TOP_PARTS: PartDefinition[] = TOP_IDS.map(([id, name]) => ({
  id,
  slot: 'top',
  name,
  colorable: true,
  draw: (canvas, pose) => drawTop(id, canvas, pose),
}));

const FACE_IDS = [
  ['face_calm', 'Calm Face'],
  ['face_bright', 'Bright Face'],
  ['face_focused', 'Focused Face'],
] as const;
const FACE_PARTS: PartDefinition[] = FACE_IDS.map(([id, name]) => ({
  id,
  slot: 'face',
  name,
  colorable: false,
  draw: (canvas, pose) => drawFace(id, canvas, pose),
}));

const HAIR_IDS = [
  ['hair_sidepart_neat', 'Neat Side Part'],
  ['hair_crop_plain', 'Plain Crop'],
  ['hair_bob_streak', 'Bob with Color Streak'],
  ['hair_ponytail_neat', 'Neat Ponytail'],
  ['hair_wavy_shoulder', 'Shoulder-Length Waves'],
  ['hair_tousled_medium', 'Tousled Medium Hair'],
  ['hair_business_sharp', 'Sharp Business Cut'],
  ['hair_wavy_gathered', 'Loosely Gathered Waves'],
  ['hair_medium_straight', 'Straight Medium Hair'],
  ['hair_high_pony', 'High Ponytail'],
  ['hair_long_straight', 'Long Straight Hair'],
  ['hair_short_spiky', 'Short Spiky Hair'],
  ['hair_updo', 'Composed Updo'],
  ['hair_business_gray', 'Business Cut with Gray Temples'],
] as const;
const HAIR_PARTS: PartDefinition[] = HAIR_IDS.map(([id, name]) => ({
  id,
  slot: 'hair',
  name,
  colorable: id !== 'hair_bob_streak' && id !== 'hair_business_gray',
  draw: (canvas, pose) => drawHair(id, canvas, pose),
}));

const ACCESSORY_IDS = [
  ['glasses_thin', 'Thin Square Glasses'],
  ['earbud_single', 'Single Earbud'],
  ['handheld_pad', 'Handheld Pad'],
  ['swatch_strap', 'Swatch Book Strap'],
  ['token_charm', 'Token Charm'],
  ['statement_earrings', 'Statement Earrings'],
  ['chest_pen', 'Chest Pen'],
  ['glasses_oversize', 'Oversized Glasses'],
  ['phone_ringlight', 'Phone Ring Light'],
  ['walkie_lanyard', 'Walkie and Pass Lanyard'],
  ['gaming_headset', 'Gaming Headset'],
  ['book_binder', 'Book or Binder'],
  ['can_cup', 'Drink Can or Cup'],
] as const;
const ACCESSORY_PARTS: PartDefinition[] = ACCESSORY_IDS.map(([id, name]) => ({
  id,
  slot: 'accessory',
  name,
  colorable: false,
  draw: (canvas, pose) => drawAccessory(id, canvas, pose),
}));

const PARTS: PartDefinition[] = [
  ...BASE_PARTS,
  ...BOTTOM_PARTS,
  ...TOP_PARTS,
  ...FACE_PARTS,
  ...HAIR_PARTS,
  ...ACCESSORY_PARTS,
];

function color(h: number, s: number, b = 0, c = 0): FloorColor {
  return { h, s, b, c };
}

const CLOTHES = {
  charcoal: color(0, 8, -25, 4),
  navy: color(-150, 36, -14, 4),
  blue: color(-150, 48, -2, 2),
  teal: color(170, 42, -4, 2),
  green: color(105, 38, -5, 2),
  amber: color(36, 52, 2, 3),
  coral: color(12, 48, 2, 2),
  red: color(0, 48, -5, 3),
  violet: color(-82, 43, -2, 3),
  rose: color(-24, 38, 2, 2),
  plum: color(-66, 34, -8, 3),
  slate: color(-145, 20, -12, 3),
  cream: color(38, 12, 18, -2),
} as const;

const HAIR = {
  black: color(0, -18, -20, 5),
  dark: color(12, 12, -18, 4),
  brown: color(26, 30, -6, 3),
  auburn: color(8, 38, -2, 3),
  blond: color(40, 48, 12, 2),
  chestnut: color(18, 28, -2, 3),
} as const;

const SKIN_BY_PALETTE: Record<number, FloorColor> = {
  0: color(0, 0, 0, 0),
  1: color(3, -7, 8, -2),
  2: color(-2, -10, -28, 5),
  3: color(-4, -4, -12, 2),
  4: color(2, -5, -7, 2),
  5: color(0, -9, 11, -2),
};

const DESIGNS: AvatarDesign[] = [
  {
    id: 'eng-01',
    bottom: 'pants_tailored',
    top: 'shirt_button',
    face: 'face_calm',
    hair: 'hair_sidepart_neat',
    accessories: ['glasses_thin'],
    topColor: CLOTHES.blue,
    bottomColor: CLOTHES.navy,
    hairColor: HAIR.dark,
  },
  {
    id: 'eng-02',
    bottom: 'pants_relaxed_sneakers',
    top: 'hoodie_plain',
    face: 'face_focused',
    hair: 'hair_crop_plain',
    accessories: ['earbud_single'],
    topColor: CLOTHES.teal,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.black,
  },
  {
    id: 'eng-03',
    bottom: 'pants_relaxed_sneakers',
    top: 'streetwear_oversized',
    face: 'face_bright',
    hair: 'hair_bob_streak',
    accessories: ['earbud_single'],
    topColor: CLOTHES.violet,
    bottomColor: CLOTHES.slate,
    hairColor: null,
  },
  {
    id: 'eng-04',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_focused',
    hair: 'hair_ponytail_neat',
    accessories: ['handheld_pad', 'chest_pen'],
    topColor: CLOTHES.coral,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'eng-05',
    bottom: 'pants_tailored',
    top: 'outfit_layered',
    face: 'face_calm',
    hair: 'hair_wavy_shoulder',
    accessories: ['swatch_strap'],
    topColor: CLOTHES.rose,
    bottomColor: CLOTHES.plum,
    hairColor: HAIR.chestnut,
  },
  {
    id: 'eng-06',
    bottom: 'pants_relaxed_sneakers',
    top: 'hoodie_plain',
    face: 'face_bright',
    hair: 'hair_tousled_medium',
    accessories: ['token_charm'],
    topColor: CLOTHES.amber,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.black,
  },
  {
    id: 'mkt-01',
    bottom: 'pants_tailored',
    top: 'shirt_rolled',
    face: 'face_focused',
    hair: 'hair_business_sharp',
    accessories: ['token_charm'],
    topColor: CLOTHES.red,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'mkt-04',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_bright',
    hair: 'hair_wavy_gathered',
    accessories: ['statement_earrings', 'chest_pen'],
    topColor: CLOTHES.amber,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.auburn,
  },
  {
    id: 'mkt-07',
    bottom: 'pants_tailored',
    top: 'blouse_clean',
    face: 'face_focused',
    hair: 'hair_medium_straight',
    accessories: ['glasses_oversize', 'chest_pen'],
    topColor: CLOTHES.green,
    bottomColor: CLOTHES.slate,
    hairColor: HAIR.dark,
  },
  {
    id: 'mkt-09',
    bottom: 'pants_relaxed_sneakers',
    top: 'streetwear_oversized',
    face: 'face_bright',
    hair: 'hair_high_pony',
    accessories: ['phone_ringlight'],
    topColor: CLOTHES.teal,
    bottomColor: CLOTHES.violet,
    hairColor: HAIR.auburn,
  },
  {
    id: 'mkt-10',
    bottom: 'pants_relaxed_sneakers',
    top: 'jacket_field',
    face: 'face_bright',
    hair: 'hair_crop_plain',
    accessories: ['walkie_lanyard'],
    topColor: CLOTHES.green,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'mkt-11',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_focused',
    hair: 'hair_long_straight',
    accessories: ['handheld_pad'],
    topColor: CLOTHES.teal,
    bottomColor: CLOTHES.navy,
    hairColor: HAIR.black,
  },
  {
    id: 'mkt-12',
    bottom: 'pants_tailored',
    top: 'blouse_clean',
    face: 'face_calm',
    hair: 'hair_medium_straight',
    accessories: ['handheld_pad', 'swatch_strap'],
    topColor: CLOTHES.blue,
    bottomColor: CLOTHES.slate,
    hairColor: HAIR.chestnut,
  },
  {
    id: 'res-01',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_calm',
    hair: 'hair_sidepart_neat',
    accessories: ['handheld_pad'],
    topColor: CLOTHES.violet,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'res-02',
    bottom: 'pants_relaxed_sneakers',
    top: 'hoodie_plain',
    face: 'face_bright',
    hair: 'hair_short_spiky',
    accessories: ['can_cup'],
    topColor: CLOTHES.coral,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.black,
  },
  {
    id: 'res-03',
    bottom: 'pants_relaxed_sneakers',
    top: 'outfit_layered',
    face: 'face_calm',
    hair: 'hair_wavy_shoulder',
    accessories: ['handheld_pad'],
    topColor: CLOTHES.rose,
    bottomColor: CLOTHES.teal,
    hairColor: HAIR.brown,
  },
  {
    id: 'res-04',
    bottom: 'pants_relaxed_sneakers',
    top: 'streetwear_oversized',
    face: 'face_bright',
    hair: 'hair_short_spiky',
    accessories: ['gaming_headset', 'handheld_pad'],
    topColor: CLOTHES.violet,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'res-05',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_calm',
    hair: 'hair_updo',
    accessories: ['glasses_thin', 'book_binder'],
    topColor: CLOTHES.cream,
    bottomColor: CLOTHES.plum,
    hairColor: HAIR.black,
  },
  {
    id: 'res-06',
    bottom: 'pants_tailored',
    top: 'shirt_button',
    face: 'face_focused',
    hair: 'hair_crop_plain',
    accessories: ['handheld_pad'],
    topColor: CLOTHES.teal,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'res-07',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_calm',
    hair: 'hair_business_gray',
    accessories: ['token_charm'],
    topColor: CLOTHES.green,
    bottomColor: CLOTHES.charcoal,
    hairColor: null,
  },
  {
    id: 'res-08',
    bottom: 'pants_tailored',
    top: 'blouse_clean',
    face: 'face_focused',
    hair: 'hair_long_straight',
    accessories: ['book_binder'],
    topColor: CLOTHES.plum,
    bottomColor: CLOTHES.slate,
    hairColor: HAIR.black,
  },
  {
    id: 'res-09',
    bottom: 'pants_tailored',
    top: 'blazer_clean',
    face: 'face_calm',
    hair: 'hair_medium_straight',
    accessories: ['handheld_pad', 'chest_pen'],
    topColor: CLOTHES.green,
    bottomColor: CLOTHES.charcoal,
    hairColor: HAIR.dark,
  },
  {
    id: 'exec-sec',
    bottom: 'pants_tailored',
    top: 'blouse_clean',
    face: 'face_focused',
    hair: 'hair_medium_straight',
    accessories: ['handheld_pad', 'chest_pen'],
    topColor: CLOTHES.amber,
    bottomColor: CLOTHES.navy,
    hairColor: HAIR.chestnut,
  },
];

function renderPart(part: PartDefinition): PNG {
  const png = new PNG({ width: AVATAR_ATLAS_WIDTH, height: AVATAR_ATLAS_HEIGHT });
  png.data.fill(0);
  for (let row = 0; row < CHARACTER_DIRECTIONS.length; row += 1) {
    for (let column = 0; column < CHAR_FRAMES_PER_ROW; column += 1) {
      const canvas = new CellCanvas(png, column * CHAR_FRAME_W, row * CHAR_FRAME_H);
      part.draw(canvas, poseFor(row, column));
    }
  }
  return png;
}

function renderBaseTemplate(): PNG {
  const png = new PNG({ width: AVATAR_ATLAS_WIDTH, height: AVATAR_ATLAS_HEIGHT });
  png.data.fill(0);
  const guide = {
    crown: rgba('#42D3E580'),
    eyes: rgba('#F4DA5F80'),
    shoulders: rgba('#6EE08D80'),
    waist: rgba('#F3A64F80'),
    feet: rgba('#EA5A6680'),
    center: rgba('#D785E680'),
  };
  for (let row = 0; row < CHARACTER_DIRECTIONS.length; row += 1) {
    for (let column = 0; column < CHAR_FRAMES_PER_ROW; column += 1) {
      const canvas = new CellCanvas(png, column * CHAR_FRAME_W, row * CHAR_FRAME_H);
      drawBase(canvas, poseFor(row, column));
      for (let y = 8; y < CHAR_FRAME_H; y += 2) canvas.pixel(7, y, guide.center);
      for (let x = 0; x < CHAR_FRAME_W; x += 2) {
        canvas.pixel(x, 8, guide.crown);
        canvas.pixel(x, 13, guide.eyes);
        canvas.pixel(x, 17, guide.shoulders);
        canvas.pixel(x, 23, guide.waist);
        canvas.pixel(x, 31, guide.feet);
      }
    }
  }
  return png;
}

function alphaAt(png: PNG, x: number, y: number): number {
  return png.data[(y * png.width + x) * 4 + 3];
}

function validatePart(part: PartDefinition, png: PNG): void {
  if (png.width !== AVATAR_ATLAS_WIDTH || png.height !== AVATAR_ATLAS_HEIGHT) {
    throw new Error(`${part.id}: wrong atlas size`);
  }
  for (let row = 0; row < CHARACTER_DIRECTIONS.length; row += 1) {
    for (let column = 0; column < CHAR_FRAMES_PER_ROW; column += 1) {
      let occupied = 0;
      for (let y = 0; y < CHAR_FRAME_H; y += 1) {
        for (let x = 0; x < CHAR_FRAME_W; x += 1) {
          const alpha = alphaAt(png, column * CHAR_FRAME_W + x, row * CHAR_FRAME_H + y);
          if (y < 8 && alpha !== 0) throw new Error(`${part.id}: drew above row 8`);
          if (alpha !== 0) occupied += 1;
        }
      }
      if (occupied === 0) throw new Error(`${part.id}: empty cell row=${row} col=${column}`);
    }
  }
}

function makeConfig(design: AvatarDesign, palette: number): AvatarConfig {
  const layers: AvatarLayerConfig[] = [
    { slot: 'bottom', part: design.bottom, color: design.bottomColor },
    { slot: 'top', part: design.top, color: design.topColor },
    { slot: 'face', part: design.face, color: null },
    { slot: 'hair', part: design.hair, color: design.hairColor },
    ...design.accessories.map(
      (part): AvatarLayerConfig => ({
        slot: 'accessory',
        part,
        color: null,
      }),
    ),
  ];
  return {
    base: { part: 'body_neutral', color: SKIN_BY_PALETTE[palette] ?? SKIN_BY_PALETTE[0] },
    layers,
  };
}

function shapeKey(config: AvatarConfig): string {
  return [config.base.part, ...config.layers.map((layer) => `${layer.slot}:${layer.part}`)].join(
    '|',
  );
}

function alphaSignature(config: AvatarConfig, rendered: ReadonlyMap<string, PNG>): Uint8Array {
  const partIds = [config.base.part, ...config.layers.map((layer) => layer.part)];
  const signature = new Uint8Array(CHARACTER_DIRECTIONS.length * CHAR_FRAME_W * CHAR_FRAME_H);
  for (let row = 0; row < CHARACTER_DIRECTIONS.length; row += 1) {
    for (let y = 0; y < CHAR_FRAME_H; y += 1) {
      for (let x = 0; x < CHAR_FRAME_W; x += 1) {
        const outputIndex = row * CHAR_FRAME_W * CHAR_FRAME_H + y * CHAR_FRAME_W + x;
        signature[outputIndex] = partIds.some((partId) => {
          const png = rendered.get(partId);
          if (!png) throw new Error(`Missing rendered part: ${partId}`);
          return alphaAt(png, CHAR_FRAME_W + x, row * CHAR_FRAME_H + y) > 0;
        })
          ? 1
          : 0;
      }
    }
  }
  return signature;
}

function signatureKey(signature: Uint8Array): string {
  return Buffer.from(signature).toString('base64');
}

function hamming(left: Uint8Array, right: Uint8Array): number {
  let distance = 0;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) distance += 1;
  return distance;
}

function validateAndBuildConfigs(rendered: ReadonlyMap<string, PNG>): {
  avatars: Record<string, AvatarConfig>;
  nearestPairs: string[];
} {
  const jcConfig = JSON.parse(fs.readFileSync(JC_CONFIG_PATH, 'utf8')) as {
    members: Array<{ id: string; palette?: number }>;
  };
  const rosterIds = jcConfig.members.map((member) => member.id);
  const designIds = DESIGNS.map((design) => design.id);
  if (
    rosterIds.length !== 23 ||
    designIds.length !== 23 ||
    [...rosterIds].sort().join('|') !== [...designIds].sort().join('|')
  ) {
    throw new Error('Avatar design IDs no longer match the 23-member jc-config roster');
  }

  const partById = new Map(PARTS.map((part) => [part.id, part]));
  const memberById = new Map(jcConfig.members.map((member) => [member.id, member]));
  const avatars: Record<string, AvatarConfig> = {};
  const shapeOwners = new Map<string, string>();
  const signatureOwners = new Map<string, string>();
  const directionSignatureOwners = CHARACTER_DIRECTIONS.map(() => new Map<string, string>());
  const signatures = new Map<string, Uint8Array>();

  for (const design of DESIGNS) {
    if (design.accessories.length > 2) throw new Error(`${design.id}: more than 2 accessories`);
    const config = makeConfig(design, memberById.get(design.id)?.palette ?? 0);
    for (const layer of [{ slot: 'base' as const, ...config.base }, ...config.layers]) {
      const part = partById.get(layer.part);
      if (!part || part.slot !== layer.slot) {
        throw new Error(`${design.id}: invalid ${layer.slot} reference ${layer.part}`);
      }
      if (!part.colorable && layer.color !== null) {
        throw new Error(`${design.id}: fixed-color part ${layer.part} has a color override`);
      }
    }
    const shape = shapeKey(config);
    const existingShape = shapeOwners.get(shape);
    if (existingShape)
      throw new Error(`Duplicate part combination: ${existingShape}, ${design.id}`);
    shapeOwners.set(shape, design.id);

    const signature = alphaSignature(config, rendered);
    const key = signatureKey(signature);
    const existingSignature = signatureOwners.get(key);
    if (existingSignature) {
      throw new Error(
        `Exact three-direction silhouette collision: ${existingSignature}, ${design.id}`,
      );
    }
    signatureOwners.set(key, design.id);
    const directionSignatureLength = CHAR_FRAME_W * CHAR_FRAME_H;
    for (let row = 0; row < CHARACTER_DIRECTIONS.length; row += 1) {
      const directionKey = signatureKey(
        signature.slice(row * directionSignatureLength, (row + 1) * directionSignatureLength),
      );
      const existingDirectionSignature = directionSignatureOwners[row].get(directionKey);
      if (existingDirectionSignature) {
        throw new Error(
          `Exact ${CHARACTER_DIRECTIONS[row]} silhouette collision: ${existingDirectionSignature}, ${design.id}`,
        );
      }
      directionSignatureOwners[row].set(directionKey, design.id);
    }
    signatures.set(design.id, signature);
    avatars[design.id] = config;
  }

  const distances: Array<{ left: string; right: string; distance: number }> = [];
  for (let i = 0; i < designIds.length; i += 1) {
    for (let j = i + 1; j < designIds.length; j += 1) {
      distances.push({
        left: designIds[i],
        right: designIds[j],
        distance: hamming(signatures.get(designIds[i])!, signatures.get(designIds[j])!),
      });
    }
  }
  distances.sort((left, right) => left.distance - right.distance);
  return {
    avatars,
    nearestPairs: distances
      .slice(0, 8)
      .map(({ left, right, distance }) => `${left}/${right}:${distance}px`),
  };
}

function writeGeneratedAssets(
  rendered: ReadonlyMap<string, PNG>,
  avatars: Record<string, AvatarConfig>,
): void {
  fs.rmSync(AVATAR_ROOT, { recursive: true, force: true });
  fs.mkdirSync(AVATAR_ROOT, { recursive: true });
  fs.writeFileSync(
    path.join(AVATAR_ROOT, '_base-template.png'),
    PNG.sync.write(renderBaseTemplate()),
  );

  for (const part of PARTS) {
    const partDir = path.join(AVATAR_ROOT, part.slot, part.id);
    fs.mkdirSync(partDir, { recursive: true });
    const file = `${part.id}.png`;
    fs.writeFileSync(path.join(partDir, file), PNG.sync.write(rendered.get(part.id)!));
    fs.writeFileSync(
      path.join(partDir, 'manifest.json'),
      `${JSON.stringify(
        {
          id: part.id,
          slot: part.slot,
          name: part.name,
          file,
          width: AVATAR_ATLAS_WIDTH,
          height: AVATAR_ATLAS_HEIGHT,
          frames: CHAR_FRAMES_PER_ROW,
          colorable: part.colorable,
          zOverride: null,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  fs.writeFileSync(
    DEFAULT_AVATARS_PATH,
    `${JSON.stringify(
      { version: 1, avatarRevision: AVATAR_DEFAULTS_REVISION, avatars },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function main(): void {
  const expectedCounts: Record<AvatarSlot, number> = {
    base: 1,
    bottom: 2,
    top: 8,
    face: 3,
    hair: 14,
    accessory: 13,
  };
  for (const [slot, expected] of Object.entries(expectedCounts)) {
    const actual = PARTS.filter((part) => part.slot === slot).length;
    if (actual !== expected) throw new Error(`${slot}: expected ${expected} parts, got ${actual}`);
  }
  if (PARTS.length !== 41) throw new Error(`Expected 41 parts, got ${PARTS.length}`);
  const rendered = new Map<string, PNG>();
  for (const part of PARTS) {
    if (rendered.has(part.id)) throw new Error(`Duplicate part id: ${part.id}`);
    const png = renderPart(part);
    validatePart(part, png);
    rendered.set(part.id, png);
  }
  const { avatars, nearestPairs } = validateAndBuildConfigs(rendered);
  writeGeneratedAssets(rendered, avatars);
  console.log(`Generated ${PARTS.length} avatar parts at ${AVATAR_ROOT}`);
  console.log(`Generated ${Object.keys(avatars).length} avatar configs at ${DEFAULT_AVATARS_PATH}`);
  console.log('Exact idle silhouette collisions: down=0, up=0, right=0, combined=0');
  console.log(`Nearest non-colliding idle silhouettes: ${nearestPairs.join(', ')}`);
}

main();
