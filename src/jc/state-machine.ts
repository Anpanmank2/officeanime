// ── Just Curious Virtual Office — 13-State FSM ──────────────────

import { JCState } from './types.js';

/**
 * Valid state transitions — v1 core + v2 extended states.
 *
 * v2 additions:
 *   BREAK     — idle 3min or orchestrator → break zone → idle/work on return
 *   MEETING   — office event → poker table → idle/work on end
 *   HANDOFF   — delegation event → walk to target desk → return
 *   REVIEWING — review request event → desk reading variant
 *   PRESENTING — meeting derivative → ops hub area
 */
const TRANSITIONS: Record<JCState, readonly JCState[]> = {
  // ── v1 core states ──
  [JCState.ABSENT]: [JCState.ARRIVING],
  [JCState.ARRIVING]: [JCState.CODING, JCState.THINKING, JCState.READING, JCState.IDLE],
  [JCState.CODING]: [
    JCState.THINKING,
    JCState.READING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
    JCState.BREAK,
    JCState.MEETING,
    JCState.REVIEWING,
    JCState.HANDOFF,
  ],
  [JCState.THINKING]: [
    JCState.CODING,
    JCState.READING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
    JCState.BREAK,
    JCState.MEETING,
    JCState.REVIEWING,
    JCState.HANDOFF,
  ],
  [JCState.READING]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.IDLE,
    JCState.ERROR,
    JCState.LEAVING,
    JCState.BREAK,
    JCState.MEETING,
    JCState.REVIEWING,
    JCState.HANDOFF,
  ],
  [JCState.ERROR]: [JCState.CODING, JCState.IDLE, JCState.LEAVING, JCState.BREAK],
  [JCState.IDLE]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.LEAVING,
    JCState.BREAK,
    JCState.MEETING,
    JCState.REVIEWING,
    JCState.HANDOFF,
  ],
  [JCState.LEAVING]: [JCState.ABSENT],
  // ── v2 extended states ──
  [JCState.BREAK]: [
    JCState.IDLE,
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.LEAVING,
  ],
  [JCState.MEETING]: [
    JCState.IDLE,
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.LEAVING,
    JCState.PRESENTING,
  ],
  [JCState.HANDOFF]: [
    JCState.IDLE,
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.LEAVING,
  ],
  [JCState.REVIEWING]: [
    JCState.IDLE,
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.LEAVING,
    JCState.MEETING,
  ],
  [JCState.PRESENTING]: [JCState.IDLE, JCState.MEETING, JCState.LEAVING],
};

/** Check if a transition is valid */
export function canTransition(from: JCState, to: JCState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Attempt a state transition; returns the new state or the old state if invalid */
export function transition(current: JCState, target: JCState): JCState {
  if (canTransition(current, target)) {
    return target;
  }
  // If we can't transition directly, check if we need an intermediate state
  // e.g., ABSENT → CODING requires ABSENT → ARRIVING first
  return current;
}

/** Map Claude Code tool names to JC states */
export function toolToJCState(toolName: string): JCState {
  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'Bash':
    case 'NotebookEdit':
      return JCState.CODING;

    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'WebFetch':
    case 'WebSearch':
      return JCState.READING;

    case 'Task':
    case 'Agent':
    case 'EnterPlanMode':
      return JCState.THINKING;

    case 'AskUserQuestion':
      return JCState.IDLE;

    default:
      return JCState.CODING;
  }
}

/** Determine JC bubble type for visual overlay */
export function stateToOverlayBubble(
  state: JCState,
):
  | 'coding'
  | 'thinking'
  | 'reading'
  | 'reviewing'
  | 'error'
  | 'presenting'
  | 'meeting'
  | 'coffee'
  | 'idle'
  | null {
  switch (state) {
    case JCState.CODING:
      return 'coding';
    case JCState.THINKING:
      return 'thinking';
    case JCState.READING:
      return 'reading';
    case JCState.REVIEWING:
      return 'reviewing';
    case JCState.ERROR:
      return 'error';
    case JCState.PRESENTING:
      return 'presenting';
    case JCState.MEETING:
      return 'meeting';
    case JCState.BREAK:
      return 'coffee';
    case JCState.IDLE:
      return 'idle';
    default:
      return null;
  }
}

/** Check if a state should use typing animation */
export function isTypingState(state: JCState): boolean {
  return state === JCState.CODING;
}

/** Check if a state should use reading animation */
export function isReadingState(state: JCState): boolean {
  return state === JCState.READING || state === JCState.REVIEWING;
}

/** Check if a state should use walking animation */
export function isWalkingState(state: JCState): boolean {
  return state === JCState.ARRIVING || state === JCState.LEAVING || state === JCState.HANDOFF;
}

/** Check if a state means the member is at their desk */
export function isAtDesk(state: JCState): boolean {
  return (
    state === JCState.CODING ||
    state === JCState.THINKING ||
    state === JCState.READING ||
    state === JCState.REVIEWING ||
    state === JCState.ERROR ||
    state === JCState.IDLE
  );
}
