// ── Just Curious Virtual Office — Webview Type Definitions ──────

/** 13-state FSM (mirrors src/jc/types.ts) */
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

/** Zone types */
export type ZoneType =
  | 'entrance'
  | 'exec'
  | 'poker'
  | 'break'
  | 'dev'
  | 'marketing'
  | 'research'
  | 'ops';

/** Member config (subset needed by webview) */
export interface JCMemberConfig {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  department: string;
  zone: ZoneType;
  hueShift: number;
  palette?: number;
  deskId: string;
  accentColor?: string;
  breakBehavior?: 'coffee' | 'sofa' | 'arcade' | 'bookshelf' | 'meeting';
}

/** Exec config */
export interface JCExecConfig {
  id: string;
  name: string;
  role: string;
  zone: 'exec';
}

/** Full config from extension */
export interface JCConfigData {
  organization: string;
  members: JCMemberConfig[];
  exec: JCExecConfig[];
}

/** Per-member runtime state in the webview */
export interface JCMemberRuntime {
  memberId: string;
  config: JCMemberConfig;
  jcState: JCState;
  isPresent: boolean;
  /** Overlay bubble type */
  bubbleType: JCBubbleType;
}

/** Bubble overlay types */
export type JCBubbleType =
  | 'thinking'
  | 'reviewing'
  | 'error'
  | 'presenting'
  | 'meeting'
  | 'coffee'
  | null;

/** Desk nameplate render info */
export interface NameplateInfo {
  text: string;
  col: number;
  row: number;
  isPresent: boolean;
  zone: ZoneType;
}
