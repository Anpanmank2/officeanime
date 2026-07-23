// ── 社員カルテ 顔グラ (静止 portrait) ─────────────────────────────────────────
// 既存キャラスプライトの立ち姿 (正面 walk2 = standing pose) を小 canvas に静止描画する。
// spriteCache と同じピクセルデータ (getCharacterSprites) を使うだけ — 新アセット/IPC/
// postMessage は 1 つも増やさない (spec §3 exists*: webview 内の軽微 helper のみ)。

import { useEffect, useRef } from 'react';

import { getCharacterSprites } from '../office/sprites/spriteData.js';
import type { SpriteData } from '../office/types.js';
import { Direction } from '../office/types.js';

/** 1 スプライトピクセル = 画面 3px (整数倍・ピクセルパーフェクト維持)。 */
const PORTRAIT_SCALE = 3;

/** 非空ピクセルのバウンディングボックス (上部の透明パディングを詰めて肖像を締める)。 */
function contentBounds(sprite: SpriteData): {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
} {
  let minR = sprite.length;
  let maxR = -1;
  let minC = sprite[0]?.length ?? 0;
  let maxC = -1;
  for (let r = 0; r < sprite.length; r++) {
    for (let c = 0; c < sprite[r].length; c++) {
      if (sprite[r][c] === '') continue;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  if (maxR < 0) {
    // 全透明フォールバック (念のため): フレーム全体を返す。
    return { minR: 0, maxR: sprite.length - 1, minC: 0, maxC: (sprite[0]?.length ?? 1) - 1 };
  }
  return { minR, maxR, minC, maxC };
}

export interface MemberPortraitProps {
  palette: number;
  hueShift: number;
  /** 不在なら彩度を落として dim 表示する (spec §4.3 不在=portrait dim)。 */
  present: boolean;
}

/** 立ち姿の顔グラ。palette / hueShift はキャラ本体と同一 → canvas のキャラと同じ見た目。 */
export function MemberPortrait({ palette, hueShift, present }: MemberPortraitProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const sprites = getCharacterSprites(palette, hueShift);
    const frame = sprites.walk[Direction.DOWN][1]; // walk2 = 正面立ち姿
    const b = contentBounds(frame);
    const cols = b.maxC - b.minC + 1;
    const rows = b.maxR - b.minR + 1;
    canvas.width = cols * PORTRAIT_SCALE;
    canvas.height = rows * PORTRAIT_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = b.minR; r <= b.maxR; r++) {
      for (let c = b.minC; c <= b.maxC; c++) {
        const color = frame[r][c];
        if (color === '') continue;
        ctx.fillStyle = color;
        ctx.fillRect(
          (c - b.minC) * PORTRAIT_SCALE,
          (r - b.minR) * PORTRAIT_SCALE,
          PORTRAIT_SCALE,
          PORTRAIT_SCALE,
        );
      }
    }
  }, [palette, hueShift]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        imageRendering: 'pixelated',
        display: 'block',
        filter: present ? 'none' : 'grayscale(1) brightness(0.5)',
        opacity: present ? 1 : 0.8,
      }}
    />
  );
}
