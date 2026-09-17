import { useEffect, useRef } from 'react';

import { PET_VOICE_COLORS } from '../constants.js';
import { jcGetPet, jcSubscribePet } from './pet-state.js';
import { claimPetVoice, currentPetVoice } from './pet-voice-state.js';

export interface PetBubbleAnchor {
  x: number;
  y: number;
  visible: boolean;
}

/** A small DOM speech bubble follows the companion, with no HTML interpretation. */
export function PetSpeechBubble({ anchor }: { anchor: React.RefObject<PetBubbleAnchor> }) {
  const bubble = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activeId: string | null = null;
    let expires = 0;
    let frame = 0;
    const hide = () => {
      activeId = null;
      if (bubble.current) bubble.current.hidden = true;
    };
    const refresh = () => {
      const pet = jcGetPet();
      const voice = currentPetVoice(pet?.firstVoice ?? null);
      if (!voice || (activeId && activeId !== voice.id)) hide();
    };
    const tick = () => {
      const el = bubble.current;
      const pet = jcGetPet();
      const voice = currentPetVoice(pet?.firstVoice ?? null);
      const pos = anchor.current;
      if (!voice || (activeId && (activeId !== voice.id || Date.now() >= expires))) hide();
      if (el && voice && pet && pos.visible && !document.hidden && !activeId) {
        let storage: Storage | null = null;
        try {
          storage = window.sessionStorage;
        } catch {
          /* explicit reading remains available */
        }
        if (claimPetVoice(voice, storage)) {
          activeId = voice.id;
          expires = Date.now() + Math.max(20_000, [...voice.text].length * 180);
          if (name.current) name.current.textContent = pet.name;
          if (body.current) body.current.textContent = voice.text;
        }
      }
      if (el) {
        el.hidden = !activeId || !pos.visible;
        if (activeId) {
          const parent = el.parentElement!;
          const left = Math.max(8, Math.min(pos.x + 16, parent.clientWidth - el.offsetWidth - 8));
          const top = Math.max(
            40,
            Math.min(pos.y - el.offsetHeight - 12, parent.clientHeight - el.offsetHeight - 8),
          );
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const unsubscribe = jcSubscribePet(refresh);
    frame = requestAnimationFrame(tick);
    const el = bubble.current;
    el?.addEventListener('pet-voice-close', hide);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      el?.removeEventListener('pet-voice-close', hide);
    };
  }, [anchor]);

  return (
    <div
      ref={bubble}
      hidden
      data-pet-first-voice
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        // Keep the greeting and its close button above the persistent office log
        // in narrow extension panels, but below the companion's status card (62).
        zIndex: 51,
        width: 'min(340px, calc(100% - 16px))',
        boxSizing: 'border-box',
        padding: '10px 14px',
        background: PET_VOICE_COLORS.background,
        color: PET_VOICE_COLORS.text,
        border: `2px solid ${PET_VOICE_COLORS.border}`,
        borderRadius: 12,
        boxShadow: 'var(--pixel-shadow)',
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <button
        aria-label="第一声を閉じる"
        onClick={() => bubble.current?.dispatchEvent(new Event('pet-voice-close'))}
        style={{
          float: 'right',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          color: PET_VOICE_COLORS.muted,
        }}
      >
        ×
      </button>
      <div
        ref={name}
        style={{ fontSize: 11, color: PET_VOICE_COLORS.muted, overflowWrap: 'anywhere' }}
      />
      <div
        ref={body}
        data-pet-first-voice-text
        style={{
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: 190,
          overflowY: 'auto',
        }}
      />
    </div>
  );
}
