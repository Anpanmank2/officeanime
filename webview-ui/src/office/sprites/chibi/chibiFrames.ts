import type { SpriteData } from '../../types.js';

export const CHIBI_CELL_W = 32;
export const CHIBI_CELL_H = 48;
type Direction = 'down' | 'up' | 'right';
export interface ChibiMember {
  id: string;
  band: string;
  hair: string[];
  acc: string[] | null;
  top: string[];
  torso: number;
  prop: string | null;
  back: string | null;
  front: string[];
  right: string[] | null;
  up?: string[] | null;
}
type Operation =
  | ['r', number, number, number, number, string, string]
  | ['legs', number]
  | ['arms']
  | ['body', Direction, number]
  | ['head', Direction, number, number]
  | ['props', number];
export interface ChibiPoses {
  version: number;
  cell: number[];
  colors: Record<string, string>;
  columns: string[];
  directions: Direction[];
  frames: Record<string, Record<Direction, Operation[]>>;
}
export type ChibiFrames = Record<Direction, SpriteData[]>;

export function buildChibiFrames(member: ChibiMember, poses: ChibiPoses): ChibiFrames {
  const { ink, skin, skinShadow, pants, pantsShadow, white, glass } = poses.colors;
  const palette: Record<string, string | undefined> = {
    O: ink,
    L: member.hair[0],
    H: member.hair[1],
    h: member.hair[2],
    S: skin,
    s: skinShadow,
    P: '#f4a0a0',
    M: '#e8505a',
    e: '#6b5040',
    E: '#2a2430',
    G: ink,
    g: glass,
    K: member.acc?.[0],
    A: member.acc?.[1],
    a: member.acc?.[2],
    F: member.acc?.[1],
  };
  const result: ChibiFrames = { down: [], up: [], right: [] };
  for (const direction of poses.directions)
    for (const column of poses.columns) {
      const frame: SpriteData = Array.from({ length: CHIBI_CELL_H }, () =>
        Array<string>(CHIBI_CELL_W).fill(''),
      );
      const r = (x: number, y: number, w: number, h: number, color: string) => {
        for (let j = y; j < y + h; j++)
          for (let i = x; i < x + w; i++) {
            if (i < 0 || i >= CHIBI_CELL_W || j < 0 || j >= CHIBI_CELL_H)
              throw Error(`pixel outside canvas: ${i},${j}`);
            frame[j][i] = color;
          }
      };
      for (const op of poses.frames[column][direction]) {
        switch (op[0]) {
          case 'r':
            r(op[1], op[2], op[3], op[4], poses.colors[op[5]]);
            break;
          case 'legs':
            for (const [x, shift] of [
              [9, op[1]],
              [18, -op[1]],
            ]) {
              r(x + shift, 40, 5, 8, ink);
              r(x + shift + 1, 40, 3, 6, pants);
              r(x + shift + 3, 40, 1, 6, pantsShadow);
              r(x + shift - 1, 46, 6, 2, ink);
            }
            break;
          case 'arms':
            r(5, 30, 3, 7, ink);
            r(6, 31, 2, 5, skin);
            r(24, 30, 3, 7, ink);
            r(24, 31, 2, 5, skinShadow);
            break;
          case 'body':
            r(7, 27, 18, 13, ink);
            r(8, 28, 16, 11, member.top[0]);
            r(8, 29, 3, 10, member.top[1]);
            r(12, 28, 10, 2, member.top[2]);
            if (member.torso === 0) {
              r(14, 28, 3, 11, skinShadow);
              r(9, 33, 4, 2, member.top[2]);
            }
            if (member.torso === 1) r(12, 26 + op[2], 8, 3, member.top[1]);
            if (member.torso === 2) {
              r(12, 28, 3, 3, white);
              r(18, 28, 3, 3, white);
              r(16, 31, 1, 6, ink);
            }
            if (op[1] === 'up') r(12, 30, 10, 2, member.top[1]);
            if (op[1] === 'right') r(20, 30, 3, 7, member.top[1]);
            break;
          case 'head': {
            const [, view, dx, dy] = op;
            const side = view === 'right' && member.right;
            const back = view === 'up' && member.up;
            const grid = (side || back || member.front).map((row) => [...row]);
            const paint = (x: number, y: number, symbol: string) => {
              grid[y - 8][x - 6] = symbol;
            };
            if (view === 'right' && !side) {
              for (let y = 13; y <= 22; y++)
                for (let x = 8; x <= 14; x++) {
                  if ('SsPeEGgF'.includes(member.front[y - 8][x - 6])) paint(x, y, 'H');
                }
              for (const x of [15, 16]) paint(x, 23, 'S');
              for (const x of [18, 19]) paint(x, 23, 'M');
            }
            if (view === 'up' && !back)
              member.front.forEach((row, rowIndex) =>
                [...row].forEach((symbol, colIndex) => {
                  const x = 6 + colIndex,
                    y = 8 + rowIndex;
                  if ('SsPMeEGgF'.includes(symbol) && !(member.back === 'bald-top' && y <= 12)) {
                    const fill =
                      member.back === 'nape-short' && y >= 21
                        ? x >= 12 && x <= 19
                          ? 's'
                          : 'h'
                        : y >= 23
                          ? 'h'
                          : 'H';
                    paint(x, y, fill);
                  }
                  if (member.back === 'long-hair' && y >= 24 && x >= 9 && x <= 22 && symbol === 'O')
                    paint(x, y, 'h');
                }),
              );
            if (view === 'up' && !back && member.back === 'mirror')
              grid.forEach((row) => row.reverse());
            grid.forEach((row, rowIndex) =>
              row.forEach((symbol, colIndex) => {
                if (symbol === '.') return;
                const color = palette[symbol];
                if (!color) throw Error(`Unknown head color: ${symbol}`);
                r(6 + colIndex + dx, 8 + rowIndex + dy, 1, 1, color);
              }),
            );
            break;
          }
          case 'props': {
            const bob = op[1];
            if (member.prop === 'toolbox') {
              r(24, 32 + bob, 5, 2, ink);
              r(22, 34 + bob, 9, 7, ink);
              r(23, 35 + bob, 7, 5, member.top[1]);
              r(25, 36 + bob, 3, 1, member.top[2]);
            }
            if (member.prop === 'papers') {
              r(1, 29 + bob, 7, 11, ink);
              r(2, 30 + bob, 5, 9, white);
              r(3, 32 + bob, 3, 1, pants);
              r(3, 35 + bob, 3, 1, pants);
            }
            break;
          }
        }
      }
      result[direction].push(frame);
    }
  return result;
}
