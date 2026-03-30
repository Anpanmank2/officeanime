// ── Just Curious Virtual Office — Webview Entry Point ────────────

export { renderJCBubble, renderJCOverlay } from './jc-overlay.js';
export {
  JC_ENTRANCE,
  jcGetDeskPosition,
  jcGetMemberForAgent,
  jcGetMemberRuntime,
  jcGetPresentMemberIds,
  jcIsActive,
  jcLoadConfig,
  jcMemberArriving,
  jcMemberDeparted,
  jcMemberLeaving,
  jcMemberStateChange,
  jcUpdateMappings,
} from './jc-state.js';
export type { JCBubbleType, JCConfigData, JCMemberRuntime, NameplateInfo } from './jc-types.js';
