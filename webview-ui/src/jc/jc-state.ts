// ── Just Curious Virtual Office — Webview State Manager ─────────

import { DEPT_COLORS, IDLE_TIMEOUT_MS, PERMANENT_ROLES, STATE_COLORS } from './jc-constants.js';
import type {
  AbsenceInfo,
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

/** Entrance tile (spawn/despawn point) */
export const JC_ENTRANCE = { col: 12, row: 6 };

/** Poker Table seats — meeting gathering point in Poker Room */
export const POKER_TABLE_SEATS = [
  { col: 16, row: 17 },
  { col: 18, row: 17 },
  { col: 17, row: 16 },
  { col: 17, row: 18 },
];

/** Break zone target positions by breakBehavior type */
const BREAK_TARGETS: Record<string, { col: number; row: number }> = {
  coffee: { col: 22, row: 3 },
  sofa: { col: 21, row: 4 },
  arcade: { col: 20, row: 2 },
  bookshelf: { col: 23, row: 2 },
  meeting: { col: 3, row: 3 },
};

/**
 * Desk positions — must match CUSHIONED_BENCH uid+col+row in default-layout-3.json
 * and the extension-side desk-registry.ts.
 * Nameplate text is derived from jc-config.json at runtime via jcGetNameplates().
 */
const DESK_POSITIONS: Record<string, { col: number; row: number; facingDir: number }> = {
  // ── Executive — Exec Zone (cols 8-16, rows 2-5) ──
  'exec-desk-sec': { col: 8, row: 4, facingDir: 3 }, // Secretary
  'exec-desk-pm': { col: 12, row: 4, facingDir: 3 }, // PM Yamamoto

  // ── Marketing — Marketing Zone (cols 1-12, rows 6-13) ──
  'mkt-desk-01': { col: 2, row: 8, facingDir: 3 }, // Ryo.K (Dir)
  'mkt-desk-02': { col: 4, row: 8, facingDir: 3 }, // Natsuki
  'mkt-desk-03': { col: 6, row: 8, facingDir: 3 }, // Tomás
  'mkt-desk-04': { col: 8, row: 8, facingDir: 3 }, // Sasha
  'mkt-desk-05': { col: 10, row: 8, facingDir: 3 }, // Kenji
  'mkt-desk-06': { col: 2, row: 12, facingDir: 3 }, // Rina
  'mkt-desk-07': { col: 4, row: 12, facingDir: 3 }, // Mei
  'mkt-desk-08': { col: 6, row: 12, facingDir: 3 }, // Jake
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
};

/** Exec positions — icon-only (no character), shown in Exec Area */
const EXEC_POSITIONS: Array<{ id: string; col: number; row: number; label: string }> = [];

/** Initialize from config message */
export function jcLoadConfig(config: JCConfigData): void {
  jcConfig = config;
  for (const member of config.members) {
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

/** Get all nameplates for rendering (names derived from config) */
export function jcGetNameplates(): NameplateInfo[] {
  const nameplates: NameplateInfo[] = [];
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    let isPresent = false;
    let text = deskId; // fallback when config not loaded
    if (jcConfig) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (member) {
        text = member.nameEn ?? member.name;
        const runtime = memberRuntimes.get(member.id);
        isPresent = runtime?.isPresent ?? false;
      }
    }
    nameplates.push({
      text,
      col: pos.col,
      row: pos.row,
      isPresent,
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

/** Get per-department member count stats */
export function jcGetDeptStats(): Record<string, { present: number; total: number }> {
  const deptStats: Record<string, { present: number; total: number }> = {};
  for (const runtime of memberRuntimes.values()) {
    const dept = runtime.config.department;
    if (!deptStats[dept]) {
      deptStats[dept] = { present: 0, total: 0 };
    }
    deptStats[dept].total++;
    if (runtime.isPresent) {
      deptStats[dept].present++;
    }
  }
  return deptStats;
}

/** Get member runtime by ID */
export function jcGetMemberRuntime(memberId: string): JCMemberRuntime | undefined {
  return memberRuntimes.get(memberId);
}

/** Per-member absence info (from extension's AbsenceTracker) */
const memberAbsenceInfo = new Map<string, AbsenceInfo>();

/** Handle individual absence update */
export function jcAbsenceUpdate(info: AbsenceInfo): void {
  memberAbsenceInfo.set(info.memberId, info);
  scheduleMemberNotify();
}

/** Handle bulk absence sync */
export function jcAbsenceBulkSync(infos: AbsenceInfo[]): void {
  memberAbsenceInfo.clear();
  for (const info of infos) {
    memberAbsenceInfo.set(info.memberId, info);
  }
  scheduleMemberNotify();
}

/** Get absence info for a member */
export function jcGetAbsenceInfo(memberId: string): AbsenceInfo | undefined {
  return memberAbsenceInfo.get(memberId);
}

/**
 * Check if a tile position corresponds to an absent member's desk.
 * Returns the member's absence info if found, or null.
 */
export function jcGetAbsentMemberAtDesk(col: number, row: number): AbsenceInfo | null {
  if (!jcConfig) return null;

  // Check if this tile is within 1 tile of any desk position for an absent member
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    // Check if clicked tile is near this desk (seat position ± 1 tile)
    if (Math.abs(pos.col - col) <= 1 && Math.abs(pos.row - row) <= 1) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (!member) continue;
      const runtime = memberRuntimes.get(member.id);
      if (runtime && !runtime.isPresent) {
        return (
          memberAbsenceInfo.get(member.id) ?? {
            memberId: member.id,
            memberName: member.name,
            role: member.role,
            department: member.department,
            status: 'absent',
            lastActivity: 0,
          }
        );
      }
    }
  }
  return null;
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
  const runtime = memberRuntimes.get(memberId);
  const behavior = runtime?.config?.breakBehavior ?? 'coffee';
  return BREAK_TARGETS[behavior] ?? BREAK_TARGETS['coffee'];
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

/** Add a speech bubble for a member */
export function jcAddSpeechBubble(bubble: SpeechBubble): void {
  // Remove existing bubble for this member (only one at a time)
  const idx = speechBubbles.findIndex((b) => b.memberId === bubble.memberId);
  if (idx >= 0) speechBubbles.splice(idx, 1);
  speechBubbles.push(bubble);
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
