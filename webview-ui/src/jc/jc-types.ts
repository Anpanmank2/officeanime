// ── Just Curious Virtual Office — Webview Type Definitions ──────

/** Confidence level for task/report tiles */
export type ConfidenceLevel = 'confirmed' | 'likely' | 'unverified';

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

/** State log entry for BI aggregation */
export interface StateLogEntry {
  state: JCState;
  enteredAt: number;
  exitedAt: number | null;
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
  /** Cumulative working time in ms (coding + reading) */
  workingTotal: number;
  /** Recent state transition log for BI aggregation (ring buffer, max 100) */
  stateLog: StateLogEntry[];
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
  REVIEWING: 'reviewing',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Task label for auto-classification */
export const TaskLabel = {
  IMPLEMENTATION: 'implementation',
  RESEARCH: 'research',
  REVIEW: 'review',
  BUGFIX: 'bugfix',
  DESIGN: 'design',
  OPS: 'ops',
  INCIDENT: 'incident',
  OTHER: 'other',
} as const;
export type TaskLabel = (typeof TaskLabel)[keyof typeof TaskLabel];

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
  // Phase A extensions
  label?: TaskLabel;
  delegationChain?: string[];
  reviewState?: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  outputFiles?: string[];
  completionSummary?: string;
  isIncident?: boolean;
  sortOrder?: number;
  confidence?: ConfidenceLevel;
  extractedAt?: number;
}

/** Office log entry for the right-panel chronological log */
export interface OfficeLogEntry {
  id: string;
  timestamp: number;
  memberId: string;
  memberName: string;
  department: string;
  type: 'speech' | 'state_change' | 'task_event' | 'delegation' | 'arrival' | 'departure';
  summary: string;
  stateColor?: string;
  confidence?: ConfidenceLevel;
  extractedAt?: number;
}

/** Agent detail stats for the click popup */
export interface AgentDetailStats {
  tasksCompleted: number;
  uptimeMs: number;
  rejectionCount: number;
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

/** Owner avatar position type */
export type OwnerAvatarPosition = 'entrance' | 'secretary_desk' | string;

/** Owner avatar state */
export interface OwnerAvatarState {
  active: boolean;
  position: OwnerAvatarPosition;
  lastPosition: OwnerAvatarPosition;
  conversationTarget: string | null;
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
