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
}

/** Bubble overlay types */
export type JCBubbleType =
  | 'thinking'
  | 'reviewing'
  | 'error'
  | 'presenting'
  | 'meeting'
  | 'coffee'
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
