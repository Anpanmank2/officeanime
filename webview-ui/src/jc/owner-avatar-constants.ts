// ── Just Curious — Owner Avatar Constants & Helpers ───────────────
// Separated from OwnerAvatar.tsx to satisfy react-refresh/only-export-components.

import { jcGetOwnerAvatarState, jcSetOwnerAvatarState } from './jc-state.js';

/** Reserved agent ID for the Owner — never used by real agents */
export const OWNER_AGENT_ID = -9999;

/** Sprite key of the owner's chibi frames (owner.json); not a roster member ID */
export const OWNER_SPRITE_KEY = 'exec-01';

/** Summon the owner avatar into the office */
export function summonOwner(): void {
  const current = jcGetOwnerAvatarState();
  if (current.active) return; // already present
  jcSetOwnerAvatarState({
    active: true,
    position: 'entrance',
    lastPosition: current.lastPosition,
    conversationTarget: null,
  });
}

/** Dismiss the owner avatar — triggers exit animation */
export function dismissOwner(): void {
  jcSetOwnerAvatarState({ active: false });
}
