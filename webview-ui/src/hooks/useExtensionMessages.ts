import { useEffect, useRef, useState } from 'react';

import type { AbsenceInfo, JCState, SpeechBubble, TaskDefinition } from '../jc/index.js';
import {
  JC_ENTRANCE,
  jcAbsenceBulkSync,
  jcAbsenceUpdate,
  jcActivitySummaryUpdate,
  jcAddSpeechBubble,
  jcGetBreakTarget,
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
  jcUpdateMappings,
} from '../jc/index.js';
import { playDoneSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import { extractToolName } from '../office/toolUtils.js';
import { type OfficeLayout, TILE_SIZE, type ToolActivity } from '../office/types.js';
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

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue;
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
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
        }
        pendingAgents = [];
        // Process buffered JC member arrivals — place directly at desk
        for (const a of pendingJCArrivals) {
          jcMemberArriving(a.memberId);
          const existing = os.characters.get(a.agentId);
          if (existing) {
            if (existing.seatId) {
              const oldSeat = os.seats.get(existing.seatId);
              if (oldSeat) oldSeat.assigned = false;
            }
            if (a.deskId && os.seats.has(a.deskId)) {
              const seat = os.seats.get(a.deskId)!;
              if (!seat.assigned) {
                seat.assigned = true;
                existing.seatId = a.deskId;
                existing.tileCol = seat.seatCol;
                existing.tileRow = seat.seatRow;
                existing.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
                existing.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
                existing.dir = seat.facingDir;
              }
            }
          } else {
            os.addAgent(a.agentId, a.palette, a.hueShift, a.deskId, true);
          }
        }
        pendingJCArrivals = [];
        layoutReadyRef.current = true;
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
          { palette?: number; hueShift?: number; seatId?: string }
        >;
        const folderNames = (msg.folderNames || {}) as Record<number, string>;
        // Buffer agents — they'll be added in layoutLoaded after seats are built
        for (const id of incoming) {
          const m = meta[id];
          pendingAgents.push({
            id,
            palette: m?.palette,
            hueShift: m?.hueShift,
            seatId: m?.seatId,
            folderName: folderNames[id],
          });
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
      } else if (msg.type === 'jcMemberArriving') {
        const agentId = msg.agentId as number;
        const memberId = msg.memberId as string;
        const deskId = msg.deskId as string;
        const hueShift = (msg.hueShift as number) ?? 0;
        const palette = msg.palette as number | undefined;
        const seatUid = deskId; // seat UID in layout matches deskId

        // Buffer if layout not ready yet (seats don't exist)
        if (!layoutReadyRef.current) {
          pendingJCArrivals.push({ agentId, memberId, deskId, hueShift, palette });
          return;
        }

        jcMemberArriving(memberId);

        // If character already exists (from agentCreated), reassign to correct seat
        const existing = os.characters.get(agentId);
        if (existing) {
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
          saveAgentSeats(os);
        } else {
          // Create character directly at the preferred seat (no entrance walk)
          os.addAgent(agentId, palette, hueShift, seatUid, true);
        }
      } else if (msg.type === 'jcMemberLeaving') {
        const agentId = msg.agentId as number;
        const memberId = msg.memberId as string;
        jcMemberLeaving(memberId);

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
      } else if (msg.type === 'jcMemberStateChange') {
        const agentId = msg.agentId as number;
        const jcState = msg.jcState as JCState;
        jcMemberStateChange(msg.memberId, jcState);
        jcRecordActivity(msg.memberId as string);

        // Sync character animation with JC state
        const ch = os.characters.get(agentId);
        if (ch) {
          if (jcState === 'reading' || jcState === 'reviewing') {
            ch.currentTool = 'Read'; // triggers reading animation
            ch.isActive = true;
            os.sendToSeat(agentId);
          } else if (jcState === 'coding') {
            ch.currentTool = 'Write'; // triggers typing animation
            ch.isActive = true;
            os.sendToSeat(agentId);
          } else if (jcState === 'thinking') {
            ch.currentTool = null;
            ch.isActive = true;
            os.sendToSeat(agentId);
          } else if (jcState === 'idle') {
            ch.currentTool = null;
            ch.isActive = false; // will trigger idle wander
          } else if (jcState === 'error') {
            ch.currentTool = null;
            ch.isActive = true;
            os.sendToSeat(agentId);
          } else if (jcState === 'break') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to break zone target based on member's breakBehavior
            const memberId = msg.memberId as string;
            const target = jcGetBreakTarget(memberId);
            os.walkToTile(agentId, target.col, target.row);
          } else if (jcState === 'meeting') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to poker table
            const seatIdx = Array.from(os.characters.keys()).indexOf(agentId);
            const seat = jcGetPokerSeat(seatIdx >= 0 ? seatIdx : 0);
            os.walkToTile(agentId, seat.col, seat.row);
          } else if (jcState === 'handoff') {
            ch.currentTool = null;
            ch.isActive = false;
            // Walk to poker table for handoff discussion
            const handoffIdx = Array.from(os.characters.keys()).indexOf(agentId);
            const handoffSeat = jcGetPokerSeat(handoffIdx >= 0 ? handoffIdx : 0);
            os.walkToTile(agentId, handoffSeat.col, handoffSeat.row);
          }
        }
      } else if (msg.type === 'jcLiaison') {
        const fromMemberId = msg.fromMemberId as string;
        const toMemberId = msg.toMemberId as string;
        jcTriggerLiaison(fromMemberId, toMemberId);
      } else if (msg.type === 'jcMappingUpdate') {
        jcUpdateMappings(msg.mappings);
      } else if (msg.type === 'jcAbsenceUpdate') {
        jcAbsenceUpdate(msg.payload as AbsenceInfo);
      } else if (msg.type === 'jcAbsenceBulkSync') {
        jcAbsenceBulkSync(msg.payload as AbsenceInfo[]);
      } else if (msg.type === 'jcTaskUpdate') {
        jcTaskUpdate(msg.task as TaskDefinition);
      } else if (msg.type === 'jcTasksBulkSync') {
        jcTasksBulkSync(msg.tasks as TaskDefinition[]);
      } else if (msg.type === 'jcActivitySummary') {
        const { memberId, summary } = msg as {
          memberId: string;
          summary: string | null;
          type: string;
        };
        jcActivitySummaryUpdate(memberId, summary);
      } else if (msg.type === 'jcSpeechBubble') {
        jcAddSpeechBubble(msg.bubble as SpeechBubble);
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
