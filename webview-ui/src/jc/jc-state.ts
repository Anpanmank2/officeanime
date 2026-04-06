// ── Just Curious Virtual Office — Webview State Manager ─────────

import { DEPT_COLORS, IDLE_TIMEOUT_MS, PERMANENT_ROLES, STATE_COLORS } from './jc-constants.js';
import type {
  AbsenceInfo,
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
  SpeechBubble,
  TaskDefinition,
} from './jc-types.js';

/** Global JC webview state */
let jcConfig: JCConfigData | null = null;
const memberRuntimes = new Map<string, JCMemberRuntime>();
const agentToMember = new Map<number, string>();

/** Entrance tile (spawn/despawn point) */
export const JC_ENTRANCE = { col: 12, row: 2 };

/** Poker Table seats — meeting gathering point in Poker Room */
export const POKER_TABLE_SEATS = [
  { col: 16, row: 17 },
  { col: 18, row: 17 },
  { col: 17, row: 16 },
  { col: 17, row: 18 },
];

/** Break zone target positions by breakBehavior type */
const BREAK_TARGETS: Record<string, { col: number; row: number }> = {
  coffee: { col: 21, row: 4 },
  sofa: { col: 19, row: 3 },
  arcade: { col: 24, row: 3 },
  bookshelf: { col: 20, row: 3 },
  meeting: { col: 17, row: 17 },
};

/**
 * Desk positions — must match CUSHIONED_BENCH uid+col+row in default-layout-3.json
 * and the extension-side desk-registry.ts.
 * Nameplate text is derived from jc-config.json at runtime via jcGetNameplates().
 */
const DESK_POSITIONS: Record<string, { col: number; row: number; facingDir: number }> = {
  // ── Engineering — Dev Zone (cols 1-11, rows 7-13) ──
  // "テックオタクの洞窟" — クラスタ配置
  'dev-desk-01': { col: 5, row: 9, facingDir: 2 }, // Kenta (TL) — ペアプロ、Ryo.Sに向かう（左向き）
  'dev-desk-02': { col: 2, row: 9, facingDir: 1 }, // Ryo.S (BE) — Kentaに向かう（右向き）
  'dev-desk-03': { col: 8, row: 9, facingDir: 0 }, // Hina (FE) — 壁向き集中席（北向き）
  'dev-desk-04': { col: 2, row: 12, facingDir: 3 }, // Maho (PM) — チーム俯瞰（南向き）
  'dev-desk-05': { col: 6, row: 12, facingDir: 3 }, // Ren (Designer) — 横並びペア（南向き）
  'dev-desk-06': { col: 8, row: 12, facingDir: 3 }, // Shota (Game) — Renと画面共有（南向き）

  // ── Marketing — Creative Village (cols 13-24, rows 7-13) ──
  // "カラフルなカオス" — Strategy島 + Execution列
  'mkt-desk-01': { col: 14, row: 9, facingDir: 3 }, // Ryo.K (Dir) — 角のL字、全体を見渡す（南向き）
  'mkt-desk-02': { col: 17, row: 9, facingDir: 1 }, // Natsuki — Strategy島（右向き→Tomásに向かう）
  'mkt-desk-03': { col: 19, row: 9, facingDir: 2 }, // Tomás — Strategy島（左向き→Natsukiに向かう）
  'mkt-desk-04': { col: 21, row: 9, facingDir: 1 }, // Sasha — Strategy島（右向き→Kenjiに向かう）
  'mkt-desk-05': { col: 23, row: 9, facingDir: 2 }, // Kenji — Strategy島（左向き→Sashaに向かう）
  'mkt-desk-06': { col: 14, row: 12, facingDir: 3 }, // Rina (Ops) — 情報ハブ（南向き）
  'mkt-desk-07': { col: 16, row: 12, facingDir: 3 }, // Mei — Execution列（南向き）
  'mkt-desk-08': { col: 18, row: 12, facingDir: 3 }, // Jake — Execution列（南向き）
  'mkt-desk-09': { col: 20, row: 12, facingDir: 3 }, // Hana — Execution列（南向き）
  'mkt-desk-10': { col: 22, row: 12, facingDir: 3 }, // Daichi — Execution列（南向き）
  'mkt-desk-11': { col: 24, row: 12, facingDir: 3 }, // Lena — Execution列（南向き）

  // ── Research Lab — 学者の書斎 (cols 1-11, rows 15-21) ──
  // ゼミ配置: 本棚を背にした上座 + 向かい合わせペア + 独立席
  'res-desk-01': { col: 3, row: 17, facingDir: 3 }, // Haruki (Dir) — 本棚背、最奥の上座（南向き）
  'res-desk-02': { col: 7, row: 17, facingDir: 3 }, // Sora — シニア研究員（南向き）
  'res-desk-03': { col: 2, row: 20, facingDir: 1 }, // Marina — 向かい合わせペア（右向き→Kaiへ）
  'res-desk-04': { col: 5, row: 20, facingDir: 2 }, // Kai — 向かい合わせペア（左向き→Marinaへ）
  'res-desk-05': { col: 8, row: 20, facingDir: 2 }, // Priya — 独立席、壁向き（西向き）
  'res-desk-06': { col: 10, row: 20, facingDir: 3 }, // Yuto — データ統合席（南向き）
  'res-desk-07': { col: 5, row: 17, facingDir: 3 }, // Marcus (L2) — Director右隣、戦略参謀（南向き）
  'res-desk-08': { col: 10, row: 17, facingDir: 3 }, // Ayane — 上段右端、SEO分析席（南向き）

  // ── Executive — Exec Area (permanent residents) ──
  // "静かな威圧感" — ミニマルで品格のある空間
  'exec-desk-ceo': { col: 3, row: 4, facingDir: 3 }, // CEO Kamei
  'exec-desk-sec': { col: 5, row: 4, facingDir: 3 }, // Secretary
};

/** Exec positions — icon-only (no character), shown in Exec Area */
const EXEC_POSITIONS: Array<{ id: string; col: number; row: number; label: string }> = [
  { id: 'exec-01', col: 2, row: 3, label: 'Owner/COO' },
  { id: 'exec-04', col: 5, row: 3, label: 'PM' },
];

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
    });
  }
  console.log(`[JC-WV] Config loaded: ${config.members.length} members`);
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
  }
}

/** Handle member leaving */
export function jcMemberLeaving(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.jcState = 'leaving';
    console.log(`[JC-WV] Member leaving: ${memberId}`);
  }
}

/** Handle member departed (left office) */
export function jcMemberDeparted(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.jcState = 'absent';
    runtime.isPresent = false;
    runtime.bubbleType = null;
    runtime.idleSince = null;
    runtime.emotionEmoji = null;
    runtime.emotionUntil = 0;
    runtime.workingSince = null;
    runtime.stateSince = Date.now();
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
      runtime.workingSince = null;
    }

    // Emotion triggers
    if (newState === 'error' && prevState !== 'error') {
      runtime.emotionEmoji = '😤';
      runtime.emotionUntil = Date.now() + 2000;
    }
  }
}

/** Trigger a task_completed emotion emoji on a member */
export function jcTriggerTaskCompleted(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '🎉';
    runtime.emotionUntil = Date.now() + 2000;
  }
}

/** Trigger a cross-department wave 👋 on a member */
export function jcTriggerWave(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '👋';
    runtime.emotionUntil = Date.now() + 2000;
  }
}

/** Trigger a sub-agent thinking 🧠 on a parent member */
export function jcTriggerSubagentThinking(memberId: string): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.emotionEmoji = '🧠';
    runtime.emotionUntil = Date.now() + 3000;
  }
}

/** Update agent-member mappings */
export function jcUpdateMappings(mappings: Record<number, string>): void {
  agentToMember.clear();
  for (const [agentId, memberId] of Object.entries(mappings)) {
    agentToMember.set(Number(agentId), memberId);
  }
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
}

/** Handle bulk absence sync */
export function jcAbsenceBulkSync(infos: AbsenceInfo[]): void {
  memberAbsenceInfo.clear();
  for (const info of infos) {
    memberAbsenceInfo.set(info.memberId, info);
  }
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
}

/** Get activity summary for a member */
export function jcGetActivitySummary(memberId: string): string | null {
  return memberActivitySummaries.get(memberId) ?? null;
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
}

/** Handle bulk task sync */
export function jcTasksBulkSync(tasks: TaskDefinition[]): void {
  memberTasks.clear();
  for (const task of tasks) {
    const existing = memberTasks.get(task.assignee) ?? [];
    existing.push(task);
    memberTasks.set(task.assignee, existing);
  }
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

/** Get all members as dashboard entries for the Team HUD */
export function jcGetDashboardMembers(): DashboardMember[] {
  if (!jcConfig) return [];
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
      parentMemberId: null, // [PHASE-B] resolve via subagentCharacters
      childMemberIds: [], // [PHASE-B] resolve via subagentCharacters
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
}

/** Get active speech bubbles (pruning expired ones) */
export function jcGetSpeechBubbles(): SpeechBubble[] {
  const now = Date.now();
  for (let i = speechBubbles.length - 1; i >= 0; i--) {
    if (now - speechBubbles[i].timestamp > speechBubbles[i].duration) {
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

// ── Helpers ────────────────────────────────────────────────────

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
