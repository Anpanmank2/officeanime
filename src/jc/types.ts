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
  | { type: 'jcMemberStateChange'; memberId: string; jcState: JCState; stateSince?: number }
  | {
      type: 'jcDashboardSync';
      members: Array<{
        memberId: string;
        jcState: JCState;
        stateSince: number;
        currentTaskSummary: string | null;
        currentTaskId: string | null;
        parentMemberId: string | null;
        childMemberIds: string[];
        activitySummary: string | null;
      }>;
    }
  | { type: 'jcConfigLoaded'; config: JCConfig }
  | { type: 'jcMappingUpdate'; mappings: Record<number, string> }
  | { type: 'jcAbsenceUpdate'; payload: AbsenceInfo }
  | { type: 'jcAbsenceBulkSync'; payload: AbsenceInfo[] }
  | { type: 'jcTaskUpdate'; task: TaskDefinition }
  | { type: 'jcTasksBulkSync'; tasks: TaskDefinition[] }
  | { type: 'jcTaskHistory'; tasks: TaskDefinition[]; hasMore: boolean }
  | { type: 'jcTaskHistoryLog'; entries: unknown[]; hasMore: boolean; totalCount: number }
  | { type: 'jcTaskReorder'; tasks: TaskDefinition[] }
  | { type: 'officeLog:history'; entries: unknown[]; hasMore: boolean }
  | { type: 'jcSpeechBubble'; bubble: SpeechBubble }
  | { type: 'jcOfficeEvent'; event: OfficeEvent }
  // ── 部署カルテ (2026-07-03 藤井 §3): 生イベント履歴の転送 ──
  | { type: 'jcHistoryEvent'; event: OfficeEvent }
  | { type: 'jcEventHistory'; events: OfficeEvent[] }
  // ── Slice1 game overlay messages (DEV-SPEC §4.2) ──
  | {
      type: 'jcFitBadge';
      memberId: string;
      tier: 'great' | 'ok' | 'bad';
      fit: number;
      label: string;
    }
  | { type: 'jcGaugeStart'; memberId: string; tier: 'great' | 'ok' | 'bad' }
  | { type: 'jcGaugeStop'; memberId: string }
  | { type: 'jcGaugeStuck'; memberId: string; stuck: boolean }
  | {
      type: 'jcCompanyScore';
      total: number;
      delta: number;
      todayCount: number;
      memberId: string;
      memberName: string;
      tier: 'great' | 'ok' | 'bad';
    };

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
    }
  | {
      type: 'task:submit';
      prompt: string;
      priority: number;
      assignee?: string;
      workingDirectory?: string;
    }
  | { type: 'task:reorder'; taskIds: string[] }
  | { type: 'task:review'; taskId: string; action: 'approve' | 'reject' }
  | {
      type: 'task:requestHistory';
      startDate?: string;
      endDate?: string;
      status?: string[];
      labels?: string[];
      search?: string;
      limit?: number;
      offset?: number;
    }
  | { type: 'task:updateLabel'; taskId: string; date: string; label: string }
  | {
      type: 'officeLog:query';
      startDate?: string;
      endDate?: string;
      department?: string;
      logType?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  | {
      type: 'jcOwnerDelegate';
      memberId: string;
      memberName: string;
      department: string;
      task: string;
      message: string;
      priority: string;
      deadline: string | null;
      timestamp: string;
    };

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

/** Task definition for the orchestrator */
export interface TaskDefinition {
  id: string;
  assignee: string; // roster member ID e.g. "eng-02"
  prompt: string; // Claude Code prompt
  systemPrompt?: string;
  workingDirectory?: string;
  status: TaskStatus;
  priority: number; // 0 = P0 critical, 4 = P4 low
  createdAt: string; // ISO 8601
  startedAt?: string;
  completedAt?: string;
  result?: string;
  // Phase A extensions (all optional for backward compat)
  label?: TaskLabel;
  delegationChain?: string[]; // ordered member IDs
  reviewState?: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  outputFiles?: string[];
  completionSummary?: string;
  isIncident?: boolean;
  sortOrder?: number; // manual DnD ordering
}

/** tasks.json file schema */
export interface TasksFile {
  version: 1;
  tasks: TaskDefinition[];
}

/** Bubble overlay type for JC state visualization */
export type JCBubbleType =
  | 'coding' // ⚙️
  | 'thinking' // 💭
  | 'reading' // 🔍
  | 'reviewing' // 👀
  | 'error' // ❌
  | 'presenting' // 📊
  | 'meeting' // 🤝
  | 'coffee' // ☕
  | 'idle' // ⏳
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
  // v1.2: Delegation chain events (/company orchestration)
  ROLE_ESCALATE: 'role_escalate',
  DELEGATE: 'delegate',
  DELEGATION_COMPLETE: 'delegation_complete',
  PROGRESS_CHECK: 'progress_check',
  // 2026-07-04 R2: 秘書 1h ヒートビート痕跡 (from exec-sec)。「活動」には数えない
  // (店じまいタイマーをリセットしない) — 最終確認 HH:MM + 巡回リングの源。
  OFFICE_HEARTBEAT: 'office_heartbeat',
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
  // jc-emit.mjs emits the actor in `from`; older emitters used `agent`.
  // Consumer resolves `agent ?? from`, so both are optional.
  agent?: string; // member ID
  from?: string; // member ID (jc-emit.mjs producer field)
  task?: string;
  department?: string;
}

/** Cross-department message */
export interface CrossDeptMessageEvent extends OfficeEventBase {
  event: 'cross_dept_message';
  from: string; // member ID
  to: string; // member ID
  // R6 防御 (2026-07-03): jc-events は複数 writer — message 欠落があり得る (wire reality)
  message?: string;
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
  // jc-emit.mjs emits the actor in `from`; older emitters used `agent`.
  // Consumer resolves `agent ?? from`, so both are optional.
  agent?: string;
  from?: string; // member ID (jc-emit.mjs producer field)
  task?: string;
  department?: string;
}

/** Agent leave */
export interface AgentLeaveEvent extends OfficeEventBase {
  event: 'agent_leave';
  agent: string;
  reason: 'idle_timeout' | 'task_done' | 'manual';
}

// ── v1.2: Delegation chain events ──────────────────────────────

/** Role escalation (e.g. secretary → CEO) */
export interface RoleEscalateEvent extends OfficeEventBase {
  event: 'role_escalate';
  from: string; // member ID (e.g. secretary)
  to: string; // member ID (e.g. CEO)
  role: string; // role name for display
  message?: string; // escalation text (欠落し得る — R6 防御)
}

/** Delegation from lead/CEO to agent */
export interface DelegateEvent extends OfficeEventBase {
  event: 'delegate';
  from: string; // delegator member ID
  to: string[]; // delegatee member IDs
  task?: string;
  department?: string;
  message?: string; // delegation text for speech bubble (欠落し得る — R6 防御)
}

/** Delegation completion report (agent → lead → CEO) */
export interface DelegationCompleteEvent extends OfficeEventBase {
  event: 'delegation_complete';
  from: string; // completing member ID
  to: string; // report-to member ID
  task?: string;
  message?: string; // completion text (欠落し得る — R6 防御)
}

/** Progress check by secretary */
export interface ProgressCheckEvent extends OfficeEventBase {
  event: 'progress_check';
  from: string; // secretary member ID
  to: string; // checked member ID
  message?: string; // 欠落し得る — R6 防御
}

/** Secretary hourly heartbeat (2026-07-04 R2). Drives 最終確認 HH:MM + 巡回リング.
 *  NOT counted as "activity" (does not reset the office-close timer). */
export interface OfficeHeartbeatEvent extends OfficeEventBase {
  event: 'office_heartbeat';
  from: string; // exec-sec
  message?: string; // 任意 (巡回メモ等)
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
  | AgentLeaveEvent
  | RoleEscalateEvent
  | DelegateEvent
  | DelegationCompleteEvent
  | ProgressCheckEvent
  | OfficeHeartbeatEvent;

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
  /** Untruncated original line — OFFICE LOG/ticker log this instead of the
   *  bubble-truncated `text` (2026-07-03 P2-3 「…」切れ対策). Optional for
   *  backward compat: senders that don't truncate may omit it. */
  fullText?: string;
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
