// ── Just Curious Virtual Office — Webview Entry Point ────────────

export { renderJCBubble, renderJCOverlay } from './jc-overlay.js';
export {
  jcActivitySummaryUpdate,
  jcGetActivitySummary,
  jcGetAllTasks,
  jcGetMemberNames,
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
  jcUpdateMappings,
  POKER_TABLE_SEATS,
} from './jc-state.js';
export type {
  AbsenceInfo,
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
  TaskDefinition,
  TaskStatus,
} from './jc-types.js';
