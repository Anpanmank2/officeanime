import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PET_TILE } from '../src/jc/jc-constants.ts';
import { petCompanionBounds, petContainsPoint } from '../src/jc/pet-geometry.ts';
import { getPetSprite } from '../src/jc/pet-sprite.ts';
import { jcGetPet, jcSetPet } from '../src/jc/pet-state.ts';
import { TILE_SIZE } from '../src/office/types.ts';

function setPet(
  stage: number,
  lineage: 'cat' | 'dog' | 'rabbit' | 'maru' | null = null,
  direction: 'cool' | 'cute' | 'mixed' | null = null,
) {
  jcSetPet({ name: 'fixture', stage, appearance: { lineage, direction } });
  return jcGetPet()!;
}

test('the actual saved stage-two null-lineage companion is clickable above its original floor tile', () => {
  const pet = setPet(2, null, 'cute');
  const bounds = petCompanionBounds(pet);
  const sprite = getPetSprite(pet.stage, pet.appearance);
  const originalTileTop = PET_TILE.row * TILE_SIZE;

  assert.ok(bounds.y < originalTileTop, 'grown sprite begins above its original floor tile');
  const topRow = sprite.pixels.findIndex((row) => row.some((pixel) => pixel !== null));
  const topX = sprite.pixels[topRow].findIndex((pixel) => pixel !== null);
  assert.ok(bounds.y + topRow < originalTileTop, 'the visible sprout reaches above the floor tile');
  assert.equal(petContainsPoint(pet, bounds.x + topX + 0.5, bounds.y + topRow + 0.5), true);

  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if (sprite.pixels[y][x] === null) continue;
      assert.ok(x >= 0 && x < bounds.width && y >= 0 && y < bounds.height);
      assert.equal(petContainsPoint(pet, bounds.x + x + 0.5, bounds.y + y + 0.5), true);
    }
  }
});

test('all six stages remain ground anchored as their heights increase', () => {
  for (let stage = 0; stage <= 5; stage++) {
    const pet = setPet(stage);
    const bounds = petCompanionBounds(pet);
    assert.equal(
      bounds.y + bounds.height,
      (PET_TILE.row + 1) * TILE_SIZE,
      `stage ${stage} bottom stays on the companion tile ground`,
    );
  }
});

test('stage-five rabbit ear tips above the tile remain clickable', () => {
  const pet = setPet(5, 'rabbit', 'cute');
  const bounds = petCompanionBounds(pet);
  const sprite = getPetSprite(pet.stage, pet.appearance);
  const earX = sprite.pixels[0].findIndex((pixel) => pixel !== null);

  assert.ok(earX >= 0, 'rabbit has a painted ear tip at the sprite top');
  assert.ok(bounds.y < PET_TILE.row * TILE_SIZE, 'ear is above the floor tile');
  assert.equal(petContainsPoint(pet, bounds.x + earX + 0.5, bounds.y + 0.5), true);
});
