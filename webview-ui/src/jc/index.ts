// ── Just Curious Virtual Office — Webview Entry Point ────────────

export { renderJCBubble, renderJCOverlay } from './jc-overlay.js';
export {
  JC_ENTRANCE,
  jcGetBreakTarget,
  jcGetDeskPosition,
  jcGetMemberForAgent,
  jcGetMemberRuntime,
  jcGetPokerSeat,
  jcGetPresentMemberIds,
  jcIsActive,
  jcLoadConfig,
  jcMemberArriving,
  jcMemberDeparted,
  jcMemberLeaving,
  jcMemberStateChange,
  jcTriggerLiaison,
  jcUpdateMappings,
  POKER_TABLE_SEATS,
} from './jc-state.js';
export type {
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
} from './jc-types.js';
