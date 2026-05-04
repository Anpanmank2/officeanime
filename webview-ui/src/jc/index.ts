// ── Just Curious Virtual Office — Webview Entry Point ────────────

// Shared constants (single source of truth for colors, labels, etc.)
export { ConfidenceBadge } from './ConfidenceBadge.js';
export { filterByDept } from './dept-filter.js';
export { DeptFilterChips } from './DeptFilterChips.js';
export type { DeskCardProps } from './DeskCard.js';
export { DeskCard } from './DeskCard.js';
export type { DialogBoxProps } from './DialogBox.js';
export { DialogBox } from './DialogBox.js';
export { formatFreshness } from './freshness.js';
export {
  BUBBLE_EMOJIS,
  CONFIDENCE_BADGE_STYLES,
  CONFIDENCE_COLORS,
  DEPT_COLORS,
  DEPT_LABELS,
  DEPT_NEON,
  DEPT_POPUP_COLORS,
  IDLE_TIMEOUT_MS,
  PERMANENT_ROLES,
  SPEECH_BUBBLE_COLORS,
  STATE_COLORS,
  STATE_LABELS,
  TASK_STATUS_COLORS,
} from './jc-constants.js';
export { renderJCBubble, renderJCOverlay } from './jc-overlay.js';
export type { DashboardMember } from './jc-state.js';
export {
  jcActivitySummaryUpdate,
  jcAddSpeechBubble,
  jcGetActivitySummary,
  jcGetAllTasks,
  jcGetDashboardMembers,
  jcGetDeptColor,
  jcGetIdleMembers,
  jcGetMemberNames,
  jcGetSpeechBubbles,
  jcGetStateColor,
  jcIsPermanentResident,
  jcRecordActivity,
} from './jc-state.js';
export {
  JC_ENTRANCE,
  jcAbsenceBulkSync,
  jcAbsenceUpdate,
  jcGetAbsenceInfo,
  jcGetAbsentMemberAtDesk,
  jcGetBreakTarget,
  jcGetDeptStats,
  jcGetDeskPosition,
  jcGetDeskTaskStatus,
  jcGetMemberAtDesk,
  jcGetMemberForAgent,
  jcGetMemberInfo,
  jcGetMemberRuntime,
  jcGetMemberTaskStatus,
  jcGetPokerSeat,
  jcGetPresentMemberIds,
  jcIsActive,
  jcLoadConfig,
  jcMemberArriving,
  jcMemberDeparted,
  jcMemberLeaving,
  jcMemberStateChange,
  jcTasksBulkSync,
  jcTaskUpdate,
  jcTriggerLiaison,
  jcTriggerSubagentThinking,
  jcTriggerTaskCompleted,
  jcTriggerWave,
  jcUpdateMappings,
  POKER_TABLE_SEATS,
} from './jc-state.js';
export { subscribeMembers, subscribeTasks } from './jc-state.js';
export { jcGetOwnerAvatarState, jcSetOwnerAvatarState, subscribeOwnerAvatar } from './jc-state.js';
export type {
  AbsenceInfo,
  ConfidenceLevel,
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
  OwnerAvatarState,
  SpeechBubble,
  TaskDefinition,
  TaskStatus,
} from './jc-types.js';
export type { ViewMode } from './mode-store.js';
export { getViewMode, setViewMode, subscribeMode, useViewMode } from './mode-store.js';
export { ModeProvider } from './ModeContext.js';
export { ModeSwitcher } from './ModeSwitcher.js';
export { subscribeLog } from './office-log-state.js';
export { dismissOwner, OWNER_AGENT_ID, summonOwner } from './owner-avatar-constants.js';
export { OwnerAvatar } from './OwnerAvatar.js';
export { addPin, isPinned, removePin, subscribe as subscribePins } from './pin-store.js';
