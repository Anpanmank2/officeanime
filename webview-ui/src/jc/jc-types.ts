// ── Just Curious Virtual Office — Webview Type Definitions ──────

/** 13-state FSM (mirrors src/jc/types.ts) */
export const JCState = {
  ABSENT: 'absent',
  ARRIVING: 'arriving',
  CODING: 'coding',
  THINKING: 'thinking',
  READING: 'reading',
  REVIEWING: 'reviewing',
  PRESENTING: 'presenting',
  MEETING: 'meeting',
  BREAK: 'break',
  ERROR: 'error',
  IDLE: 'idle',
  HANDOFF: 'handoff',
  LEAVING: 'leaving',
} as const;
export type JCState = (typeof JCState)[keyof typeof JCState];

/** Zone types */
export type ZoneType =
  | 'entrance'
  | 'exec'
  | 'poker'
  | 'break'
  | 'dev'
  | 'marketing'
  | 'research'
  | 'ops';

/** Member config (subset needed by webview) */
export interface JCMemberConfig {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  department: string;
  zone: ZoneType;
  hueShift: number;
  palette?: number;
  deskId: string;
  accentColor?: string;
  breakBehavior?: 'coffee' | 'sofa' | 'arcade' | 'bookshelf' | 'meeting';
}

/** Exec config */
export interface JCExecConfig {
  id: string;
  name: string;
  role: string;
  zone: 'exec';
}

/** Full config from extension */
export interface JCConfigData {
  organization: string;
  members: JCMemberConfig[];
  exec: JCExecConfig[];
}

/** Per-member runtime state in the webview */
export interface JCMemberRuntime {
  memberId: string;
  config: JCMemberConfig;
  jcState: JCState;
  isPresent: boolean;
  /** Overlay bubble type */
  bubbleType: JCBubbleType;
  /** Timestamp when member entered idle state (for idle emoji trigger) */
  idleSince: number | null;
  /** Temporary emotion emoji overlay (e.g. 🎉 on task complete) */
  emotionEmoji: string | null;
  /** Emotion emoji expiry timestamp */
  emotionUntil: number;
  /** Timestamp when member started coding/reading (for focus 🔥 after 3min) */
  workingSince: number | null;
  /** Timestamp when member entered current state (for dashboard duration display) */
  stateSince: number;
}

/** Bubble overlay types */
export type JCBubbleType =
  | 'coding'
  | 'thinking'
  | 'reading'
  | 'reviewing'
  | 'error'
  | 'presenting'
  | 'meeting'
  | 'coffee'
  | 'sofa'
  | 'arcade'
  | 'bookshelf'
  | 'idle'
  | null;

/** Desk nameplate render info */
export interface NameplateInfo {
  text: string;
  col: number;
  row: number;
  isPresent: boolean;
  zone: ZoneType;
}

/** Absence tracking info for JC members without active agents */
export interface AbsenceInfo {
  memberId: string;
  memberName: string;
  role: string;
  department: string;
  status: 'active' | 'absent' | 'idle';
  lastActivity: number;
  lastTool?: string;
  lastFile?: string;
  sessionDuration?: number;
  absentSince?: number;
}

/** Task status values */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Task definition (mirrors extension-side) */
export interface TaskDefinition {
  id: string;
  assignee: string;
  prompt: string;
  systemPrompt?: string;
  workingDirectory?: string;
  status: TaskStatus;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
}

/** Command types sent from webview to extension */
export const CommandType = {
  AGENT_INSTRUCT: 'agent:instruct',
  AGENT_DIRECTIVE: 'agent:directive',
  AGENT_FOCUS: 'agent:focus',
  BROADCAST_SEND: 'broadcast:send',
  TASK_CANCEL: 'task:cancel',
  TASK_PRIORITIZE: 'task:prioritize',
  TASK_REASSIGN: 'task:reassign',
} as const;

/** Instruction mode */
export type InstructionMode = 'instant' | 'directive';

/** Speech bubble for cross-department communication visualization */
export interface SpeechBubble {
  id: string;
  memberId: string;
  text: string;
  department: string;
  timestamp: number; // Date.now()
  duration: number; // ms (default 3000)
}

/** Office event types for file-based event queue */
export const OfficeEventType = {
  OFFICE_OPEN: 'office_open',
  TASK_RECEIVED: 'task_received',
  TASK_ASSIGNED: 'task_assigned',
  WORK_STARTED: 'work_started',
  CROSS_DEPT_MESSAGE: 'cross_dept_message',
  REVIEW_REQUESTED: 'review_requested',
  REVIEW_COMPLETED: 'review_completed',
  TASK_COMPLETED: 'task_completed',
  AGENT_LEAVE: 'agent_leave',
} as const;
export type OfficeEventType = (typeof OfficeEventType)[keyof typeof OfficeEventType];
