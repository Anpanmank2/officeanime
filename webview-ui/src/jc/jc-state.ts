// ── Just Curious Virtual Office — Webview State Manager ─────────

import { COMPACT_DESK_SEAT_UIDS, resolveCompactDeskSeatPositions } from './desk-seat-registry.js';
import {
  DEPT_COLORS,
  IDLE_TIMEOUT_MS,
  NON_WORKING_STATES,
  OFFICE_SECRETARY_SEAT,
  PERMANENT_ROLES,
  PET_TILE,
  SPEECH_BUBBLE_BASE_MS,
  SPEECH_BUBBLE_MAX_MS,
  SPEECH_BUBBLE_PER_10_CHARS_MS,
  STATE_COLORS,
} from './jc-constants.js';
import type {
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
  OwnerAvatarState,
  SpeechBubble,
  StateLogEntry,
  TaskDefinition,
} from './jc-types.js';
import { isPinned } from './pin-store.js';

/** Global JC webview state */
let jcConfig: JCConfigData | null = null;
const memberRuntimes = new Map<string, JCMemberRuntime>();
const agentToMember = new Map<number, string>();

export interface ApprovalOption {
  key: string;
  label: string;
  recommended: boolean;
}

export interface ApprovalRequest {
  project?: string;
  id: string;
  company_id: string;
  from: string;
  title: string;
  body_md: string;
  options: ApprovalOption[];
  irreversible: boolean;
  expires: string;
}

type ApprovalQueueEvent =
  | ({ event: 'approval_request'; timestamp: string } & ApprovalRequest)
  | { event: 'approval_cancel' | 'approval_expired'; request_id: string; at?: string }
  | {
      event: 'approval_resolved';
      request_id: string;
      answer: string;
      at: string;
      via: 'office' | 'chat';
    };

const closedApprovals = new Set<string>();
const approvals = new Map<string, ApprovalRequest>();
const resolvedApprovalCache = new Map<
  string,
  Pick<ApprovalRequest, 'title' | 'options' | 'from'>
>();

export function jcGetApprovalDetails(id: string) {
  return approvals.get(id) ?? resolvedApprovalCache.get(id);
}

const approvalListeners = new Set<() => void>();

function isApprovalQueueEvent(value: unknown): value is ApprovalQueueEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = (value as { event?: unknown }).event;
  return (
    event === 'approval_request' ||
    event === 'approval_cancel' ||
    event === 'approval_expired' ||
    event === 'approval_resolved'
  );
}

function notifyApprovals(): void {
  for (const listener of approvalListeners) listener();
}

/** Apply queue events idempotently; repeated requests overwrite their existing row. */
export function jcApplyApprovalEvent(event: ApprovalQueueEvent): void {
  if (event.event === 'approval_request') {
    if (closedApprovals.has(event.id)) return;
    approvals.set(event.id, event);
  } else {
    closedApprovals.add(event.request_id);
    const request = approvals.get(event.request_id);
    if (request && event.event === 'approval_resolved') {
      resolvedApprovalCache.set(request.id, {
        title: request.title,
        options: request.options,
        from: request.from,
      });
      if (resolvedApprovalCache.size > 50) {
        resolvedApprovalCache.delete(resolvedApprovalCache.keys().next().value!);
      }
    }
    approvals.delete(event.request_id);
  }
  notifyApprovals();
}

/** Pending approval requests, excluding any whose expiry has passed. */
export function jcGetApprovalRequests(now = Date.now()): ApprovalRequest[] {
  let changed = false;
  for (const [id, request] of approvals) {
    if (Date.parse(request.expires) <= now) {
      closedApprovals.add(id);
      approvals.delete(id);
      changed = true;
    }
  }
  if (changed) notifyApprovals();
  return [...approvals.values()];
}

export function subscribeApprovals(listener: () => void): () => void {
  approvalListeners.add(listener);
  return () => approvalListeners.delete(listener);
}

// Approval events are already forwarded by EventWatcher as jcOfficeEvent. The
// history messages make pending requests recover after a webview reload.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'message',
    (message: MessageEvent<{ type?: string; event?: unknown; events?: unknown }>) => {
      if (message.data?.type === 'jcOfficeEvent' || message.data?.type === 'jcHistoryEvent') {
        if (isApprovalQueueEvent(message.data.event)) jcApplyApprovalEvent(message.data.event);
      } else if (message.data?.type === 'jcEventHistory' && Array.isArray(message.data.events)) {
        for (const event of message.data.events) {
          if (isApprovalQueueEvent(event)) jcApplyApprovalEvent(event);
        }
      }
    },
  );
}

/** Entrance tile (spawn/despawn point) */
export const JC_ENTRANCE = { col: 12, row: 6 };

/** Poker Table seats — meeting gathering point in Poker Room */
export const POKER_TABLE_SEATS = [
  { col: 16, row: 17 },
  { col: 18, row: 17 },
  { col: 17, row: 16 },
  { col: 17, row: 18 },
];

/** Break zone target positions by breakBehavior type.
 *  2026-07-03 藤井 layout spec §1 転用②: break什器をラウンジへ集約 (たまり場強化)。
 *  coffee=(21,16) 移設後エスプレッソ(21,15)前 / sofa=ラウンジソファ(22,20)前 /
 *  arcade=ダーツボード(20,14)前 / bookshelf=ウィスキー棚(14,14)前 /
 *  meeting=検証室の応接テーブル脇 (応接兼用のため現状維持)。 */
const LEGACY_BREAK_TARGETS: Record<string, { col: number; row: number }> = {
  coffee: { col: 21, row: 16 },
  sofa: { col: 22, row: 19 },
  arcade: { col: 20, row: 15 },
  bookshelf: { col: 14, row: 15 },
  meeting: { col: 3, row: 3 },
};
let breakTargets = LEGACY_BREAK_TARGETS;

/**
 * Desk positions — must match CUSHIONED_BENCH uid+col+row in default-layout-3.json
 * and the extension-side desk-registry.ts.
 * Nameplate text is derived from jc-config.json at runtime via jcGetNameplates().
 */
const LEGACY_DESK_POSITIONS: Record<string, { col: number; row: number; facingDir: number }> = {
  // ── Executive — Exec Zone (cols 8-16, rows 2-5) ──
  'exec-desk-sec': { col: 8, row: 4, facingDir: 3 }, // Secretary
  'exec-desk-pm': { col: 12, row: 4, facingDir: 3 }, // PM Yamamoto

  // ── Marketing — Marketing Zone (cols 1-12, rows 6-13) ──
  'mkt-desk-01': { col: 2, row: 8, facingDir: 3 }, // Ryo.K (Dir)
  'mkt-desk-04': { col: 8, row: 8, facingDir: 3 }, // Sasha
  'mkt-desk-07': { col: 4, row: 12, facingDir: 3 }, // Mei
  'mkt-desk-09': { col: 8, row: 12, facingDir: 3 }, // Hana
  'mkt-desk-10': { col: 10, row: 12, facingDir: 3 }, // Daichi
  'mkt-desk-11': { col: 2, row: 10, facingDir: 1 }, // Lena
  'mkt-desk-12': { col: 11, row: 10, facingDir: 2 }, // Langley Aoi

  // ── Research — Research Zone (cols 13-24, rows 6-13) ──
  'res-desk-01': { col: 14, row: 9, facingDir: 3 }, // Haruki (Dir)
  'res-desk-02': { col: 16, row: 9, facingDir: 3 }, // Sora
  'res-desk-03': { col: 18, row: 9, facingDir: 3 }, // Marina
  'res-desk-04': { col: 20, row: 9, facingDir: 3 }, // Kai
  'res-desk-05': { col: 14, row: 12, facingDir: 3 }, // Priya
  'res-desk-06': { col: 16, row: 12, facingDir: 3 }, // Yuto
  'res-desk-07': { col: 18, row: 12, facingDir: 3 }, // Marcus
  'res-desk-08': { col: 20, row: 12, facingDir: 3 }, // Ayane
  'res-desk-09': { col: 22, row: 12, facingDir: 3 }, // Ren Fujisawa

  // ── Engineering — Dev Zone (cols 1-12, rows 15-21) ──
  'dev-desk-01': { col: 3, row: 17, facingDir: 3 }, // Kenta (TL)
  'dev-desk-02': { col: 5, row: 17, facingDir: 3 }, // Ryo.S
  'dev-desk-03': { col: 7, row: 17, facingDir: 3 }, // Hina
  'dev-desk-05': { col: 3, row: 20, facingDir: 3 }, // Ren Fujii
  'dev-desk-06': { col: 5, row: 20, facingDir: 3 }, // Shota
  'dev-desk-07': { col: 7, row: 20, facingDir: 3 }, // Codex (implementation bot seat)
};

/** Phase 1 compact office. IDs deliberately stay stable so member history and saved assignments survive. */
const COMPACT_DESK_POSITIONS: Record<string, { col: number; row: number; facingDir: number }> = {
  'exec-desk-sec': { col: 8, row: 12, facingDir: 3 },
  'exec-desk-pm': { col: 4, row: 2, facingDir: 0 },
  'dev-desk-01': { col: 2, row: 2, facingDir: 0 },
  'dev-desk-07': { col: 2, row: 7, facingDir: 3 },
  'mkt-desk-01': { col: 8, row: 2, facingDir: 0 },
  'mkt-desk-02': { col: 10, row: 2, facingDir: 0 },
  'mkt-desk-03': { col: 12, row: 2, facingDir: 0 },
  'mkt-desk-04': { col: 8, row: 7, facingDir: 3 },
  'mkt-desk-12': { col: 10, row: 7, facingDir: 3 },
  'mkt-desk-05': { col: 12, row: 7, facingDir: 3 },
  'res-desk-01': { col: 16, row: 2, facingDir: 0 },
  'res-desk-02': { col: 18, row: 2, facingDir: 0 },
  'res-desk-07': { col: 16, row: 7, facingDir: 3 },
  'res-desk-09': { col: 18, row: 7, facingDir: 3 },
};

/** In Phase 1 there is no lounge: breaks use an ordinary open floor tile. */
const COMPACT_IDLE_TILE = { col: 14, row: 9 };
let compactIdleTile: { col: number; row: number } | null = null;

/** Legacy API name; Phase 1 uses these as neutral open-floor gathering tiles. */
const COMPACT_POKER_TABLE_SEATS = [
  { col: 13, row: 9 },
  { col: 14, row: 9 },
  { col: 13, row: 10 },
  { col: 14, row: 10 },
];

let DESK_POSITIONS = LEGACY_DESK_POSITIONS;
let usesCompactSeatAliases = false;
let ownerDeskAnchor: { col: number; row: number; seatId?: string } = { col: 8, row: 4 };
let currentLayoutFurniture: Array<{ uid: string; type: string; col: number; row: number }> = [];

/**
 * Select position metadata that matches the loaded layout. Old saved layouts keep
 * their original coordinates; the compact bundle is identified by layout revision 4.
 */
export function jcSyncDeskLayout(
  layout: {
    layoutRevision?: number;
    furniture?: Array<{ uid: string; type: string; col: number; row: number }>;
  } | null,
): void {
  const compact = layout?.layoutRevision === 4;
  currentLayoutFurniture = layout?.furniture ?? [];
  usesCompactSeatAliases = compact;
  DESK_POSITIONS = { ...(compact ? COMPACT_DESK_POSITIONS : LEGACY_DESK_POSITIONS) };
  if (compact) {
    for (const [deskId, chair] of Object.entries(
      resolveCompactDeskSeatPositions(layout?.furniture),
    )) {
      const fallback = DESK_POSITIONS[deskId];
      if (fallback) {
        DESK_POSITIONS[deskId] = { ...fallback, col: chair.col, row: chair.row };
      }
    }
  }
  breakTargets = LEGACY_BREAK_TARGETS;
  compactIdleTile = compact ? COMPACT_IDLE_TILE : null;
  const secretaryChair = layout?.furniture?.find((item) => item.uid === 'exec-bench-01');
  const ownerChair = layout?.furniture?.find((item) => item.uid === 'owner-chair');
  if (compact) {
    JC_ENTRANCE.col = 14;
    JC_ENTRANCE.row = 9;
    ownerDeskAnchor = ownerChair
      ? { col: ownerChair.col, row: ownerChair.row, seatId: 'owner-chair' }
      : { col: JC_ENTRANCE.col, row: JC_ENTRANCE.row };
    OFFICE_SECRETARY_SEAT.col = secretaryChair?.col ?? 8;
    OFFICE_SECRETARY_SEAT.row = secretaryChair?.row ?? 12;
    PET_TILE.col = secretaryChair ? secretaryChair.col + 2 : JC_ENTRANCE.col;
    PET_TILE.row = secretaryChair ? secretaryChair.row : JC_ENTRANCE.row;
  } else {
    ownerDeskAnchor = { col: 8, row: 4 };
    OFFICE_SECRETARY_SEAT.col = 8;
    OFFICE_SECRETARY_SEAT.row = 4;
    PET_TILE.col = 10;
    PET_TILE.row = 4;
    JC_ENTRANCE.col = 12;
    JC_ENTRANCE.row = 6;
  }
  POKER_TABLE_SEATS.splice(
    0,
    POKER_TABLE_SEATS.length,
    ...(compact
      ? COMPACT_POKER_TABLE_SEATS
      : [
          { col: 16, row: 17 },
          { col: 18, row: 17 },
          { col: 17, row: 16 },
          { col: 17, row: 18 },
        ]),
  );
}

/** Owner and secretary only receive adjacent desks in the compact Phase 1 layout. */
export function jcGetOwnerDeskAnchor(): { col: number; row: number; seatId?: string } {
  return ownerDeskAnchor;
}

export function jcIsCompactLayout(): boolean {
  return usesCompactSeatAliases;
}

/** Exec positions — icon-only (no character), shown in Exec Area */
const EXEC_POSITIONS: Array<{ id: string; col: number; row: number; label: string }> = [];

/** Initialize from config message */
export function jcLoadConfig(config: JCConfigData): void {
  jcConfig = config;
  for (const member of config.members) {
    // 再接続 (server 再起動 → ws auto-reconnect) で jcConfigLoaded が再送される。
    // 既存 runtime を作り直すと presence がリセットされ、直後の arrival replay が
    // 「出社しました」を再ログしてしまう (P2-1 出社spam の一因)。既存メンバーは
    // config だけ差し替え、live state (isPresent/jcState/稼働統計) は保持する。
    const prev = memberRuntimes.get(member.id);
    if (prev) {
      prev.config = member;
      continue;
    }
    memberRuntimes.set(member.id, {
      memberId: member.id,
      config: member,
      jcState: 'absent',
      isPresent: false,
      bubbleType: null,
      idleSince: null,
      emotionEmoji: null,
      emotionUntil: 0,
      workingSince: null,
      stateSince: Date.now(),
      workingTotal: 0,
      stateLog: [],
    });
  }
  console.log(`[JC-WV] Config loaded: ${config.members.length} members`);
  scheduleMemberNotify();
}

/** Check if JC mode is active */
export function jcIsActive(): boolean {
  return jcConfig !== null;
}

/** Handle member arriving */
export function jcMemberArriving(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.jcState = 'arriving';
    runtime.isPresent = true;
    console.log(`[JC-WV] Member arriving: ${memberId}`);
    scheduleMemberNotify();
  }
}

/** Handle member leaving */
export function jcMemberLeaving(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.jcState = 'leaving';
    console.log(`[JC-WV] Member leaving: ${memberId}`);
    scheduleMemberNotify();
  }
}

/** Handle member departed (left office) */
export function jcMemberDeparted(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    // Flush any in-progress working session before clearing
    if (runtime.workingSince !== null) {
      runtime.workingTotal += Date.now() - runtime.workingSince;
    }
    // Close out current entry; open 'absent' entry to mark the transition
    appendStateLog(runtime, 'absent', Date.now());

    runtime.jcState = 'absent';
    runtime.isPresent = false;
    runtime.bubbleType = null;
    runtime.idleSince = null;
    runtime.emotionEmoji = null;
    runtime.emotionUntil = 0;
    runtime.workingSince = null;
    runtime.stateSince = Date.now();
    scheduleMemberNotify();
  }
}

/** Handle state change */
export function jcMemberStateChange(
  memberId: string,
  newState: JCState,
  stateSince?: number,
): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    const prevState = runtime.jcState;
    if (prevState !== newState) {
      runtime.stateSince = stateSince ?? Date.now();
    }
    runtime.jcState = newState;
    runtime.bubbleType = stateToBubble(newState, runtime.config.breakBehavior);

    // Track idle entry time for per-member idle emoji trigger
    if (newState === 'idle') {
      if (!runtime.idleSince) runtime.idleSince = Date.now();
    } else {
      runtime.idleSince = null;
    }

    // Track coding/reading start time for focus mode (🔥 after 3 min)
    if (newState === 'coding' || newState === 'reading') {
      if (!runtime.workingSince) runtime.workingSince = Date.now();
    } else {
      if (runtime.workingSince !== null) {
        runtime.workingTotal += Date.now() - runtime.workingSince;
      }
      runtime.workingSince = null;
    }

    // Update stateLog: close previous entry, open new one for newState
    const now = Date.now();
    appendStateLog(runtime, newState, now);

    // Emotion triggers
    if (newState === 'error' && prevState !== 'error') {
      runtime.emotionEmoji = '😤';
      runtime.emotionUntil = Date.now() + 2000;
    }
    scheduleMemberNotify();
  }
}

/** Trigger a task_completed emotion emoji on a member */
export function jcTriggerTaskCompleted(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '🎉';
    runtime.emotionUntil = Date.now() + 2000;
    scheduleMemberNotify();
  }
}

/** Trigger a cross-department wave 👋 on a member */
export function jcTriggerWave(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '👋';
    runtime.emotionUntil = Date.now() + 2000;
    scheduleMemberNotify();
  }
}

/** Trigger a sub-agent thinking 🧠 on a parent member */
export function jcTriggerSubagentThinking(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '🧠';
    runtime.emotionUntil = Date.now() + 3000;
    scheduleMemberNotify();
  }
}

/** Update agent-member mappings */
export function jcUpdateMappings(mappings: Record<number, string>): void {
  agentToMember.clear();
  for (const [agentId, memberId] of Object.entries(mappings)) {
    agentToMember.set(Number(agentId), memberId);
  }
  scheduleMemberNotify();
}

/** Get member ID for an agent ID */
export function jcGetMemberForAgent(agentId: number): string | undefined {
  return agentToMember.get(agentId);
}

/** Get full member runtime info for an agent ID (agent → member → runtime) */
export function jcGetMemberInfo(agentId: number): JCMemberRuntime | null {
  const memberId = agentToMember.get(agentId);
  if (!memberId) return null;
  return memberRuntimes.get(memberId) ?? null;
}

/** Get desk position by desk ID */
export function jcGetDeskPosition(deskId: string): { col: number; row: number } | undefined {
  const pos = DESK_POSITIONS[deskId];
  return pos ? { col: pos.col, row: pos.row } : undefined;
}

/** Stable chair UID for a member desk, including when the chair moves in the editor. */
export function jcGetDeskSeatUid(deskId: string): string | undefined {
  return usesCompactSeatAliases ? COMPACT_DESK_SEAT_UIDS[deskId] : undefined;
}

/** Get all nameplates for rendering (names derived from config) */
export function jcGetNameplates(): NameplateInfo[] {
  const nameplates: NameplateInfo[] = [];
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    let isPresent = false;
    let text = deskId; // fallback when config not loaded
    if (jcConfig) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (member) {
        text = member.vacant ? '空席' : (member.nameEn ?? member.name);
        const runtime = memberRuntimes.get(member.id);
        isPresent = runtime?.isPresent ?? false;
      }
    }
    nameplates.push({
      text,
      col: pos.col,
      row: pos.row,
      isPresent,
      vacant: jcConfig?.members.find((member) => member.deskId === deskId)?.vacant ?? false,
      zone: deskIdToZone(deskId),
    });
  }
  return nameplates;
}

/** Get exec positions for rendering */
export function jcGetExecPositions(): typeof EXEC_POSITIONS {
  return EXEC_POSITIONS;
}

/** Get present member IDs */
export function jcGetPresentMemberIds(): Set<string> {
  const present = new Set<string>();
  for (const [, runtime] of memberRuntimes) {
    if (runtime.isPresent) {
      present.add(runtime.memberId);
    }
  }
  return present;
}

/** Get member count stats */
export function jcGetStats(): { present: number; total: number } {
  let present = 0;
  const total = memberRuntimes.size;
  for (const runtime of memberRuntimes.values()) {
    if (runtime.isPresent) present++;
  }
  return { present, total };
}

/** Get per-department member count stats.
 *  working: 在席かつ NON_WORKING_STATES 以外 (2026-07-03 藤井 §2(b) 稼働チップ分子)。 */
export function jcGetDeptStats(): Record<
  string,
  { present: number; total: number; working: number }
> {
  const deptStats: Record<string, { present: number; total: number; working: number }> = {};
  for (const runtime of memberRuntimes.values()) {
    const dept = runtime.config.department;
    if (!deptStats[dept]) {
      deptStats[dept] = { present: 0, total: 0, working: 0 };
    }
    deptStats[dept].total++;
    if (runtime.isPresent) {
      deptStats[dept].present++;
      if (!NON_WORKING_STATES.has(runtime.jcState)) {
        deptStats[dept].working++;
      }
    }
  }
  return deptStats;
}

/**
 * A department board is a real WHITEBOARD in the current layout. This keeps the
 * click target correct after editing and leaves compact Phase 1 free of phantom boards.
 */
export function jcGetDeptBoardAtTile(col: number, row: number): string | null {
  for (const board of currentLayoutFurniture) {
    if (
      board.type !== 'WHITEBOARD' ||
      col < board.col ||
      col > board.col + 1 ||
      row < board.row ||
      row > board.row + 1
    ) {
      continue;
    }
    if (board.uid.startsWith('mkt-')) return 'marketing';
    if (board.uid.startsWith('res-')) return 'research';
    if (board.uid.startsWith('eng-') || board.uid.startsWith('dev-')) return 'engineering';
  }
  return null;
}

/** Get member runtime by ID */
export function jcGetMemberRuntime(memberId: string): JCMemberRuntime | undefined {
  return memberRuntimes.get(memberId);
}

/** Active department liaison effects */
const activeLiaisons: Array<{
  fromZone: string;
  toZone: string;
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  startTime: number;
  duration: number;
  color?: string;
}> = [];

/** Trigger a department liaison visual effect */
export function jcTriggerLiaison(
  fromMemberId: string,
  toMemberId: string,
  duration: number = 3000,
  color?: string,
): void {
  const fromDesk = DESK_POSITIONS[getMemberDeskId(fromMemberId)];
  const toDesk = DESK_POSITIONS[getMemberDeskId(toMemberId)];
  if (!fromDesk || !toDesk) return;

  activeLiaisons.push({
    fromZone: getMemberZone(fromMemberId),
    toZone: getMemberZone(toMemberId),
    fromCol: fromDesk.col,
    fromRow: fromDesk.row,
    toCol: toDesk.col,
    toRow: toDesk.row,
    startTime: Date.now(),
    duration,
    color,
  });
}

/** Get active liaisons (pruning expired ones) */
export function jcGetActiveLiaisons(): typeof activeLiaisons {
  const now = Date.now();
  // Prune expired
  for (let i = activeLiaisons.length - 1; i >= 0; i--) {
    if (now - activeLiaisons[i].startTime > activeLiaisons[i].duration) {
      activeLiaisons.splice(i, 1);
    }
  }
  return activeLiaisons;
}

// ── R5 ✉️メール飛翔エフェクト (依頼発行=委任の実イベント駆動) ─────────
// jcMailFly メッセージ (event-watcher handleDelegate / browserMock delegate) から
// のみ発火する — ダミー発火なし。位置解決は描画側 (jc-overlay) が毎フレーム行う。
const activeMailFlights: Array<{
  fromMemberId: string;
  toMemberId: string;
  startTime: number;
  duration: number;
}> = [];

/** 依頼発行 (delegate) の封筒フライトを発火する */
export function jcTriggerMailFlight(
  fromMemberId: string,
  toMemberId: string,
  duration: number,
): void {
  if (!fromMemberId || !toMemberId) return;
  activeMailFlights.push({ fromMemberId, toMemberId, startTime: Date.now(), duration });
}

/** 進行中の封筒フライト (期限切れは prune) */
export function jcGetActiveMailFlights(): typeof activeMailFlights {
  const now = Date.now();
  for (let i = activeMailFlights.length - 1; i >= 0; i--) {
    if (now - activeMailFlights[i].startTime > activeMailFlights[i].duration) {
      activeMailFlights.splice(i, 1);
    }
  }
  return activeMailFlights;
}

// ── R4 本棚 = 完了アーカイブ (保存ボックス) ──────────────────────
// 本棚クリック → 完了しごとの履歴ブラウザ。footprint は default-layout-3.json の
// 本棚3点と同期必須 (skill: pixel-office-spatial-registry-map の3点同期の罠):
//   eng-bookshelf-01 BOOKSHELF (10,14) 2x1 / eng-dblbook-01 DOUBLE_BOOKSHELF (1,13) 2x2 /
//   poker-shelf-01 WHISKEY_SHELF (14,14) 1x1
const BOOKSHELF_TILES: Array<{ col: number; row: number; w: number; h: number }> = [
  { col: 10, row: 14, w: 2, h: 1 },
  { col: 1, row: 13, w: 2, h: 2 },
  { col: 14, row: 14, w: 1, h: 1 },
];

/** タイルが本棚 (完了アーカイブ) 上か (exact footprint match) */
export function jcIsBookshelfAtTile(col: number, row: number): boolean {
  for (const b of BOOKSHELF_TILES) {
    if (col >= b.col && col < b.col + b.w && row >= b.row && row < b.row + b.h) {
      return true;
    }
  }
  return false;
}

function getMemberDeskId(memberId: string): string {
  if (!jcConfig) return '';
  const member = jcConfig.members.find((m) => m.id === memberId);
  return member?.deskId ?? '';
}

function getMemberZone(memberId: string): string {
  if (!jcConfig) return '';
  const member = jcConfig.members.find((m) => m.id === memberId);
  return member?.zone ?? '';
}

/** Get break zone target position for a member based on their breakBehavior */
export function jcGetBreakTarget(memberId: string): { col: number; row: number } {
  if (compactIdleTile) return compactIdleTile;
  const runtime = memberRuntimes.get(memberId);
  const behavior = runtime?.config?.breakBehavior ?? 'coffee';
  return breakTargets[behavior] ?? breakTargets['coffee'];
}

/** Get the next available poker table seat */
export function jcGetPokerSeat(index: number): { col: number; row: number } {
  return POKER_TABLE_SEATS[index % POKER_TABLE_SEATS.length];
}

// ── Activity summary state ────────────────────────────────────

const memberActivitySummaries = new Map<string, string>();

/** Handle activity summary update from extension */
export function jcActivitySummaryUpdate(memberId: string, summary: string | null): void {
  if (summary) {
    memberActivitySummaries.set(memberId, summary);
  } else {
    memberActivitySummaries.delete(memberId);
  }
  scheduleMemberNotify();
}

/** Get activity summary for a member */
export function jcGetActivitySummary(memberId: string): string | null {
  return memberActivitySummaries.get(memberId) ?? null;
}

/**
 * Get structured activity metrics for a member (BI aggregation).
 * Does not mutate runtime state — computes stateBreakdown from the stateLog snapshot.
 * Returns null if the member is not found.
 */
export function jcGetActivityMetrics(memberId: string): {
  workingTotal: number;
  workingSince: number | null;
  stateBreakdown: Record<JCState, number>;
  lastTransitionAt: number | null;
} | null {
  const runtime = memberRuntimes.get(memberId);
  if (!runtime) return null;

  const stateBreakdown = {} as Record<JCState, number>;
  for (const entry of runtime.stateLog) {
    const duration = (entry.exitedAt ?? Date.now()) - entry.enteredAt;
    stateBreakdown[entry.state] = (stateBreakdown[entry.state] ?? 0) + duration;
  }

  const lastEntry = runtime.stateLog[runtime.stateLog.length - 1] ?? null;
  const lastTransitionAt = lastEntry ? lastEntry.enteredAt : null;

  return {
    workingTotal: runtime.workingTotal,
    workingSince: runtime.workingSince,
    stateBreakdown,
    lastTransitionAt,
  };
}

// ── Task state management ─────────────────────────────────────

const memberTasks = new Map<string, TaskDefinition[]>();

/** Handle individual task update */
export function jcTaskUpdate(task: TaskDefinition): void {
  const existing = memberTasks.get(task.assignee) ?? [];
  const idx = existing.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    existing[idx] = task;
  } else {
    existing.push(task);
  }
  memberTasks.set(task.assignee, existing);
  scheduleTaskNotify();
}

/** Handle bulk task sync */
export function jcTasksBulkSync(tasks: TaskDefinition[]): void {
  memberTasks.clear();
  for (const task of tasks) {
    const existing = memberTasks.get(task.assignee) ?? [];
    existing.push(task);
    memberTasks.set(task.assignee, existing);
  }
  scheduleTaskNotify();
}

/** Get current task status for a member (most relevant active task) */
export function jcGetMemberTaskStatus(memberId: string): TaskDefinition | null {
  const tasks = memberTasks.get(memberId);
  if (!tasks || tasks.length === 0) return null;
  // Prefer running > pending > done/error
  const running = tasks.find((t) => t.status === 'running');
  if (running) return running;
  const pending = tasks.find((t) => t.status === 'pending');
  if (pending) return pending;
  // Show most recent done/error briefly
  const recent = tasks
    .filter((t) => t.status === 'done' || t.status === 'error')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  if (recent.length > 0) {
    const completed = recent[0];
    // Only show if completed within last 30 seconds
    if (completed.completedAt) {
      const elapsed = Date.now() - new Date(completed.completedAt).getTime();
      if (elapsed < 30000) return completed;
    }
  }
  return null;
}

/** Get all member tasks for a given desk (by finding member for that desk) */
export function jcGetDeskTaskStatus(col: number, row: number): TaskDefinition | null {
  if (!jcConfig) return null;
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    if (Math.abs(pos.col - col) <= 1 && Math.abs(pos.row - row) <= 1) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (member) return jcGetMemberTaskStatus(member.id);
    }
  }
  return null;
}

/** Get member info at a desk position (for context menu) */
export function jcGetMemberAtDesk(
  col: number,
  row: number,
): { memberId: string; name: string; deskId: string } | null {
  if (!jcConfig) return null;
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    if (Math.abs(pos.col - col) <= 1 && Math.abs(pos.row - row) <= 1) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (member) return { memberId: member.id, name: member.name, deskId };
    }
  }
  return null;
}

/** Get all tasks across all members */
export function jcGetAllTasks(): TaskDefinition[] {
  const all: TaskDefinition[] = [];
  for (const tasks of memberTasks.values()) {
    all.push(...tasks);
  }
  return all;
}

/** Get map of memberId → member name from config */
export function jcGetMemberNames(): Map<string, string> {
  const names = new Map<string, string>();
  if (!jcConfig) return names;
  for (const member of jcConfig.members) {
    names.set(member.id, member.name);
  }
  return names;
}

/** All member configs (id/name/department/deskId/…). Empty until config loads. */
export function jcGetAllMembers(): ReadonlyArray<import('./jc-types.js').JCMemberConfig> {
  return jcConfig ? jcConfig.members.filter((member) => !member.vacant) : [];
}

// ── Dashboard helpers ─────────────────────────────────────────

// State and department colors imported from jc-constants.ts

/** Get neon color for a JC state */
export function jcGetStateColor(state: JCState): string {
  return STATE_COLORS[state] ?? '#666688';
}

/** Get neon color for a department */
export function jcGetDeptColor(dept: string): string {
  return DEPT_COLORS[dept] ?? '#888888';
}

/** Dashboard member info for HUD rendering */
export interface DashboardMember {
  memberId: string;
  name: string;
  nameEn: string;
  role: string;
  department: string;
  zone: string;
  state: JCState;
  isPresent: boolean;
  stateColor: string;
  deptColor: string;
  deskCol: number;
  deskRow: number;
  activitySummary: string | null;
  /** Timestamp when member entered current state (for duration display) */
  stateSince: number;
  /** Current task summary from activity summarizer */
  currentTask: string | null;
  /** Parent member ID if this is a sub-agent */
  parentMemberId: string | null;
  /** Child member IDs (sub-agents spawned by this member) */
  childMemberIds: string[];
}

export interface SubagentCharacterRef {
  id: number;
  parentAgentId: number;
}

/** Get all members as dashboard entries for the Team HUD */
export function jcGetDashboardMembers(
  subagentCharacters: SubagentCharacterRef[] = [],
): DashboardMember[] {
  if (!jcConfig) return [];

  // Build parentMemberId map: memberId -> parentMemberId
  // subagentCharacter.id is the sub-agent's agentId; parentAgentId is the parent's agentId
  const parentMemberIdMap = new Map<string, string>();
  const childMemberIdsMap = new Map<string, string[]>();

  for (const sub of subagentCharacters) {
    const subMemberId = agentToMember.get(sub.id);
    const parentMemberId = agentToMember.get(sub.parentAgentId);
    if (subMemberId && parentMemberId) {
      parentMemberIdMap.set(subMemberId, parentMemberId);
      const children = childMemberIdsMap.get(parentMemberId) ?? [];
      if (!children.includes(subMemberId)) children.push(subMemberId);
      childMemberIdsMap.set(parentMemberId, children);
    }
  }

  const members: DashboardMember[] = [];
  for (const member of jcConfig.members) {
    if (member.vacant) continue;
    const pos = DESK_POSITIONS[member.deskId];
    if (!pos) continue;
    const runtime = memberRuntimes.get(member.id);
    const state = runtime?.jcState ?? 'absent';
    const activitySummary = memberActivitySummaries.get(member.id) ?? null;
    members.push({
      memberId: member.id,
      name: member.name,
      nameEn: member.nameEn ?? member.name,
      role: member.role,
      department: member.department,
      zone: member.zone,
      state,
      isPresent: runtime?.isPresent ?? false,
      stateColor: STATE_COLORS[state] ?? '#666688',
      deptColor: DEPT_COLORS[member.department] ?? '#888888',
      deskCol: pos.col,
      deskRow: pos.row,
      activitySummary,
      stateSince: runtime?.stateSince ?? Date.now(),
      currentTask: activitySummary,
      parentMemberId: parentMemberIdMap.get(member.id) ?? null,
      childMemberIds: childMemberIdsMap.get(member.id) ?? [],
    });
  }
  return members;
}

// ── Speech Bubble Queue ──────────────────────────────────────────

const speechBubbles: SpeechBubble[] = [];

/** 表示時間 (2026-07-03 藤井 spec §3): 4秒 + 10字ごと+1秒、上限8秒。
 *  長さはセリフの元の長さ (fullText 優先) で測る — 長い話ほど長く残す。 */
export function computeBubbleDuration(bubble: SpeechBubble): number {
  const len = (bubble.fullText ?? bubble.text).length;
  return Math.min(
    SPEECH_BUBBLE_BASE_MS + Math.floor(len / 10) * SPEECH_BUBBLE_PER_10_CHARS_MS,
    SPEECH_BUBBLE_MAX_MS,
  );
}

/** Add a speech bubble for a member */
export function jcAddSpeechBubble(bubble: SpeechBubble): void {
  // Remove existing bubble for this member (only one at a time)
  const idx = speechBubbles.findIndex((b) => b.memberId === bubble.memberId);
  if (idx >= 0) speechBubbles.splice(idx, 1);
  // sender 側の固定 duration (3000 等) は表示式で上書きする (藤井 spec §3)
  speechBubbles.push({ ...bubble, duration: computeBubbleDuration(bubble) });
  scheduleMemberNotify();
}

/** Get active speech bubbles (pruning expired ones; pinned member bubbles never expire) */
export function jcGetSpeechBubbles(): SpeechBubble[] {
  const now = Date.now();
  for (let i = speechBubbles.length - 1; i >= 0; i--) {
    const b = speechBubbles[i];
    if (isPinned(b.memberId)) continue; // pinned: never expire
    if (now - b.timestamp > b.duration) {
      speechBubbles.splice(i, 1);
    }
  }
  return speechBubbles;
}

// ── Permanent Resident Tracking ─────────────────────────────────

// PERMANENT_ROLES imported from jc-constants.ts

/** Check if a member is a permanent resident (never departs) */
export function jcIsPermanentResident(memberId: string): boolean {
  if (!jcConfig) return false;
  const member = jcConfig.members.find((m) => m.id === memberId);
  return member ? PERMANENT_ROLES.has(member.role) : false;
}

// ── Idle Timeout Tracking ───────────────────────────────────────

// IDLE_TIMEOUT_MS imported from jc-constants.ts
const memberLastActivity = new Map<string, number>();

/** Record activity for a member (resets idle timer) */
export function jcRecordActivity(memberId: string): void {
  memberLastActivity.set(memberId, Date.now());
}

/** Get member IDs that have been idle past the timeout (excludes permanent residents) */
export function jcGetIdleMembers(): string[] {
  const now = Date.now();
  const idle: string[] = [];
  for (const [memberId, lastActivity] of memberLastActivity) {
    if (now - lastActivity > IDLE_TIMEOUT_MS && !jcIsPermanentResident(memberId)) {
      const runtime = memberRuntimes.get(memberId);
      if (runtime?.isPresent && runtime.jcState !== 'leaving') {
        idle.push(memberId);
      }
    }
  }
  return idle;
}

// ── Subscribe API ─────────────────────────────────────────────────

const taskListeners = new Set<() => void>();
const memberListeners = new Set<() => void>();
let pendingTaskNotify = false;
let pendingMemberNotify = false;

/** scheduleTaskNotify: rAF batch — prevents over-notification during bulk sync. */
function scheduleTaskNotify(): void {
  if (pendingTaskNotify) return;
  pendingTaskNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingTaskNotify = false;
    for (const fn of taskListeners) {
      try {
        fn();
      } catch (e) {
        console.error('[jc-state] task listener error:', e);
      }
    }
  });
}

/** scheduleMemberNotify: rAF batch for member store. */
function scheduleMemberNotify(): void {
  if (pendingMemberNotify) return;
  pendingMemberNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingMemberNotify = false;
    for (const fn of memberListeners) {
      try {
        fn();
      } catch (e) {
        console.error('[jc-state] member listener error:', e);
      }
    }
  });
}

/** Subscribe to task store changes. Returns an unsubscribe function for useEffect cleanup. */
export function subscribeTasks(fn: () => void): () => void {
  taskListeners.add(fn);
  return () => {
    taskListeners.delete(fn);
  };
}

/** Subscribe to member store changes. Returns an unsubscribe function for useEffect cleanup. */
export function subscribeMembers(fn: () => void): () => void {
  memberListeners.add(fn);
  return () => {
    memberListeners.delete(fn);
  };
}

// ── Owner Avatar State ────────────────────────────────────────────

const DEFAULT_OWNER_AVATAR_STATE: OwnerAvatarState = {
  active: false,
  position: 'entrance',
  lastPosition: 'entrance',
  conversationTarget: null,
};

let ownerAvatarState: OwnerAvatarState = { ...DEFAULT_OWNER_AVATAR_STATE };
const ownerAvatarListeners = new Set<() => void>();
let pendingOwnerAvatarNotify = false;

function scheduleOwnerAvatarNotify(): void {
  if (pendingOwnerAvatarNotify) return;
  pendingOwnerAvatarNotify = true;
  const raf =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    pendingOwnerAvatarNotify = false;
    for (const fn of ownerAvatarListeners) {
      try {
        fn();
      } catch (e) {
        console.error('[jc-state] ownerAvatar listener error:', e);
      }
    }
  });
}

/** Get current owner avatar state (imperative read). */
export function jcGetOwnerAvatarState(): OwnerAvatarState {
  return ownerAvatarState;
}

/** Set owner avatar state (partial update). */
export function jcSetOwnerAvatarState(patch: Partial<OwnerAvatarState>): void {
  ownerAvatarState = { ...ownerAvatarState, ...patch };
  scheduleOwnerAvatarNotify();
}

/** Subscribe to owner avatar state changes. Returns an unsubscribe function. */
export function subscribeOwnerAvatar(fn: () => void): () => void {
  ownerAvatarListeners.add(fn);
  return () => {
    ownerAvatarListeners.delete(fn);
  };
}

// ── Helpers ────────────────────────────────────────────────────

const STATE_LOG_MAX = 100;

/**
 * Close the last open stateLog entry (set exitedAt) and push a new open entry
 * for the incoming state. Ring-buffer: shifts oldest entry when length > STATE_LOG_MAX.
 */
function appendStateLog(runtime: JCMemberRuntime, incomingState: JCState, now: number): void {
  // Close the last open entry
  const last = runtime.stateLog[runtime.stateLog.length - 1];
  if (last && last.exitedAt === null) {
    last.exitedAt = now;
  }
  // Push new open entry for the state being entered
  const entry: StateLogEntry = { state: incomingState, enteredAt: now, exitedAt: null };
  runtime.stateLog.push(entry);
  if (runtime.stateLog.length > STATE_LOG_MAX) {
    runtime.stateLog.shift();
  }
}

function stateToBubble(state: JCState, breakBehavior?: string): JCBubbleType {
  switch (state) {
    case 'coding':
      return 'coding';
    case 'thinking':
      return 'thinking';
    case 'reading':
      return 'reading';
    case 'reviewing':
      return 'reviewing';
    case 'error':
      return 'error';
    case 'presenting':
      return 'presenting';
    case 'meeting':
      return 'meeting';
    case 'handoff':
      return 'meeting';
    case 'break':
      // Use member's break behavior for visual variety
      if (breakBehavior === 'sofa') return 'sofa';
      if (breakBehavior === 'arcade') return 'arcade';
      if (breakBehavior === 'bookshelf') return 'bookshelf';
      if (breakBehavior === 'meeting') return 'meeting';
      return 'coffee';
    case 'idle':
      return 'idle';
    default:
      return null;
  }
}

function deskIdToZone(deskId: string): 'dev' | 'marketing' | 'research' | 'exec' {
  if (deskId.startsWith('dev-')) return 'dev';
  if (deskId.startsWith('mkt-')) return 'marketing';
  if (deskId.startsWith('exec-')) return 'exec';
  return 'research';
}
