// ── Just Curious Virtual Office — Webview State Manager ─────────

import type {
  JCBubbleType,
  JCConfigData,
  JCMemberRuntime,
  JCState,
  NameplateInfo,
} from './jc-types.js';

/** Global JC webview state */
let jcConfig: JCConfigData | null = null;
const memberRuntimes = new Map<string, JCMemberRuntime>();
const agentToMember = new Map<number, string>();

/** Entrance tile (spawn/despawn point) */
export const JC_ENTRANCE = { col: 5, row: 3 };

/**
 * Desk positions — must match CUSHIONED_BENCH uid+col+row in default-layout-2.json
 * and the extension-side desk-registry.ts.
 */
const DESK_POSITIONS: Record<
  string,
  { col: number; row: number; facingDir: number; nameplate: string; nameplateEn: string }
> = {
  // Engineering (cols 13-22, rows 6-10)
  'dev-desk-01': { col: 14, row: 8, facingDir: 3, nameplate: '田中 健太', nameplateEn: 'K.Tanaka' },
  'dev-desk-02': { col: 17, row: 8, facingDir: 3, nameplate: '佐藤 涼', nameplateEn: 'R.Sato' },
  'dev-desk-03': {
    col: 20,
    row: 8,
    facingDir: 3,
    nameplate: '中村 陽菜',
    nameplateEn: 'H.Nakamura',
  },
  'dev-desk-04': {
    col: 15,
    row: 10,
    facingDir: 3,
    nameplate: '山本 真帆',
    nameplateEn: 'M.Yamamoto',
  },
  'dev-desk-05': { col: 18, row: 10, facingDir: 3, nameplate: '藤井 蓮', nameplateEn: 'R.Fujii' },
  'dev-desk-06': {
    col: 21,
    row: 10,
    facingDir: 3,
    nameplate: '黒田 翔太',
    nameplateEn: 'S.Kuroda',
  },
  // Marketing (cols 1-11, rows 12-18)
  'mkt-desk-01': { col: 1, row: 14, facingDir: 3, nameplate: '黒田 涼', nameplateEn: 'R.Kuroda' },
  'mkt-desk-02': { col: 4, row: 14, facingDir: 3, nameplate: '伊藤 美咲', nameplateEn: 'M.Ito' },
  'mkt-desk-03': { col: 7, row: 14, facingDir: 3, nameplate: '渡辺 蓮', nameplateEn: 'R.Watanabe' },
  'mkt-desk-04': {
    col: 10,
    row: 14,
    facingDir: 3,
    nameplate: '小林 萌',
    nameplateEn: 'M.Kobayashi',
  },
  'mkt-desk-05': { col: 1, row: 17, facingDir: 3, nameplate: '加藤 翼', nameplateEn: 'T.Kato' },
  'mkt-desk-06': {
    col: 4,
    row: 17,
    facingDir: 3,
    nameplate: '高橋 里奈',
    nameplateEn: 'R.Takahashi',
  },
  'mkt-desk-07': {
    col: 7,
    row: 17,
    facingDir: 3,
    nameplate: '松本 芽衣',
    nameplateEn: 'M.Matsumoto',
  },
  'mkt-desk-08': { col: 10, row: 17, facingDir: 3, nameplate: '井上 花', nameplateEn: 'H.Inoue' },
  'mkt-desk-09': { col: 3, row: 14, facingDir: 0, nameplate: '木村 翔', nameplateEn: 'S.Kimura' },
  'mkt-desk-10': { col: 6, row: 14, facingDir: 0, nameplate: '林 優衣', nameplateEn: 'Y.Hayashi' },
  'mkt-desk-11': {
    col: 9,
    row: 14,
    facingDir: 0,
    nameplate: '清水 大地',
    nameplateEn: 'D.Shimizu',
  },
  // Research (cols 13-22, rows 12-18)
  'res-desk-01': { col: 14, row: 14, facingDir: 3, nameplate: 'Owner', nameplateEn: 'Owner' },
  'res-desk-02': {
    col: 17,
    row: 14,
    facingDir: 3,
    nameplate: '田村 結月',
    nameplateEn: 'Y.Tamura',
  },
  'res-desk-03': { col: 20, row: 14, facingDir: 3, nameplate: '森 颯太', nameplateEn: 'S.Mori' },
  'res-desk-04': {
    col: 15,
    row: 17,
    facingDir: 3,
    nameplate: '山口 凛',
    nameplateEn: 'R.Yamaguchi',
  },
  'res-desk-05': {
    col: 18,
    row: 17,
    facingDir: 3,
    nameplate: '中島 悠人',
    nameplateEn: 'Y.Nakajima',
  },
  'res-desk-06': { col: 21, row: 17, facingDir: 3, nameplate: '空席', nameplateEn: 'Vacant' },
};

/** Exec positions — icon-only (no character), shown in exec area */
const EXEC_POSITIONS: Array<{ id: string; col: number; row: number; label: string }> = [
  { id: 'exec-01', col: 15, row: 3, label: 'Owner/COO' },
  { id: 'exec-02', col: 17, row: 3, label: 'CEO' },
  { id: 'exec-03', col: 19, row: 3, label: '秘書' },
  { id: 'exec-04', col: 21, row: 3, label: 'PM' },
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

/** Get member runtime by ID */
export function jcGetMemberRuntime(memberId: string): JCMemberRuntime | undefined {
  return memberRuntimes.get(memberId);
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
