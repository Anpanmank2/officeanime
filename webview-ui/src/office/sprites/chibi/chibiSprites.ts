import type { CharacterSprites } from '../spriteData.js';
import type { ChibiFrames } from './chibiFrames.js';

export const CHIBI_PIXEL_SCALE = 0.5;
const Direction = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 } as const;
type Direction = (typeof Direction)[keyof typeof Direction];

export function toChibiCharacterSprites(frames: ChibiFrames, columns: string[]): CharacterSprites {
  const column = (name: string) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`Missing column: ${name}`);
    return index;
  };
  const directions = {
    [Direction.DOWN]: frames.down,
    [Direction.LEFT]: frames.right.map((frame) => frame.map((row) => [...row].reverse())),
    [Direction.RIGHT]: frames.right,
    [Direction.UP]: frames.up,
  };
  const eachDirection = <T>(make: (d: Direction) => T): Record<Direction, T> => ({
    [Direction.DOWN]: make(Direction.DOWN),
    [Direction.LEFT]: make(Direction.LEFT),
    [Direction.RIGHT]: make(Direction.RIGHT),
    [Direction.UP]: make(Direction.UP),
  });
  const frame = (d: Direction, name: string) => directions[d][column(name)];
  const error: CharacterSprites['error'][0] = [
    frames.down[column('error')],
    frames.up[column('error')],
    frames.right[column('error')],
  ];
  return {
    walk: eachDirection<CharacterSprites['walk'][0]>((d) => [
      frame(d, 'walk1'),
      frame(d, 'walkpass'),
      frame(d, 'walk3'),
      frame(d, 'walkpass'),
    ]),
    idle: eachDirection((d) => frame(d, 'stand')),
    typing: eachDirection<CharacterSprites['typing'][0]>((d) => [
      frame(d, 'type1'),
      frame(d, 'type2'),
    ]),
    reading: eachDirection<CharacterSprites['reading'][0]>((d) => [
      frame(d, 'read1'),
      frame(d, 'read2'),
    ]),
    thinking: eachDirection<CharacterSprites['thinking'][0]>((d) => [
      frame(d, 'think1'),
      frame(d, 'think2'),
      frame(d, 'think3'),
    ]),
    error: eachDirection(() => error),
    pixelScale: CHIBI_PIXEL_SCALE,
  };
}
