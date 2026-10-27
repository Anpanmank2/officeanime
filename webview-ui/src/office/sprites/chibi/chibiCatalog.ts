import type { CharacterSprites } from '../spriteData.js';
import type { ChibiPoses } from './chibiFrames.js';
import { buildChibiFrames } from './chibiFrames.js';
import { toChibiCharacterSprites } from './chibiSprites.js';
import heads from './heads.json';
import owner from './owner.json';
import poses from './poses.json';

const members = new Map([...heads.members, ...owner.members].map((member) => [member.id, member]));
const cache = new Map<string, CharacterSprites | null>();

export function hasChibiMember(id: string): boolean {
  return members.has(id);
}

export function getChibiCharacterSprites(id: string): CharacterSprites | null {
  if (cache.has(id)) return cache.get(id)!;
  const member = members.get(id);
  if (!member) return null;
  try {
    const sprites = toChibiCharacterSprites(
      buildChibiFrames(member, poses as unknown as ChibiPoses),
      poses.columns,
    );
    cache.set(id, sprites);
    console.log('[Chibi] built sprites for ' + id);
    return sprites;
  } catch (error) {
    cache.set(id, null);
    console.warn('[Chibi] failed to build sprites for ' + id, error);
    return null;
  }
}
