import { TILE_SIZE } from '../office/types.js';
import { PET_TILE } from './jc-constants.js';
import { getPetSprite } from './pet-sprite.js';
import type { JCPet } from './pet-state.js';

/** Drawing, speech anchoring and clicks share the growing body's bounds. */
export function petCompanionBounds(pet: JCPet) {
  const sprite = getPetSprite(pet.stage, pet.appearance);
  return {
    x: PET_TILE.col * TILE_SIZE + Math.floor((TILE_SIZE - sprite.width) / 2),
    y: (PET_TILE.row + 1) * TILE_SIZE - sprite.height,
    width: sprite.width,
    height: sprite.height,
    sprite,
  };
}

export function petContainsPoint(pet: JCPet, worldX: number, worldY: number): boolean {
  const bounds = petCompanionBounds(pet);
  return (
    worldX >= bounds.x &&
    worldX < bounds.x + bounds.width &&
    worldY >= bounds.y - 1 &&
    worldY < bounds.y + bounds.height + 1
  );
}
