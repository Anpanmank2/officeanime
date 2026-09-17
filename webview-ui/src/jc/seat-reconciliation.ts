import { CharacterState, TILE_SIZE } from '../office/types.js';
import type { Character } from '../office/types.js';
import type { OfficeState } from '../office/engine/officeState.js';

type SeatAssignment = {
  character: Character;
  seatId: string;
  state: CharacterState;
};

function placeAtSeat(officeState: OfficeState, assignment: SeatAssignment): void {
  const { character, seatId, state } = assignment;
  const seat = officeState.seats.get(seatId);
  if (!seat || seat.assigned) return;

  seat.assigned = true;
  character.seatId = seatId;
  character.tileCol = seat.seatCol;
  character.tileRow = seat.seatRow;
  character.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
  character.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
  character.dir = seat.facingDir;
  character.path = [];
  character.moveProgress = 0;
  character.state = state;
  character.frame = 0;
  character.frameTimer = 0;
}

/**
 * Reclaim registered seats after a layout rebuild.
 *
 * `rebuildFromLayout` preserves matching UIDs, then fills all other characters
 * into arbitrary free seats. Release every registered character (including the
 * owner) before reserving their new seats so a legacy UID can never block a
 * compact UID, regardless of insertion order.
 */
export function reconcileRegisteredSeats(
  officeState: OfficeState,
  seatByMemberId: Map<string, string>,
  ownerAgentId?: number,
  ownerSeatId?: string,
): void {
  const assignments: SeatAssignment[] = [];
  const charactersToRelease = new Set<Character>();
  for (const character of officeState.characters.values()) {
    if (character.isSubagent) continue;
    const seatId = character.jcMemberId ? seatByMemberId.get(character.jcMemberId) : undefined;
    if (seatId && officeState.seats.has(seatId)) {
      charactersToRelease.add(character);
      assignments.push({
        character,
        seatId,
        state: character.isActive ? CharacterState.TYPE : CharacterState.IDLE,
      });
    }
  }

  const owner = ownerAgentId === undefined ? undefined : officeState.characters.get(ownerAgentId);
  if (owner) charactersToRelease.add(owner);
  if (owner && ownerSeatId && officeState.seats.has(ownerSeatId)) {
    assignments.push({ character: owner, seatId: ownerSeatId, state: CharacterState.IDLE });
  }

  // Pass 1: relinquish old (or arbitrary fallback) seats and discard stale IDs.
  for (const character of charactersToRelease) {
    if (character.seatId) {
      const oldSeat = officeState.seats.get(character.seatId);
      if (oldSeat) oldSeat.assigned = false;
    }
    character.seatId = null;
  }

  // Pass 2: reserve every registered target from the now-free pool.
  for (const assignment of assignments) placeAtSeat(officeState, assignment);
}
