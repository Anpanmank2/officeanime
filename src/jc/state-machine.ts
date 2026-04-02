// ── Just Curious Virtual Office — 13-State FSM ──────────────────

import { JCState } from './types.js';

/** Valid state transitions */
const TRANSITIONS: Record<JCState, readonly JCState[]> = {
  [JCState.ABSENT]: [JCState.ARRIVING],
  [JCState.ARRIVING]: [JCState.CODING, JCState.THINKING, JCState.READING, JCState.IDLE],
  [JCState.CODING]: [
    JCState.THINKING,
    JCState.READING,
    JCState.REVIEWING,
    JCState.IDLE,
    JCState.BREAK,
    JCState.ERROR,
    JCState.MEETING,
    JCState.HANDOFF,
    JCState.LEAVING,
  ],
  [JCState.THINKING]: [
    JCState.CODING,
    JCState.READING,
    JCState.IDLE,
    JCState.BREAK,
    JCState.ERROR,
    JCState.LEAVING,
  ],
  [JCState.READING]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.IDLE,
    JCState.BREAK,
    JCState.ERROR,
    JCState.LEAVING,
  ],
  [JCState.REVIEWING]: [JCState.CODING, JCState.IDLE, JCState.LEAVING],
  [JCState.PRESENTING]: [JCState.IDLE, JCState.LEAVING],
  [JCState.MEETING]: [JCState.CODING, JCState.IDLE, JCState.LEAVING],
  [JCState.BREAK]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.IDLE,
    JCState.LEAVING,
  ],
  [JCState.ERROR]: [JCState.CODING, JCState.IDLE, JCState.LEAVING],
  [JCState.IDLE]: [
    JCState.CODING,
    JCState.THINKING,
    JCState.READING,
    JCState.BREAK,
    JCState.MEETING,
    JCState.HANDOFF,
    JCState.LEAVING,
  ],
  [JCState.HANDOFF]: [JCState.MEETING, JCState.IDLE, JCState.LEAVING],
  [JCState.LEAVING]: [JCState.ABSENT],
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
