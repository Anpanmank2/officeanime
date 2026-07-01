// ── Slice1 Completion Toast (screen-space DOM, DEV-SPEC §6-6 / AC-3) ────
// NOT a canvas effect — matrixEffect.ts is canvas keyed to character pixels and
// cannot render screen-space text. This is a lightweight React DOM toast that
// pops "本日N件目! 🎉 <name>(相性◎) +N" for ~1.8s on task completion.

import { useEffect, useState } from 'react';

import {
  gameClearToast,
  gameGetCurrentToast,
  subscribeGame,
  TIER_GLYPH,
  type ToastEntry,
} from './game-state.js';

const TOAST_MS = 1800;

const TIER_COLOR: Record<string, string> = {
  great: '#39ff14',
  ok: '#f0ad4e',
  bad: '#ff3d3d',
};

export function CompletionToast() {
  const [toast, setToast] = useState<ToastEntry | null>(null);

  useEffect(() => {
    const update = () => {
      const t = gameGetCurrentToast();
      if (t) setToast(t);
    };
    update();
    return subscribeGame(update);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => {
      gameClearToast(id);
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const color = TIER_COLOR[toast.tier] ?? '#f0ad4e';

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 55, // above OfficeLog, below DialogBox
        pointerEvents: 'none',
        background: 'rgba(8, 10, 25, 0.92)',
        border: `2px solid ${color}`,
        boxShadow: '2px 2px 0px #0a0a14',
        borderRadius: 0,
        padding: '8px 16px',
        color: '#eef',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 12,
        whiteSpace: 'nowrap',
        textAlign: 'center',
        lineHeight: 1.6,
      }}
    >
      <div style={{ color, fontSize: 13 }}>本日{toast.todayCount}件目! 🎉</div>
      <div>
        {toast.memberName}
        <span style={{ color }}>(相性{TIER_GLYPH[toast.tier]})</span> +{toast.delta}
      </div>
    </div>
  );
}
