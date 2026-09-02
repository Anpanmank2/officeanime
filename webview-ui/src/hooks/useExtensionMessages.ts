import { useEffect, useRef, useState } from 'react';

import type { AvatarPartAsset, CharacterDirectionSprites } from '../../../shared/assets/types.js';
import {
  gameClearMember,
  gameSetCompanyScore,
  gameSetFitBadge,
  gameSetStuck,
  gameStartGauge,
  gameStopGauge,
  type GameTier,
} from '../jc/game-state.js';
import type { AbsenceInfo, JCState, SpeechBubble, TaskDefinition } from '../jc/index.js';
import {
  JC_ENTRANCE,
  jcAbsenceBulkSync,
  jcAbsenceUpdate,
  jcActivitySummaryUpdate,
  jcAddSpeechBubble,
  jcGetBreakTarget,
  jcGetDeskPosition,
  jcGetMemberRuntime,
  jcGetPokerSeat,
  jcLoadConfig,
  jcMemberArriving,
  jcMemberDeparted,
  jcMemberLeaving,
  jcMemberStateChange,
  jcRecordActivity,
  jcTasksBulkSync,
  jcTaskUpdate,
  jcTriggerLiaison,
  jcTriggerMailFlight,
  jcTriggerSubagentThinking,
  jcTriggerTaskCompleted,
  jcTriggerWave,
  jcUpdateMappings,
} from '../jc/index.js';
import { IDLE_TINT_STATES, MAIL_FLIGHT_MS, NON_WORKING_STATES } from '../jc/jc-constants.js';
import { jcGetAllMembers } from '../jc/jc-state.js';
import {
  appendKarteEvent,
  bulkSetKarteEvents,
  computeMemberWorkloads,
  type KarteRawEvent,
} from '../jc/karte-state.js';
import { addLogEntry } from '../jc/office-log-state.js';
import { addPlan, type PlanOrigin } from '../jc/plan-state.js';
import { type ConfirmQuestion, setRequestQuestions } from '../jc/request-flow-state.js';
import { type RequestResultStatus, setRequestResult } from '../jc/request-result-state.js';
import { setResearchResult } from '../jc/research-result-state.js';
import { playDoneSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { parseAvatarConfigFile } from '../office/sprites/avatarTypes.js';
import {
  setAvatarConfigs,
  setAvatarParts,
  setCharacterTemplates,
} from '../office/sprites/spriteData.js';
import { extractToolName } from '../office/toolUtils.js';
import {
  CharacterState,
  type OfficeLayout,
  TILE_SIZE,
  type ToolActivity,
} from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { vscode } from '../vscodeApi.js';

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  agentTokenUsage: Record<number, TokenUsage>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  layoutWasReset: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
  externalAssetDirectories: string[];
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  setWatchAllSessions: (v: boolean) => void;
  alwaysShowLabels: boolean;
}

/**
 * member → character の解決 (§2(a) 彩度落ちフラグ同期用)。
 * jc-events 経由の jcMemberStateChange は agentId がランダム負数のため
 * characters.get(agentId) では引けない — 到着時に刻んだ ch.jcMemberId で逆引きする。
 * 同一 member の再到着で複数 hit し得るため最後 (最新) の char を返す。
 */
function findMemberCharacter(os: OfficeState, memberId: string) {
  let found: ReturnType<OfficeState['characters']['get']> = undefined;
  for (const ch of os.characters.values()) {
    if (!ch.isSubagent && ch.jcMemberId === memberId) found = ch;
  }
  return found;
}

/**
 * R1 稼働率の根治 (2026-07-03 Owner確定): 接続・再起動・reload 時に
 * jcEventHistory (イベント履歴) から全 member の状態を復元する。
 * 「稼働中 = 未完了のしごとを持つ間」(karte-state の正本定義) に該当する member を
 * 出社+働く姿に戻す — 「新イベントが来るまで 0/x」を根絶する。
 *
 * - agentId は roster index による安定負数 (-9000 - idx): 再実行 (config 再送・
 *   history 再 sync) しても同じ id に解決され、キャラが重複しない。
 * - 既存の jcMemberArriving / jcMemberStateChange 経路を synthetic MessageEvent で
 *   再利用する (layout 未ロード時の buffering・出社ログ dedupe を既存規約のまま通す)。
 * - すでに present / working 状態の member はそのまま (live 経路を上書きしない)。
 */
function reconcileWorkloadPresence(): void {
  const members = jcGetAllMembers();
  if (members.length === 0) return; // config 未ロード — jcConfigLoaded 後に再実行される
  const workloads = computeMemberWorkloads();
  const dispatch = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
  const restored: string[] = [];
  members.forEach((m, idx) => {
    const wl = workloads.get(m.id);
    const active = wl?.active.length ?? 0;
    if (active === 0) return;
    const stableAgentId = -9000 - idx;
    if (jcGetMemberRuntime(m.id)?.isPresent !== true) {
      dispatch({
        type: 'jcMemberArriving',
        agentId: stableAgentId,
        memberId: m.id,
        deskId: m.deskId,
        seatUid: m.deskId,
        hueShift: m.hueShift,
        palette: m.palette ?? 0,
      });
    }
    // 状態も同一定義から復元。live 経路で既に働いている member は上書きしない。
    const st = jcGetMemberRuntime(m.id)?.jcState;
    if (!st || NON_WORKING_STATES.has(st)) {
      const startedAt = wl!.active.reduce((min, w) => Math.min(min, w.startedAt), Date.now());
      dispatch({
        type: 'jcMemberStateChange',
        agentId: stableAgentId,
        memberId: m.id,
        jcState: 'coding',
        stateSince: startedAt,
      });
    }
    restored.push(`${m.id}(${active})`);
  });
  console.log(
    restored.length > 0
      ? `[JC-WV] Workload restore: ${restored.length} member(s) with open work — ${restored.join(', ')}`
      : '[JC-WV] Workload restore: no open work in history',
  );
}

/**
 * deskId → 実 seat uid の解決 (skill: seatuid-trap 罠1 の根治)。
 * layout の椅子 uid は 'mkt-bench-01' 形式で DESK_POSITIONS の deskId
 * ('mkt-desk-01') と一致しない — uid 直引きが外れたらデスク座標一致で引く。
 * これで jc-events 駆動の member が「自分の席」に座る (到着順の空席流れを防ぐ)。
 */
function resolveSeatUid(os: OfficeState, deskId: string): string | null {
  if (!deskId) return null;
  if (os.seats.has(deskId)) return deskId;
  const pos = jcGetDeskPosition(deskId);
  if (!pos) return null;
  for (const [uid, seat] of os.seats) {
    if (seat.seatCol === pos.col && seat.seatRow === pos.row) return uid;
  }
  return null;
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<
    number,
    { palette: number; hueShift: number; seatId: string | null; memberId?: string }
  > = {};
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue;
    seats[ch.id] = {
      palette: ch.palette,
      hueShift: ch.hueShift,
      seatId: ch.seatId,
      memberId: ch.jcMemberId,
    };
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats });
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [externalAssetDirectories, setExternalAssetDirectories] = useState<string[]>([]);
  const [lastSeenVersion, setLastSeenVersion] = useState('');
  const [extensionVersion, setExtensionVersion] = useState('');
  const [watchAllSessions, setWatchAllSessions] = useState(false);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(false);
  const [agentTokenUsage, setAgentTokenUsage] = useState<Record<number, TokenUsage>>({});

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: Array<{
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      folderName?: string;
      memberId?: string;
    }> = [];

    // Buffer JC member arrivals until layout is loaded (seats must exist first)
    let pendingJCArrivals: Array<{
      agentId: number;
      memberId: string;
      deskId: string;
      hueShift: number;
      palette?: number;
    }> = [];

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      const os = getOfficeState();

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes');
          return;
        }
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;
        if (layout) {
          os.rebuildFromLayout(layout);
          onLayoutLoaded?.(layout);
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout());
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName);
          const restored = os.characters.get(p.id);
          if (restored && p.memberId) restored.jcMemberId = p.memberId;
        }
        pendingAgents = [];
        // Process buffered JC member arrivals — place directly at desk
        for (const a of pendingJCArrivals) {
          // 出社ログは不在→在席の遷移時のみ (P2-1 dedupe, live 経路と同一規約)
          const bufWasPresent = jcGetMemberRuntime(a.memberId)?.isPresent === true;
          jcMemberArriving(a.memberId);
          if (!bufWasPresent) {
            const bufRt = jcGetMemberRuntime(a.memberId);
            addLogEntry({
              timestamp: Date.now(),
              memberId: a.memberId,
              memberName: bufRt?.config.name ?? a.memberId,
              department: bufRt?.config.department ?? 'exec',
              type: 'arrival',
              summary: `${bufRt?.config.name ?? a.memberId} が出社しました`,
            });
          }
          // deskId → 実 seat uid (bench形式) を解決 — 自分の席に座らせる
          const bufSeatUid = resolveSeatUid(os, a.deskId) ?? a.deskId;
          const existing = os.characters.get(a.agentId);
          if (existing) {
            existing.jcMemberId = a.memberId; // member→char 逆引き用 (§2(a))
            if (existing.seatId) {
              const oldSeat = os.seats.get(existing.seatId);
              if (oldSeat) oldSeat.assigned = false;
            }
            if (bufSeatUid && os.seats.has(bufSeatUid)) {
              const seat = os.seats.get(bufSeatUid)!;
              if (!seat.assigned) {
                seat.assigned = true;
                existing.seatId = bufSeatUid;
                existing.tileCol = seat.seatCol;
                existing.tileRow = seat.seatRow;
                existing.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
                existing.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
                existing.dir = seat.facingDir;
              }
            }
          } else {
            os.addAgent(a.agentId, a.palette, a.hueShift, bufSeatUid, true);
            const ch2 = os.characters.get(a.agentId);
            if (ch2) ch2.jcMemberId = a.memberId; // member→char 逆引き用 (§2(a))
            if (ch2 && ch2.seatId) {
              const s2 = os.seats.get(ch2.seatId);
              if (s2) {
                let sf = false;
                for (let d2 = 2; d2 <= 4 && !sf; d2++) {
                  for (let dr2 = -d2; dr2 <= d2 && !sf; dr2++) {
                    for (let dc2 = -d2; dc2 <= d2 && !sf; dc2++) {
                      if (Math.abs(dr2) + Math.abs(dc2) !== d2) continue;
                      const nc2 = s2.seatCol + dc2;
                      const nr2 = s2.seatRow + dr2;
                      if (nr2 < 0 || nr2 >= os.tileMap.length) continue;
                      if (nc2 < 0 || nc2 >= (os.tileMap[0]?.length ?? 0)) continue;
                      const t2 = os.tileMap[nr2]?.[nc2];
                      if (t2 === undefined || t2 === 0 || t2 === 255) continue;
                      if (os.blockedTiles.has(`${nc2},${nr2}`)) continue;
                      ch2.tileCol = nc2;
                      ch2.tileRow = nr2;
                      ch2.x = nc2 * TILE_SIZE + TILE_SIZE / 2;
                      ch2.y = nr2 * TILE_SIZE + TILE_SIZE / 2;
                      sf = true;
                    }
                  }
                }
                os.sendToSeat(a.agentId);
              }
            }
          }
        }
        pendingJCArrivals = [];
        layoutReadyRef.current = true;
        // R1: layout 前に届いた履歴で state だけ復元済みのケースの
        // キャラ着席/アニメ同期を取り直す (冪等 — 安定 agentId)。
        reconcileWorkloadPresence();
        setLayoutReady(true);
        if (msg.wasReset) {
          setLayoutWasReset(true);
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os);
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const folderName = msg.folderName as string | undefined;
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setSelectedAgent(id);
        os.addAgent(id, undefined, undefined, undefined, undefined, folderName);
        saveAgentSeats(os);
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number;
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentTokenUsage((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.removeAgent(id);
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[];
        const meta = (msg.agentMeta || {}) as Record<
          number,
          { palette?: number; hueShift?: number; seatId?: string; memberId?: string }
        >;
        const folderNames = (msg.folderNames || {}) as Record<number, string>;
        // Buffer only until the first layout. Browser replay and reconnects may
        // legitimately deliver existingAgents after layoutLoaded.
        for (const id of incoming) {
          const m = meta[id];
          const persisted = {
            id,
            palette: m?.palette,
            hueShift: m?.hueShift,
            seatId: m?.seatId,
            folderName: folderNames[id],
            memberId: m?.memberId,
          };
          if (layoutReadyRef.current) {
            os.addAgent(
              persisted.id,
              persisted.palette,
              persisted.hueShift,
              persisted.seatId,
              true,
              persisted.folderName,
            );
            const restored = os.characters.get(persisted.id);
            if (restored && persisted.memberId) restored.jcMemberId = persisted.memberId;
          } else {
            pendingAgents = pendingAgents.filter((agent) => agent.id !== id);
            pendingAgents.push(persisted);
          }
        }
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        setAgentTools((prev) => {
          const list = prev[id] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return { ...prev, [id]: [...list, { toolId, status, done: false }] };
        });
        const toolName = extractToolName(status);
        os.setAgentTool(id, toolName);
        os.setAgentActive(id, true);
        os.clearPermissionBubble(id);
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim();
          const subId = os.addSubagent(id, toolId);
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev;
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
          });
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          };
        });
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os.setAgentTool(id, null);
        os.clearPermissionBubble(id);
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number;
        setSelectedAgent(id);
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = msg.status as string;
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        os.setAgentActive(id, status === 'active');
        if (status === 'waiting') {
          os.showWaitingBubble(id);
          playDoneSound();
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        os.showPermissionBubble(id);
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          os.showPermissionBubble(subId);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        os.clearPermissionBubble(id);
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId);
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
          };
        });
        // Update sub-agent character's tool and active state
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          const subToolName = extractToolName(status);
          os.setAgentTool(subId, subToolName);
          os.setAgentActive(subId, true);
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId);
        setSubagentCharacters((prev) =>
          prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)),
        );
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        console.log(`[Webview] Received ${characters.length} pre-colored character sprites`);
        setCharacterTemplates(characters);
      } else if (msg.type === 'avatarPartsLoaded') {
        const catalog = msg.catalog as AvatarPartAsset[];
        const sprites = msg.sprites as Record<string, CharacterDirectionSprites>;
        console.log(`[Webview] Received ${catalog.length} avatar parts`);
        setAvatarParts(catalog, sprites);
      } else if (msg.type === 'avatarsLoaded') {
        const config = parseAvatarConfigFile(msg.avatars);
        if (config) {
          console.log(`[Webview] Received ${Object.keys(config.avatars).length} avatar configs`);
          setAvatarConfigs(config);
        } else {
          console.warn('[Webview] Ignoring malformed avatar config payload');
        }
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        console.log(`[Webview] Received ${sprites.length} floor tile patterns`);
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sets = msg.sets as string[][][][];
        console.log(`[Webview] Received ${sets.length} wall tile set(s)`);
        setWallSprites(sets);
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[];
        setWorkspaceFolders(folders);
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean;
        setSoundEnabled(soundOn);
        if (typeof msg.watchAllSessions === 'boolean') {
          setWatchAllSessions(msg.watchAllSessions as boolean);
        }
        if (typeof msg.alwaysShowLabels === 'boolean') {
          setAlwaysShowLabels(msg.alwaysShowLabels as boolean);
        }
        if (Array.isArray(msg.externalAssetDirectories)) {
          setExternalAssetDirectories(msg.externalAssetDirectories as string[]);
        }
        if (typeof msg.lastSeenVersion === 'string') {
          setLastSeenVersion(msg.lastSeenVersion as string);
        }
        if (typeof msg.extensionVersion === 'string') {
          setExtensionVersion(msg.extensionVersion as string);
        }
      } else if (msg.type === 'externalAssetDirectoriesUpdated') {
        if (Array.isArray(msg.dirs)) {
          setExternalAssetDirectories(msg.dirs as string[]);
        }
      } else if (msg.type === 'tokenUsageUpdate') {
        const id = msg.id as number;
        const inputTokens = msg.inputTokens as number;
        const outputTokens = msg.outputTokens as number;
        setAgentTokenUsage((prev) => ({
          ...prev,
          [id]: { inputTokens, outputTokens },
        }));
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`);
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err);
        }
      }
      // ── JC Messages ──────────────────────────────────────────
      else if (msg.type === 'jcConfigLoaded') {
        jcLoadConfig(msg.config);
        // R1: 拡張経路等で config が履歴より後に届くケースの取りこぼし防止
        // (roster が無いと復元できない)。冪等 — 安定 agentId + 遷移 dedupe。
        reconcileWorkloadPresence();
      } else if (msg.type === 'jcMemberArriving') {
        const agentId = msg.agentId as number;
        const memberId = msg.memberId as string;
        const deskId = msg.deskId as string;
        const hueShift = (msg.hueShift as number) ?? 0;
        const palette = msg.palette as number | undefined;

        // Buffer if layout not ready yet (seats don't exist)
        if (!layoutReadyRef.current) {
          pendingJCArrivals.push({ agentId, memberId, deskId, hueShift, palette });
          return;
        }

        // deskId → 実 seat uid (bench形式) を解決 — member を自分の席に座らせる
        const seatUid = resolveSeatUid(os, deskId) ?? deskId;

        // 出社spam根治 (2026-07-03 P2-1): jcMemberArriving は「presence を保証する」
        // 冪等メッセージとして client-init / jc-events replay (再起動で lastProcessedIndex
        // がリセット) / 再接続から同一メンバー宛に重複して届く。ログは不在→在席の
        // 遷移時のみ記録する。jcMemberArriving() 自体は state 更新(+ e2e が assert する
        // console.log)のため常に呼ぶ。
        const arrWasPresent = jcGetMemberRuntime(memberId)?.isPresent === true;
        jcMemberArriving(memberId);
        if (!arrWasPresent) {
          // Log arrival (absent → present transition only)
          const arrRt = jcGetMemberRuntime(memberId);
          addLogEntry({
            timestamp: Date.now(),
            memberId,
            memberName: arrRt?.config.name ?? memberId,
            department: arrRt?.config.department ?? 'exec',
            type: 'arrival',
            summary: `${arrRt?.config.name ?? memberId} が出社しました`,
          });
        }

        // If character already exists (from agentCreated), reassign to correct seat
        const existing = os.characters.get(agentId);
        if (existing) {
          existing.jcMemberId = memberId; // member→char 逆引き用 (§2(a))
          // Free old seat
          if (existing.seatId) {
            const oldSeat = os.seats.get(existing.seatId);
            if (oldSeat) oldSeat.assigned = false;
          }
          // Assign preferred seat
          if (seatUid && os.seats.has(seatUid)) {
            const seat = os.seats.get(seatUid)!;
            if (!seat.assigned) {
              seat.assigned = true;
              existing.seatId = seatUid;
              // Snap to seat position
              existing.tileCol = seat.seatCol;
              existing.tileRow = seat.seatRow;
              existing.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
              existing.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
              existing.dir = seat.facingDir;
            }
          }
        } else {
          // Create character at preferred seat, then walk from nearby tile
          os.addAgent(agentId, palette, hueShift, seatUid, true);
          const ch = os.characters.get(agentId);
          if (ch) ch.jcMemberId = memberId; // member→char 逆引き用 (§2(a))
          if (ch && ch.seatId) {
            const seat = os.seats.get(ch.seatId);
            if (seat) {
              // Find walkable tile 2-4 Manhattan distance from seat
              let spawnFound = false;
              for (let dist = 2; dist <= 4 && !spawnFound; dist++) {
                for (let dr = -dist; dr <= dist && !spawnFound; dr++) {
                  for (let dc = -dist; dc <= dist && !spawnFound; dc++) {
                    if (Math.abs(dr) + Math.abs(dc) !== dist) continue;
                    const nc = seat.seatCol + dc;
                    const nr = seat.seatRow + dr;
                    if (nr < 0 || nr >= os.tileMap.length) continue;
                    if (nc < 0 || nc >= (os.tileMap[0]?.length ?? 0)) continue;
                    const t = os.tileMap[nr]?.[nc];
                    if (t === undefined || t === 0 || t === 255) continue;
                    if (os.blockedTiles.has(`${nc},${nr}`)) continue;
                    ch.tileCol = nc;
                    ch.tileRow = nr;
                    ch.x = nc * TILE_SIZE + TILE_SIZE / 2;
                    ch.y = nr * TILE_SIZE + TILE_SIZE / 2;
                    spawnFound = true;
                  }
                }
              }
              os.sendToSeat(agentId);
            }
          }
        }
        saveAgentSeats(os);
      } else if (msg.type === 'jcMemberLeaving') {
        const agentId = msg.agentId as number;
        const memberId = msg.memberId as string;
        // 退社も対称に dedupe: 在席中のみログ (replay された leave の重複を抑止)。
        const depWasPresent = jcGetMemberRuntime(memberId)?.isPresent === true;
        jcMemberLeaving(memberId);
        if (depWasPresent) {
          // Log departure (present → leaving transition only)
          const depRt = jcGetMemberRuntime(memberId);
          addLogEntry({
            timestamp: Date.now(),
            memberId,
            memberName: depRt?.config.name ?? memberId,
            department: depRt?.config.department ?? 'exec',
            type: 'departure',
            summary: `${depRt?.config.name ?? memberId} が退社しました`,
          });
        }

        // Walk character to entrance, then despawn
        const ch = os.characters.get(agentId);
        if (ch) {
          ch.isActive = false;
          const walked = os.walkToTile(agentId, JC_ENTRANCE.col, JC_ENTRANCE.row);
          if (!walked) {
            // Can't pathfind — just remove immediately
            jcMemberDeparted(memberId);
            os.removeAgent(agentId);
          } else {
            // Poll for arrival at entrance, then despawn
            const checkInterval = setInterval(() => {
              const c = os.characters.get(agentId);
              if (!c) {
                clearInterval(checkInterval);
                jcMemberDeparted(memberId);
                return;
              }
              if (
                c.tileCol === JC_ENTRANCE.col &&
                c.tileRow === JC_ENTRANCE.row &&
                c.path.length === 0
              ) {
                clearInterval(checkInterval);
                jcMemberDeparted(memberId);
                os.removeAgent(agentId);
              }
            }, 200);
            // Safety timeout — despawn after 15s regardless
            setTimeout(() => {
              clearInterval(checkInterval);
              if (os.characters.has(agentId)) {
                jcMemberDeparted(memberId);
                os.removeAgent(agentId);
              }
            }, 15000);
          }
        }
      } else if (msg.type === 'jcDashboardSync') {
        // Restore stateSince for all members after Webview re-initialization
        const members = msg.members as Array<{
          memberId: string;
          jcState: JCState;
          stateSince: number;
          activitySummary: string | null;
        }>;
        for (const m of members) {
          jcMemberStateChange(m.memberId, m.jcState, m.stateSince);
          if (m.activitySummary !== null) {
            jcActivitySummaryUpdate(m.memberId, m.activitySummary);
          }
          // §2(a): 再初期化後も彩度落ち状態を復元
          const syncCh = findMemberCharacter(os, m.memberId);
          if (syncCh) {
            syncCh.jcDesaturated = IDLE_TINT_STATES.has(m.jcState);
          }
        }
      } else if (msg.type === 'jcMemberStateChange') {
        const agentId = msg.agentId as number;
        const jcState = msg.jcState as JCState;
        const stateSince = msg.stateSince as number | undefined;
        jcMemberStateChange(msg.memberId, jcState, stateSince);
        jcRecordActivity(msg.memberId as string);

        // §2(a) 出社アイドル: idle/break は彩度落ちスプライトに切替
        // (agentId は event 経由だとランダム負数 → member の座席で解決)
        const tintCh =
          os.characters.get(agentId) ?? findMemberCharacter(os, msg.memberId as string);
        if (tintCh) {
          tintCh.jcDesaturated = IDLE_TINT_STATES.has(jcState);
        }
        // Log state change (skip empty/undefined IDs → no "undefined: → coding" ghost row)
        const scMid = msg.memberId as string;
        const scRt = jcGetMemberRuntime(scMid);
        if (scMid && scMid !== 'undefined') {
          addLogEntry({
            timestamp: Date.now(),
            memberId: scMid,
            memberName: scRt?.config.name ?? scMid,
            department: scRt?.config.department ?? 'exec',
            type: 'state_change',
            summary: `${scRt?.config.name ?? scMid}: → ${jcState}`,
          });
        }

        // Sync character animation with JC state.
        // agentId は jc-events 経路ではランダム負数 (member の実キャラと不一致) —
        // ch.jcMemberId 逆引きで実キャラに fallback する (skill: seatuid-trap 罠2)。
        // これで event 駆動の member も「普通に働く姿」(着席+タイピング) になる。
        const ch = os.characters.get(agentId) ?? findMemberCharacter(os, scMid);
        if (ch) {
          const chId = ch.id;
          if (jcState === 'reading' || jcState === 'reviewing') {
            ch.currentTool = 'Read'; // triggers reading animation
            ch.isActive = true;
            os.sendToSeat(chId);
          } else if (jcState === 'coding') {
            ch.currentTool = 'Write'; // triggers typing animation
            ch.isActive = true;
            os.sendToSeat(chId);
          } else if (jcState === 'thinking') {
            ch.currentTool = 'Task'; // triggers thinking animation
            ch.isActive = true;
            os.sendToSeat(chId);
          } else if (jcState === 'idle') {
            ch.currentTool = null;
            ch.isActive = false; // will trigger idle wander
          } else if (jcState === 'error') {
            ch.currentTool = null;
            ch.isActive = false; // keep at desk but show error animation
            ch.state = CharacterState.ERROR;
            ch.frame = 0;
            ch.frameTimer = 0;
            os.sendToSeat(chId);
          } else if (jcState === 'break') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to break zone target based on member's breakBehavior
            const memberId = msg.memberId as string;
            const target = jcGetBreakTarget(memberId);
            os.walkToTile(chId, target.col, target.row);
          } else if (jcState === 'meeting') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to poker table
            const seatIdx = Array.from(os.characters.keys()).indexOf(chId);
            const seat = jcGetPokerSeat(seatIdx >= 0 ? seatIdx : 0);
            os.walkToTile(chId, seat.col, seat.row);
          } else if (jcState === 'handoff') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to poker table for handoff discussion
            const handoffIdx = Array.from(os.characters.keys()).indexOf(chId);
            const handoffSeat = jcGetPokerSeat(handoffIdx >= 0 ? handoffIdx : 0);
            os.walkToTile(chId, handoffSeat.col, handoffSeat.row);
          }
        }
      } else if (msg.type === 'jcTaskCompleted') {
        jcTriggerTaskCompleted(msg.memberId as string);
      } else if (msg.type === 'jcWave') {
        jcTriggerWave(msg.memberId as string);
      } else if (msg.type === 'jcSubagentThinking') {
        jcTriggerSubagentThinking(msg.memberId as string);
      } else if (msg.type === 'jcLiaison') {
        const fromMemberId = msg.fromMemberId as string;
        const toMemberId = msg.toMemberId as string;
        const duration = (msg.duration as number) || 3000;
        const color = msg.color as string | undefined;
        jcTriggerLiaison(fromMemberId, toMemberId, duration, color);
      } else if (msg.type === 'jcMappingUpdate') {
        const mappings = msg.mappings as Record<number, string>;
        jcUpdateMappings(mappings);
        let appliedToCharacter = false;
        for (const [rawAgentId, memberId] of Object.entries(mappings)) {
          const agentId = Number(rawAgentId);
          const character = os.characters.get(agentId);
          if (character) {
            character.jcMemberId = memberId;
            appliedToCharacter = true;
          }
          const pending = pendingAgents.find((agent) => agent.id === agentId);
          if (pending) pending.memberId = memberId;
        }
        // Persist fresh mappings immediately once the complete layout roster is
        // present. Before first layout, its normal reconciliation save handles it.
        if (layoutReadyRef.current && appliedToCharacter) saveAgentSeats(os);
      } else if (msg.type === 'jcAbsenceUpdate') {
        jcAbsenceUpdate(msg.payload as AbsenceInfo);
      } else if (msg.type === 'jcAbsenceBulkSync') {
        jcAbsenceBulkSync(msg.payload as AbsenceInfo[]);
      } else if (msg.type === 'jcTaskUpdate') {
        jcTaskUpdate(msg.task as TaskDefinition);
        // Log task status changes
        const task = msg.task as TaskDefinition;
        if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
          const rt = jcGetMemberRuntime(task.assignee);
          addLogEntry({
            timestamp: Date.now(),
            memberId: task.assignee,
            memberName: rt?.config.name ?? task.assignee,
            department: rt?.config.department ?? 'exec',
            type: 'task_event',
            summary: `Task ${task.status}: ${task.prompt.slice(0, 60)}${task.result ? ' → ' + task.result.slice(0, 80) : ''}`,
          });
          // Research completed → surface findings prominently in the office.
          // Display-layer only: reuse the existing return path (task.result).
          // Only research (not write-type cards) pops the 調査結果 panel.
          if (task.label === 'research' && task.status === 'done' && task.result) {
            const rrt = jcGetMemberRuntime(task.assignee);
            setResearchResult({
              id: task.id,
              memberId: task.assignee,
              memberName: rrt?.config.name ?? task.assignee,
              department: rrt?.config.department ?? 'research',
              subject: task.prompt,
              findings: task.result,
            });
          }
        }
      } else if (msg.type === 'jcPlanReady') {
        // Step2 Fork B: a read-only plan spawn finished → add a card to the
        // 承認まち tray. Display/intent only — the Owner's 〇/✕/✎ decision posts
        // jcPlanDecision back to the extension, which is the ONLY place the
        // scoped-write execute spawn fires.
        const p = msg as {
          planId: string;
          memberId: string;
          department: string;
          origin: string;
          task: string;
          plan: string;
          stagingDir: string;
        };
        const prt = jcGetMemberRuntime(p.memberId);
        addPlan({
          id: p.planId,
          memberId: p.memberId,
          memberName: prt?.config.name ?? p.memberId,
          department: prt?.config.department ?? p.department ?? 'engineering',
          origin: (p.origin === 'permitted' ? 'permitted' : 'requested') as PlanOrigin,
          task: p.task,
          plan: p.plan,
          stagingDir: p.stagingDir,
          status: 'awaiting',
        });
      } else if (msg.type === 'jcRequestQuestions') {
        // 依頼(request) flow STEP 3: the read-only confirm-questions spawn
        // finished → switch the request panel to the はい/いいえ loop. Display
        // only; the Owner's はい answers post jcRequestConfirmed back to the
        // extension, which runs the EXISTING research active path (no regression).
        const rq = msg as {
          requestId: string;
          questions: Array<{
            understanding: string;
            question: string;
            options?: string[];
            field_ref: string;
          }>;
        };
        const questions: ConfirmQuestion[] = (rq.questions ?? []).map((q) => ({
          understanding: q.understanding,
          question: q.question,
          options: Array.isArray(q.options) ? q.options : [],
          fieldRef: q.field_ref,
        }));
        setRequestQuestions(rq.requestId, questions);
      } else if (msg.type === 'jcRequestResult') {
        // 依頼(request) write型 (資料 doc / 実装 impl) の終端: scoped execute
        // spawn の完了 (done/error) または明示ゲート通知 (disabled = --jc-live-spawn
        // OFF / blocked = plan未確認)。下書きパス+ファイル+要約をパネルに出す。
        // Display only — research の 調査結果 パスとは別 store (research-result-
        // state は触るな契約で無改変のまま)。
        const rr = msg as {
          requestId: string;
          memberId: string;
          department: string;
          kind: string;
          stagingDir: string;
          status: string;
          files?: string[];
          summary?: string;
        };
        const rrRt = jcGetMemberRuntime(rr.memberId);
        setRequestResult({
          id: rr.requestId,
          memberId: rr.memberId,
          memberName: rrRt?.config.name ?? rr.memberId,
          department: rrRt?.config.department ?? rr.department ?? 'engineering',
          kind: rr.kind,
          stagingDir: rr.stagingDir ?? '',
          status: (['done', 'error', 'disabled', 'blocked'].includes(rr.status)
            ? rr.status
            : 'error') as RequestResultStatus,
          files: Array.isArray(rr.files) ? rr.files.filter((f) => typeof f === 'string') : [],
          summary: typeof rr.summary === 'string' ? rr.summary : '',
        });
      } else if (msg.type === 'jcTasksBulkSync') {
        jcTasksBulkSync(msg.tasks as TaskDefinition[]);
      } else if (msg.type === 'jcActivitySummary') {
        const { memberId, summary } = msg as {
          memberId: string;
          summary: string | null;
          type: string;
        };
        jcActivitySummaryUpdate(memberId, summary);
        if (summary) {
          const rt = jcGetMemberRuntime(memberId);
          addLogEntry({
            timestamp: Date.now(),
            memberId,
            memberName: rt?.config.name ?? memberId,
            department: rt?.config.department ?? 'exec',
            type: 'speech',
            summary: `${rt?.config.name ?? memberId}: ${summary}`,
          });
        }
      } else if (msg.type === 'jcSpeechBubble') {
        jcAddSpeechBubble(msg.bubble as SpeechBubble);
        const bubble = msg.bubble as SpeechBubble;
        const rt = jcGetMemberRuntime(bubble.memberId);
        // OFFICE LOG が全文の正 (P2-3): 吹き出し用に切り詰められた text ではなく
        // fullText (あれば) を記録。吹き出し=短く / 文脈はログで、の一貫動線。
        addLogEntry({
          timestamp: Date.now(),
          memberId: bubble.memberId,
          memberName: rt?.config.name ?? bubble.memberId,
          department: bubble.department ?? rt?.config.department ?? 'exec',
          type: 'speech',
          summary: `${rt?.config.name ?? bubble.memberId}: ${bubble.fullText ?? bubble.text}`,
        });
      } else if (msg.type === 'jcFitBadge') {
        const m = msg as { memberId: string; tier: GameTier; fit: number; label: string };
        gameSetFitBadge(m.memberId, m.tier, m.fit, m.label);
      } else if (msg.type === 'jcGaugeStart') {
        const m = msg as { memberId: string; tier: GameTier };
        gameStartGauge(m.memberId, m.tier);
      } else if (msg.type === 'jcGaugeStop') {
        const m = msg as { memberId: string };
        gameStopGauge(m.memberId);
      } else if (msg.type === 'jcGaugeStuck') {
        const m = msg as { memberId: string; stuck: boolean };
        gameSetStuck(m.memberId, m.stuck);
      } else if (msg.type === 'jcCompanyScore') {
        const m = msg as {
          total: number;
          delta: number;
          todayCount: number;
          memberName: string;
          tier: GameTier;
          memberId: string;
        };
        gameSetCompanyScore(m.total, m.delta, m.todayCount, m.memberName, m.tier);
        // Clear the finished member's gauge/badge shortly after completion.
        gameClearMember(m.memberId);
      } else if (msg.type === 'jcEventHistory') {
        // client-init の jc-events 全量 sync (実データ) → R1 稼働復元
        bulkSetKarteEvents((msg.events ?? []) as KarteRawEvent[]);
        reconcileWorkloadPresence();
      } else if (msg.type === 'jcHistoryEvent') {
        // EventWatcher からの逐次 push (冪等 append)
        appendKarteEvent(msg.event as KarteRawEvent);
      } else if (msg.type === 'jcMailFly') {
        // R5 ✉️メール演出 — 依頼発行 (delegate) の実イベントのみが発火源
        jcTriggerMailFlight(msg.fromMemberId as string, msg.toMemberId as string, MAIL_FLIGHT_MS);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'webviewReady' });
    return () => window.removeEventListener('message', handler);
  }, [getOfficeState]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    agentTokenUsage,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
  };
}
