// ── Just Curious Virtual Office — Type Definitions ──────────────

/** 13-state FSM for JC characters */
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

/** Office zones */
export const ZoneType = {
  ENTRANCE: 'entrance',
  EXEC: 'exec',
  POKER: 'poker',
  BREAK: 'break',
  DEV: 'dev',
  MARKETING: 'marketing',
  RESEARCH: 'research',
  OPS: 'ops',
} as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];

/** Department IDs */
export type Department = 'engineering' | 'marketing' | 'research' | 'exec';

/** Layer level */
export type Layer = 'L1' | 'L2' | 'L3' | 'L4';

/** Member definition from jc-config.json */
export interface JCMember {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  department: Department;
  layer: Layer;
  zone: ZoneType;
  hueShift: number;
  palette?: number;
  deskId: string;
}

/** Exec member (icon-only display) */
export interface JCExec {
  id: string;
  name: string;
  role: string;
  zone: 'exec';
}

/** Mapping rule for session → member */
export interface MappingRule {
  projectPattern?: string;
  keyword?: string;
  memberId: string;
}

/** Full JC configuration */
export interface JCConfig {
  organization: string;
  version: number;
  members: JCMember[];
  exec: JCExec[];
  mapping: {
    rules: MappingRule[];
    fallback: 'prompt' | 'random';
  };
}

/** Desk entry in the registry */
export interface DeskEntry {
  deskId: string;
  memberId: string;
  zone: ZoneType;
  seatCol: number;
  seatRow: number;
  facingDir: number; // Direction enum: 0=DOWN, 1=LEFT, 2=RIGHT, 3=UP
  nameplate: string;
  nameplateEn: string;
}

/** Runtime state per JC member */
export interface JCMemberState {
  memberId: string;
  jcState: JCState;
  /** Mapped agent ID (from Pixel Agents), or null if absent */
  agentId: number | null;
  /** Seat UID in the fork's system */
  seatUid: string | null;
  /** Whether currently present in office */
  isPresent: boolean;
}

/** Message types for JC extension ↔ webview communication */
export type JCMessageToWebview =
  | { type: 'jcMemberArriving'; memberId: string; deskId: string; hueShift: number }
  | { type: 'jcMemberLeaving'; memberId: string }
  | { type: 'jcMemberStateChange'; memberId: string; jcState: JCState }
  | { type: 'jcConfigLoaded'; config: JCConfig }
  | { type: 'jcMappingUpdate'; mappings: Record<number, string> }
  | { type: 'jcAbsenceUpdate'; payload: AbsenceInfo }
  | { type: 'jcAbsenceBulkSync'; payload: AbsenceInfo[] }
  | { type: 'jcTaskUpdate'; task: TaskDefinition }
  | { type: 'jcTasksBulkSync'; tasks: TaskDefinition[] }
  | { type: 'jcSpeechBubble'; bubble: SpeechBubble }
  | { type: 'jcOfficeEvent'; event: OfficeEvent };

export type JCMessageToExtension =
  | { type: 'jcRequestMapping'; agentId: number }
  | { type: 'jcAssignMapping'; agentId: number; memberId: string }
  | { type: 'jcLaunchAgent'; memberId: string }
  | {
      type: 'jcSubmitTask';
      memberId: string;
      prompt: string;
      priority: number;
      workingDirectory?: string;
    };

/** Task status values */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Task definition for the orchestrator */
export interface TaskDefinition {
  id: string;
  assignee: string; // roster member ID e.g. "eng-02"
  prompt: string; // Claude Code prompt
  systemPrompt?: string;
  workingDirectory?: string;
  status: TaskStatus;
  priority: number; // 1 = highest
  createdAt: string; // ISO 8601
  startedAt?: string;
  completedAt?: string;
  result?: string;
}

/** tasks.json file schema */
export interface TasksFile {
  version: 1;
  tasks: TaskDefinition[];
}

/** Bubble overlay type for JC state visualization */
export type JCBubbleType =
  | 'thinking' // 💭
  | 'reviewing' // ✓
  | 'error' // ❌
  | 'presenting' // 📊
  | 'meeting' // 🤝
  | 'coffee' // ☕
  | null;

// ── Office Event Queue ──────────────────────────────────────────

/** Event types for the file-based event queue (Claude Code → Office UI) */
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

/** Base office event */
export interface OfficeEventBase {
  event: OfficeEventType;
  timestamp: string; // ISO 8601
}

/** Task received by CEO */
export interface TaskReceivedEvent extends OfficeEventBase {
  event: 'task_received';
  task: string;
  from: string; // 'user' or member ID
}

/** Task assigned to member(s) */
export interface TaskAssignedEvent extends OfficeEventBase {
  event: 'task_assigned';
  from: string; // assigner member ID
  to: string[]; // assignee member IDs
  task: string;
  department: string;
}

/** Work started by a member */
export interface WorkStartedEvent extends OfficeEventBase {
  event: 'work_started';
  agent: string; // member ID
  task: string;
  department: string;
}

/** Cross-department message */
export interface CrossDeptMessageEvent extends OfficeEventBase {
  event: 'cross_dept_message';
  from: string; // member ID
  to: string; // member ID
  message: string;
  from_dept: string;
  to_dept: string;
}

/** Review requested */
export interface ReviewRequestedEvent extends OfficeEventBase {
  event: 'review_requested';
  from: string;
  to: string;
  task: string;
}

/** Review completed */
export interface ReviewCompletedEvent extends OfficeEventBase {
  event: 'review_completed';
  from: string;
  to: string;
  approved: boolean;
}

/** Task completed */
export interface TaskCompletedEvent extends OfficeEventBase {
  event: 'task_completed';
  agent: string;
  task: string;
  department: string;
}

/** Agent leave */
export interface AgentLeaveEvent extends OfficeEventBase {
  event: 'agent_leave';
  agent: string;
  reason: 'idle_timeout' | 'task_done' | 'manual';
}

/** Union of all office events */
export type OfficeEvent =
  | TaskReceivedEvent
  | TaskAssignedEvent
  | WorkStartedEvent
  | CrossDeptMessageEvent
  | ReviewRequestedEvent
  | ReviewCompletedEvent
  | TaskCompletedEvent
  | AgentLeaveEvent;

/** Office events file schema */
export interface OfficeEventsFile {
  version: 1;
  events: OfficeEvent[];
}

// ── Speech Bubbles ──────────────────────────────────────────────

/** Speech bubble for cross-department communication visualization */
export interface SpeechBubble {
  id: string;
  memberId: string;
  text: string;
  department: string;
  timestamp: number; // Date.now()
  duration: number; // ms (default 3000)
}

/** Absence tracking info for JC members without active agents */
export interface AbsenceInfo {
  memberId: string;
  memberName: string;
  role: string;
  department: string;
  status: 'active' | 'absent' | 'idle';
  lastActivity: number; // Unix timestamp (ms)
  lastTool?: string;
  lastFile?: string;
  sessionDuration?: number; // cumulative seconds today
  absentSince?: number; // timestamp when absence started
}
