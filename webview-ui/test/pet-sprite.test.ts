import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  drawPetSprite,
  getPetSprite,
  PET_SPRITE_PALETTE,
  type PetDrawingContext,
} from '../src/jc/pet-sprite.ts';

const appearance = (
  lineage: 'cat' | 'dog' | 'rabbit' | 'maru' | null,
  direction: 'cool' | 'cute' | 'mixed' | null = null,
) => ({ lineage, direction });
const painted = (sprite: ReturnType<typeof getPetSprite>) =>
  sprite.pixels.flat().filter((color): color is string => color !== null);

test('all calendar stages have a transparent bounded pixel canvas at their designed heights', () => {
  const heights = [12, 16, 21, 26, 29, 32];
  for (const [stage, height] of heights.entries()) {
    const sprite = getPetSprite(stage, appearance(null));
    assert.ok(sprite.width > 0 && sprite.width <= 26);
    assert.equal(sprite.height, height);
    assert.equal(sprite.pixels.length, height);
    assert.ok(sprite.pixels.every((row) => row.length === sprite.width));
    assert.ok(sprite.pixels.some((row) => row.some((pixel) => pixel === null)));
    assert.ok(sprite.pixels.some((row) => row[0] !== null));
    assert.ok(sprite.pixels.some((row) => row[sprite.width - 1] !== null));
    for (const color of painted(sprite))
      assert.ok(Object.values(PET_SPRITE_PALETTE).includes(color as never));
  }
});

test('the normalized stage, lineage and direction select a cached sprite', () => {
  assert.equal(getPetSprite(2.9, appearance(null)), getPetSprite(2, appearance(null)));
  assert.notEqual(getPetSprite(2, appearance(null)), getPetSprite(2, appearance('maru')));
  assert.notEqual(
    getPetSprite(3, appearance('cat', 'cool')),
    getPetSprite(3, appearance('cat', 'cute')),
  );
});

test('stage two with no assigned lineage is a neutral sprouted familiar, not the maru body', () => {
  const neutral = getPetSprite(2, appearance(null));
  const maru = getPetSprite(2, appearance('maru'));
  assert.notDeepEqual(neutral.pixels, maru.pixels);
  assert.ok(neutral.pixels.slice(0, 4).flat().includes(PET_SPRITE_PALETTE.sage));
  assert.ok(
    neutral.pixels
      .slice(0, 4)
      .flat()
      .some((pixel) => pixel === null),
  );
  assert.ok(painted(neutral).includes(PET_SPRITE_PALETTE.cream));
});

test('known lineages retain their readable silhouette cores from stage two onward', () => {
  const cat = getPetSprite(3, appearance('cat'));
  const dog = getPetSprite(3, appearance('dog'));
  const rabbit = getPetSprite(3, appearance('rabbit'));
  const maru = getPetSprite(3, appearance('maru'));
  assert.notDeepEqual(cat.pixels, dog.pixels);
  assert.notDeepEqual(dog.pixels, rabbit.pixels);
  assert.notDeepEqual(rabbit.pixels, maru.pixels);
  assert.ok(cat.pixels[2].includes(PET_SPRITE_PALETTE.honey)); // triangular cat ear tips
  assert.ok(dog.width > maru.width); // floppy ears extend beside the round body
  assert.ok(rabbit.pixels[0].includes(PET_SPRITE_PALETTE.honey)); // long ear tips
  assert.ok(maru.pixels[0].every((pixel) => pixel === null)); // its round body has no ears
});

test('direction has no effect until stage three, then changes only presentation pixels', () => {
  assert.deepEqual(
    getPetSprite(2, appearance('cat', 'cool')).pixels,
    getPetSprite(2, appearance('cat', 'cute')).pixels,
  );
  assert.notDeepEqual(
    getPetSprite(3, appearance('cat', 'cool')).pixels,
    getPetSprite(3, appearance('cat', 'cute')).pixels,
  );
});

test('canvas drawing paints only opaque source pixels on an integral grid', () => {
  const calls: Array<[string, number, number, number, number]> = [];
  const ctx: PetDrawingContext = {
    fillStyle: '',
    fillRect(x: number, y: number, width: number, height: number) {
      calls.push([String(this.fillStyle), x, y, width, height]);
    },
  };
  const sprite = getPetSprite(2, appearance(null));
  drawPetSprite(ctx, 10, 20, 3, sprite);
  assert.equal(calls.length, painted(sprite).length);
  assert.ok(
    calls.every(
      ([, x, y, width, height]) =>
        (x - 10) % 3 === 0 && (y - 20) % 3 === 0 && width === 3 && height === 3,
    ),
  );
});
