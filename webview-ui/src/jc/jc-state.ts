// ── Just Curious Virtual Office — Webview State Manager ─────────

import type {
  AbsenceInfo,
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
  TaskDefinition,
} from './jc-types.js';

/** Global JC webview state */
let jcConfig: JCConfigData | null = null;
const memberRuntimes = new Map<string, JCMemberRuntime>();
const agentToMember = new Map<number, string>();

/** Entrance tile (spawn/despawn point) */
export const JC_ENTRANCE = { col: 12, row: 2 };

/** Poker Table seats — meeting gathering point in break zone */
export const POKER_TABLE_SEATS = [
  { col: 11, row: 3 },
  { col: 12, row: 3 },
  { col: 11, row: 4 },
  { col: 12, row: 4 },
];

/** Break zone target positions by breakBehavior type */
const BREAK_TARGETS: Record<string, { col: number; row: number }> = {
  coffee: { col: 21, row: 4 },
  sofa: { col: 19, row: 3 },
  arcade: { col: 24, row: 3 },
  bookshelf: { col: 20, row: 3 },
  meeting: { col: 11, row: 3 },
};

/**
 * Desk positions — must match CUSHIONED_BENCH uid+col+row in default-layout-3.json
 * and the extension-side desk-registry.ts.
 */
const DESK_POSITIONS: Record<
  string,
  { col: number; row: number; facingDir: number; nameplate: string; nameplateEn: string }
> = {
  // Engineering — Dev Zone (cols 1-11, rows 7-13)
  'dev-desk-01': { col: 4, row: 9, facingDir: 3, nameplate: '田中 健太', nameplateEn: 'K.Tanaka' },
  'dev-desk-02': { col: 1, row: 9, facingDir: 3, nameplate: '佐藤 涼', nameplateEn: 'R.Sato' },
  'dev-desk-03': {
    col: 7,
    row: 9,
    facingDir: 3,
    nameplate: '中村 陽菜',
    nameplateEn: 'H.Nakamura',
  },
  'dev-desk-04': {
    col: 2,
    row: 12,
    facingDir: 3,
    nameplate: '山本 真帆',
    nameplateEn: 'M.Yamamoto',
  },
  'dev-desk-05': { col: 5, row: 12, facingDir: 3, nameplate: '藤井 蓮', nameplateEn: 'R.Fujii' },
  'dev-desk-06': { col: 8, row: 12, facingDir: 3, nameplate: '黒田 翔太', nameplateEn: 'S.Kuroda' },
  // Marketing Zone (cols 13-24, rows 7-13)
  'mkt-desk-01': { col: 14, row: 9, facingDir: 3, nameplate: '黒田 涼', nameplateEn: 'R.Kuroda' },
  'mkt-desk-02': {
    col: 17,
    row: 9,
    facingDir: 3,
    nameplate: '清水 夏希',
    nameplateEn: 'N.Shimizu',
  },
  'mkt-desk-03': {
    col: 20,
    row: 9,
    facingDir: 3,
    nameplate: 'トマス・ベガ',
    nameplateEn: 'T.Vega',
  },
  'mkt-desk-04': {
    col: 23,
    row: 9,
    facingDir: 3,
    nameplate: 'サーシャ・ブレナン',
    nameplateEn: 'S.Brennan',
  },
  'mkt-desk-05': {
    col: 14,
    row: 12,
    facingDir: 3,
    nameplate: '足立 賢治',
    nameplateEn: 'K.Adachi',
  },
  'mkt-desk-06': {
    col: 17,
    row: 12,
    facingDir: 3,
    nameplate: '高橋 里奈',
    nameplateEn: 'R.Takahashi',
  },
  'mkt-desk-07': {
    col: 20,
    row: 12,
    facingDir: 3,
    nameplate: '谷口 芽依',
    nameplateEn: 'M.Taniguchi',
  },
  'mkt-desk-08': {
    col: 23,
    row: 12,
    facingDir: 3,
    nameplate: 'ジェイク・フローレス＝太田',
    nameplateEn: 'J.Flores-Ota',
  },
  'mkt-desk-09': { col: 16, row: 9, facingDir: 0, nameplate: '北川 花', nameplateEn: 'H.Kitagawa' },
  'mkt-desk-10': { col: 19, row: 9, facingDir: 0, nameplate: '森 大地', nameplateEn: 'D.Mori' },
  'mkt-desk-11': { col: 22, row: 9, facingDir: 0, nameplate: 'レナ・パク', nameplateEn: 'L.Park' },
  // Research Lab (cols 1-11, rows 15-21)
  'res-desk-01': { col: 1, row: 17, facingDir: 3, nameplate: 'Owner', nameplateEn: 'Owner' },
  'res-desk-02': {
    col: 4,
    row: 17,
    facingDir: 3,
    nameplate: 'Sora Miyake',
    nameplateEn: 'S.Miyake',
  },
  'res-desk-03': {
    col: 7,
    row: 17,
    facingDir: 3,
    nameplate: 'Marina Ríos-Delgado',
    nameplateEn: 'M.Rios',
  },
  'res-desk-04': {
    col: 2,
    row: 20,
    facingDir: 3,
    nameplate: 'Kai Nakamura-Chen',
    nameplateEn: 'K.Nakamura',
  },
  'res-desk-05': {
    col: 5,
    row: 20,
    facingDir: 3,
    nameplate: 'Dr. Priya Okonkwo-Singh',
    nameplateEn: 'P.Okonkwo',
  },
  'res-desk-06': { col: 8, row: 20, facingDir: 3, nameplate: '空席', nameplateEn: 'Vacant' },
};

/** Exec positions — icon-only (no character), shown in Exec Area (cols 2-5, rows 3) */
const EXEC_POSITIONS: Array<{ id: string; col: number; row: number; label: string }> = [
  { id: 'exec-01', col: 2, row: 3, label: 'Owner/COO' },
  { id: 'exec-02', col: 3, row: 3, label: 'CEO' },
  { id: 'exec-03', col: 4, row: 3, label: '秘書' },
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
  }
}

/** Handle state change */
export function jcMemberStateChange(memberId: string, newState: JCState): void {
  const runtime = memberRuntimes.get(memberId);
  if (runtime) {
    runtime.jcState = newState;
    runtime.bubbleType = stateToBubble(newState);
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

/** Get all nameplates for rendering */
export function jcGetNameplates(): NameplateInfo[] {
  const nameplates: NameplateInfo[] = [];
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    let isPresent = false;
    if (jcConfig) {
      const member = jcConfig.members.find((m) => m.deskId === deskId);
      if (member) {
        const runtime = memberRuntimes.get(member.id);
        isPresent = runtime?.isPresent ?? false;
      }
    }
    nameplates.push({
      text: pos.nameplateEn,
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
}> = [];

/** Trigger a department liaison visual effect */
export function jcTriggerLiaison(
  fromMemberId: string,
  toMemberId: string,
  duration: number = 3000,
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

/** State → neon color mapping for canvas rendering */
const STATE_NEON_COLORS: Record<string, string> = {
  coding: '#39ff14',
  thinking: '#ffbf00',
  reading: '#00b4ff',
  reviewing: '#00f0ff',
  error: '#ff3d3d',
  idle: '#666688',
  break: '#ff6b9d',
  meeting: '#b388ff',
  arriving: '#39ff14',
  leaving: '#888888',
  presenting: '#bf5fff',
  handoff: '#b388ff',
  absent: '#333344',
};

/** Department → neon color mapping */
const DEPT_NEON_COLORS: Record<string, string> = {
  engineering: '#00b4ff',
  marketing: '#ff4d8d',
  research: '#00e676',
};

/** Get neon color for a JC state */
export function jcGetStateColor(state: JCState): string {
  return STATE_NEON_COLORS[state] ?? '#666688';
}

/** Get neon color for a department */
export function jcGetDeptColor(dept: string): string {
  return DEPT_NEON_COLORS[dept] ?? '#888888';
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
}

/** Get all members as dashboard entries for the Team HUD */
export function jcGetDashboardMembers(): DashboardMember[] {
  const members: DashboardMember[] = [];
  for (const [deskId, pos] of Object.entries(DESK_POSITIONS)) {
    if (!jcConfig) continue;
    const member = jcConfig.members.find((m) => m.deskId === deskId);
    if (!member) continue;
    const runtime = memberRuntimes.get(member.id);
    const state = runtime?.jcState ?? 'absent';
    members.push({
      memberId: member.id,
      name: member.name,
      nameEn: member.nameEn ?? member.name,
      role: member.role,
      department: member.department,
      zone: member.zone,
      state,
      isPresent: runtime?.isPresent ?? false,
      stateColor: STATE_NEON_COLORS[state] ?? '#666688',
      deptColor: DEPT_NEON_COLORS[member.department] ?? '#888888',
      deskCol: pos.col,
      deskRow: pos.row,
      activitySummary: memberActivitySummaries.get(member.id) ?? null,
    });
  }
  return members;
}

// ── Helpers ────────────────────────────────────────────────────

function stateToBubble(state: JCState): JCBubbleType {
  switch (state) {
    case 'thinking':
      return 'thinking';
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
      return 'coffee';
    default:
      return null;
  }
}

function deskIdToZone(deskId: string): 'dev' | 'marketing' | 'research' {
  if (deskId.startsWith('dev-')) return 'dev';
  if (deskId.startsWith('mkt-')) return 'marketing';
  return 'research';
}
