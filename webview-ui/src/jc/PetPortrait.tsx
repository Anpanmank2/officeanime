import { useEffect, useRef } from 'react';

import { drawPetSprite, getPetSprite } from './pet-sprite.js';
import type { JCPet } from './pet-state.js';

/** The card and the office use the same recorded appearance and pixel art. */
export function PetPortrait({ pet }: { pet: JCPet }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const sprite = getPetSprite(pet.stage, pet.appearance);
    ctx.clearRect(0, 0, 36, 36);
    drawPetSprite(ctx, Math.floor((36 - sprite.width) / 2), 34 - sprite.height, 1, sprite);
  }, [pet.stage, pet.appearance]);
  return (
    <canvas
      ref={canvas}
      width={36}
      height={36}
      role="img"
      aria-label={`${pet.name}のいまの姿`}
      style={{ width: 54, height: 54, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}
