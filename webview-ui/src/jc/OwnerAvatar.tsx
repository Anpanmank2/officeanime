// ── Just Curious — Owner Avatar ───────────────────────────────────
// Manages the Owner character in the office canvas engine.
// Uses reserved agent ID OWNER_AGENT_ID = -9999.
// Position lifecycle: entrance → secretary_desk → <member target> → exit
//
// Sprite placeholder: palette 0 + gold hue shift.
// Drop webview-ui/public/assets/characters/owner.png for the real sprite.

import { useEffect, useRef } from 'react';

import type { OfficeState } from '../office/engine/officeState.js';
import { TILE_SIZE } from '../office/types.js';
import {
  JC_ENTRANCE,
  jcGetDeskPosition,
  jcGetMemberRuntime,
  jcGetOwnerAvatarState,
  jcSetOwnerAvatarState,
  subscribeOwnerAvatar,
} from './jc-state.js';
import type { OwnerAvatarState } from './jc-types.js';
import { OWNER_AGENT_ID } from './owner-avatar-constants.js';

/** Secretary desk tile (from DESK_POSITIONS['exec-desk-sec']) */
const SECRETARY_DESK = { col: 8, row: 4 };

/** Owner character palette + hue shift (gold tint) */
const OWNER_PALETTE = 0;
const OWNER_HUE_SHIFT = 45;

/** Spawn animation duration ms */
const SPAWN_MS = 400;

/** Walk-to-entrance duration ms before despawn */
const EXIT_WALK_MS = 1500;

interface OwnerAvatarProps {
  officeState: OfficeState;
  /** Called when the owner has fully exited the office */
  onExited?: () => void;
}

/**
 * OwnerAvatar — imperative bridge between jcOwnerAvatarState and OfficeState.
 * Renders nothing (canvas handled by existing renderer).
 */
export function OwnerAvatar({ officeState, onExited }: OwnerAvatarProps) {
  const prevStateRef = useRef<OwnerAvatarState>(jcGetOwnerAvatarState());
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearWalkTimer() {
    if (walkTimerRef.current !== null) {
      clearTimeout(walkTimerRef.current);
      walkTimerRef.current = null;
    }
  }

  function clearExitTimer() {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }

  function clearIdleTimer() {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(
      () => {
        // 15-minute idle timeout → trigger exit
        performExit();
      },
      15 * 60 * 1000,
    );
  }

  function spawnOwner() {
    clearWalkTimer();
    clearExitTimer();

    // Spawn at entrance if not already present
    if (!officeState.characters.has(OWNER_AGENT_ID)) {
      officeState.addAgent(OWNER_AGENT_ID, OWNER_PALETTE, OWNER_HUE_SHIFT);
      const ch = officeState.characters.get(OWNER_AGENT_ID);
      if (ch) {
        ch.x = JC_ENTRANCE.col * TILE_SIZE + TILE_SIZE / 2;
        ch.y = JC_ENTRANCE.row * TILE_SIZE + TILE_SIZE / 2;
        ch.tileCol = JC_ENTRANCE.col;
        ch.tileRow = JC_ENTRANCE.row;
      }
    }

    jcSetOwnerAvatarState({ position: 'entrance' });
    resetIdleTimer();

    // Walk to secretary desk after spawn animation
    walkTimerRef.current = setTimeout(() => {
      officeState.walkToTile(OWNER_AGENT_ID, SECRETARY_DESK.col, SECRETARY_DESK.row);
      jcSetOwnerAvatarState({ position: 'secretary_desk' });
    }, SPAWN_MS);
  }

  function walkToMember(memberId: string) {
    // Find this member's desk position via their deskId in config
    const runtime = jcGetMemberRuntime(memberId);
    if (!runtime) return;
    const deskPos = jcGetDeskPosition(runtime.config.deskId);
    if (!deskPos) return;
    officeState.walkToTile(OWNER_AGENT_ID, deskPos.col, deskPos.row);
    jcSetOwnerAvatarState({ position: memberId });
    resetIdleTimer();
  }

  function performExit() {
    clearWalkTimer();
    clearIdleTimer();

    if (officeState.characters.has(OWNER_AGENT_ID)) {
      officeState.walkToTile(OWNER_AGENT_ID, JC_ENTRANCE.col, JC_ENTRANCE.row);
    }

    jcSetOwnerAvatarState({
      lastPosition: jcGetOwnerAvatarState().position,
      position: 'entrance',
      conversationTarget: null,
    });

    exitTimerRef.current = setTimeout(() => {
      officeState.removeAgent(OWNER_AGENT_ID);
      jcSetOwnerAvatarState({
        active: false,
        position: 'entrance',
        lastPosition: 'entrance',
        conversationTarget: null,
      });
      onExited?.();
    }, EXIT_WALK_MS);
  }

  useEffect(() => {
    const unsub = subscribeOwnerAvatar(() => {
      const prev = prevStateRef.current;
      const next = jcGetOwnerAvatarState();
      prevStateRef.current = next;

      if (!prev.active && next.active) {
        spawnOwner();
      } else if (prev.active && !next.active) {
        // Dismissed externally — removeAgent was already called or will be by performExit
        // Only trigger exit walk if character still exists
        if (officeState.characters.has(OWNER_AGENT_ID)) {
          performExit();
        }
      } else if (
        next.active &&
        next.conversationTarget !== null &&
        next.conversationTarget !== prev.conversationTarget
      ) {
        walkToMember(next.conversationTarget);
      }
    });

    return () => {
      unsub();
      clearWalkTimer();
      clearExitTimer();
      clearIdleTimer();
    };
    // deps: officeState is stable (created once), onExited is stable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeState]);

  return null;
}
