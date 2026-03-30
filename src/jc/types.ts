// ── Just Curious Virtual Office — Type Definitions ──────────────

/** 13-state FSM for JC characters */
export const JCState = {
  ABSENT: 'absent',
  ARRIVING: 'arriving',
  CODING: 'coding',
  THINKING: 'thinking',
  READING: 'reading',
  REVIEWING: 'reviewing',
  PRESENTING: 'presenting',
  MEETING: 'meeting',
  BREAK: 'break',
  ERROR: 'error',
  IDLE: 'idle',
  HANDOFF: 'handoff',
  LEAVING: 'leaving',
} as const;
export type JCState = (typeof JCState)[keyof typeof JCState];

/** Office zones */
export const ZoneType = {
  ENTRANCE: 'entrance',
  EXEC: 'exec',
  POKER: 'poker',
  BREAK: 'break',
  DEV: 'dev',
  MARKETING: 'marketing',
  RESEARCH: 'research',
  OPS: 'ops',
} as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];

/** Department IDs */
export type Department = 'engineering' | 'marketing' | 'research' | 'exec';

/** Layer level */
export type Layer = 'L1' | 'L2' | 'L3' | 'L4';

/** Member definition from jc-config.json */
export interface JCMember {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  department: Department;
  layer: Layer;
  zone: ZoneType;
  hueShift: number;
  deskId: string;
}

/** Exec member (icon-only display) */
export interface JCExec {
  id: string;
  name: string;
  role: string;
  zone: 'exec';
}

/** Mapping rule for session → member */
export interface MappingRule {
  projectPattern?: string;
  keyword?: string;
  memberId: string;
}

/** Full JC configuration */
export interface JCConfig {
  organization: string;
  version: number;
  members: JCMember[];
  exec: JCExec[];
  mapping: {
    rules: MappingRule[];
    fallback: 'prompt' | 'random';
  };
}

/** Desk entry in the registry */
export interface DeskEntry {
  deskId: string;
  memberId: string;
  zone: ZoneType;
  seatCol: number;
  seatRow: number;
  facingDir: number; // Direction enum: 0=DOWN, 1=LEFT, 2=RIGHT, 3=UP
  nameplate: string;
  nameplateEn: string;
}

/** Runtime state per JC member */
export interface JCMemberState {
  memberId: string;
  jcState: JCState;
  /** Mapped agent ID (from Pixel Agents), or null if absent */
  agentId: number | null;
  /** Seat UID in the fork's system */
  seatUid: string | null;
  /** Whether currently present in office */
  isPresent: boolean;
}

/** Message types for JC extension ↔ webview communication */
export type JCMessageToWebview =
  | { type: 'jcMemberArriving'; memberId: string; deskId: string; hueShift: number }
  | { type: 'jcMemberLeaving'; memberId: string }
  | { type: 'jcMemberStateChange'; memberId: string; jcState: JCState }
  | { type: 'jcConfigLoaded'; config: JCConfig }
  | { type: 'jcMappingUpdate'; mappings: Record<number, string> };

export type JCMessageToExtension =
  | { type: 'jcRequestMapping'; agentId: number }
  | { type: 'jcAssignMapping'; agentId: number; memberId: string };

/** Bubble overlay type for JC state visualization */
export type JCBubbleType =
  | 'thinking' // 💭
  | 'reviewing' // ✓
  | 'error' // ❌
  | 'presenting' // 📊
  | 'meeting' // 🤝
  | 'coffee' // ☕
  | null;
