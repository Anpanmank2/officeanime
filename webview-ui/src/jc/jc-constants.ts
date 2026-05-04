// ── Just Curious Virtual Office — Shared Constants ──────────────
// Single source of truth for colors, labels, and magic values
// used across jc-state, jc-overlay, and React components.

import type { JCState } from './jc-types.js';

// ── State → Neon Color Mapping ──────────────────────────────────
// Used for state dots, desk glows, and HUD indicators.
export const STATE_COLORS: Record<JCState | string, string> = {
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

// ── State → Display Label ───────────────────────────────────────
export const STATE_LABELS: Record<JCState | string, string> = {
  coding: 'Coding',
  thinking: 'Thinking',
  reading: 'Reading',
  reviewing: 'Reviewing',
  error: 'Error',
  idle: 'Idle',
  break: 'On Break',
  meeting: 'In Meeting',
  arriving: 'Arriving',
  leaving: 'Leaving',
  presenting: 'Presenting',
  handoff: 'Handoff',
  absent: 'Absent',
};

// ── Department Primary Colors ───────────────────────────────────
// Canonical neon colors for each department.
export const DEPT_COLORS: Record<string, string> = {
  engineering: '#00b4ff',
  marketing: '#ff4d8d',
  research: '#00e676',
  exec: '#ffd740',
};

// ── Department Abbreviations ────────────────────────────────────
export const DEPT_LABELS: Record<string, string> = {
  engineering: 'ENG',
  marketing: 'MKT',
  research: 'RES',
  exec: 'EXEC',
};

// ── Department Popup Colors ─────────────────────────────────────
// Softer / higher-contrast shades for dark-background popup UIs
// (AbsentStatusPopup etc.) where neon primaries are too harsh.
export const DEPT_POPUP_COLORS: Record<string, string> = {
  engineering: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
  exec: '#f0ad4e',
};

// ── Department Neon Palette (canvas rendering) ──────────────────
// Extended set: primary, glow (translucent), fill (dark bg), text (readable).
// Keyed by zone name (dev = engineering zone).
export const DEPT_NEON: Record<
  string,
  { primary: string; glow: string; fill: string; text: string }
> = {
  dev: { primary: '#00b4ff', glow: 'rgba(0, 180, 255, 0.4)', fill: '#0a1a30', text: '#80d4ff' },
  marketing: {
    primary: '#ff4d8d',
    glow: 'rgba(255, 77, 141, 0.4)',
    fill: '#300a1a',
    text: '#ff99bf',
  },
  research: {
    primary: '#00e676',
    glow: 'rgba(0, 230, 118, 0.4)',
    fill: '#0a2a15',
    text: '#80f0b0',
  },
  ops: { primary: '#b388ff', glow: 'rgba(179, 136, 255, 0.4)', fill: '#1a0a30', text: '#d4b8ff' },
  exec: { primary: '#ffd740', glow: 'rgba(255, 215, 64, 0.4)', fill: '#2a2008', text: '#ffe680' },
};

// ── Bubble Emojis ───────────────────────────────────────────────
// Status emoji icons rendered above characters on the canvas.
export const BUBBLE_EMOJIS: Record<string, string> = {
  coding: '⚙️',
  thinking: '💭',
  reading: '🔍',
  reviewing: '👀',
  error: '❌',
  presenting: '📊',
  meeting: '🤝',
  coffee: '☕',
  idle: '⏳',
  sofa: '💤',
  arcade: '🎮',
  bookshelf: '📚',
  // ── Emotion triggers ──
  task_completed: '🎉',
  focus: '🔥',
  error_frustration: '😤',
  wave: '👋',
  subagent_thinking: '🧠',
  sleeping: '💤',
};

// ── Per-Member Idle Emojis ──────────────────────────────────────
// Unique idle-habit emoji for each member, derived from persona idle癖.
// Displayed when a member has been idle for IDLE_EMOJI_TRIGGER_MS.
export const MEMBER_IDLE_EMOJIS: Record<string, string> = {
  // ── Exec ──
  'exec-sec': '🖊️', // TODOリスト整理 + ペン回し

  // ── Engineering ──
  'eng-01': '👀', // コードレビューを黙々と進める
  'eng-02': '🖥️', // ターミナルのログを黙々と眺める
  'eng-03': '🎨', // Figmaとコードエディタを交互に見比べる
  'eng-04': '📝', // チームメンバーの様子を見回しながらメモ
  'eng-05': '🎭', // Pinterestで参考画像を集めてムードボード更新
  'eng-06': '🎲', // ゲームを遊びながらメカニクス研究

  // ── Marketing ──
  'mkt-01': '💹', // P/Lダッシュボードを眺めながら考え込む
  'mkt-02': '🗂️', // フレームワーク図をノートに整理
  'mkt-03': '💬', // メンバーのデスクを回って雑談
  'mkt-04': '✍️', // 過去のA/Bテスト結果ファイルを見返す
  'mkt-05': '🪶', // 窓の外を見ながら万年筆でメモ
  'mkt-06': '📌', // タスクボードのカードを並べ替えて最適化
  'mkt-07': '🔢', // SQLを書きながらデータパターンを探す
  'mkt-08': '📐', // 配信シナリオのフロー図をホワイトボードに描く
  'mkt-09': '📱', // SNSフィードをスクロールしてトレンドチェック
  'mkt-10': '🗺️', // 会場のフロア図面に動線を書き込む
  'mkt-11': '📉', // 広告ダッシュボードのCACをリアルタイム監視
  'mkt-12': '📄', // テンプレートライブラリを整理

  // ── Research ──
  'res-01': '📊', // ダッシュボード数値を眺めながら仮説メモ
  'res-02': '📱', // TweetDeckの複数カラムを高速スクロール — NOTE: same emoji as mkt-09 but different member
  'res-03': '🎨', // ムードボードを整理しながら色彩パレット吟味 — NOTE: same emoji as eng-03
  'res-04': '📲', // スマホでTikTokをスワイプしながらフック構造メモ
  'res-05': '📖', // 学術論文を読みながらノートに要点
  'res-06': '📈', // ダッシュボードのレイアウトを微調整
  'res-07': '🃏', // Bloomberg端末風画面 + ポーカーチップを回す
  'res-08': '🔎', // Search Consoleのクエリレポートをスクロール
  'res-09': '🗂️', // 複数レポートを並べて構造マップ
};

// ── Idle Emoji Timing ───────────────────────────────────────────
export const IDLE_EMOJI_TRIGGER_MS = 10_000; // 10s idle before showing member emoji
export const IDLE_EMOJI_ON_MS = 5_000; // 5s display
export const IDLE_EMOJI_OFF_MS = 3_000; // 3s hidden (blink cycle)

// ── Task Status Colors (canvas overlay) ─────────────────────────
export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#ffbf00',
  running: '#39ff14',
  done: '#00b4ff',
  error: '#ff3d3d',
};

// ── Permanent Resident Roles ────────────────────────────────────
// Members with these roles never auto-depart on idle timeout.
export const PERMANENT_ROLES = new Set(['Secretary', 'PM / Director']);

// ── Timing ──────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (v1 spec)

// ── Speech Bubble Department Colors ─────────────────────────────
export const SPEECH_BUBBLE_COLORS: Record<string, string> = {
  engineering: '#4A90D9',
  marketing: '#50C878',
  research: '#9B59B6',
  exec: '#FFD700',
};

// ── Delegation Beam Presets (v1.2) ─────────────────────────────
// Color and duration for delegation chain liaison beams.
export const DELEGATION_BEAM: Record<string, { color: string; duration: number }> = {
  secretary_to_lead: { color: '#39ff14', duration: 2000 },
  lead_to_agent: { color: '#00b4ff', duration: 1500 },
  cross_dept_request: { color: '#bf5fff', duration: 2000 },
  cross_dept_return: { color: '#bf5fff', duration: 2000 },
  agent_to_lead: { color: '#00b4ff', duration: 1500 },
  progress_check: { color: '#666688', duration: 1000 },
};

// ── Secretary Monitoring Interval ──────────────────────────────
export const SECRETARY_MONITOR_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// ── Priority Colors (P0-P4) ────────────────────────────────────
export const PRIORITY_COLORS: Record<number, string> = {
  0: '#ff0000', // P0 Critical
  1: '#ff4444', // P1 High
  2: '#f0ad4e', // P2 Medium
  3: '#58a6ff', // P3 Normal
  4: '#8b949e', // P4 Low
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'P0',
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};

// ── Task Label Colors ──────────────────────────────────────────
export const TASK_LABEL_COLORS: Record<string, string> = {
  implementation: '#39ff14',
  research: '#00e676',
  review: '#00b4ff',
  bugfix: '#ff3d3d',
  design: '#ff6b9d',
  ops: '#b388ff',
  incident: '#ff0000',
  other: '#8b949e',
};

// ── Office Log Department Filters ──────────────────────────────
export const LOG_DEPT_FILTERS = ['All', 'Eng', 'Mkt', 'Research', 'Secretary'] as const;

// ── Log Dept Filter → department mapping ───────────────────────
export const LOG_DEPT_FILTER_MAP: Record<string, string> = {
  Eng: 'engineering',
  Mkt: 'marketing',
  Research: 'research',
  Secretary: 'exec',
};

// ── Confidence Badge Colors (eng-05 spec) ───────────────────────
export const CONFIDENCE_COLORS: Record<string, string> = {
  confirmed: '#5ac88c',
  likely: '#f59e0b',
  unverified: '#8888aa',
};

// ── Confidence Badge Styles ─────────────────────────────────────
export const CONFIDENCE_BADGE_STYLES: Record<
  string,
  { background: string; color: string; border: string }
> = {
  confirmed: {
    background: '#1a3a2a',
    color: '#5ac88c',
    border: '1px solid #5ac88c',
  },
  likely: {
    background: '#3a2e10',
    color: '#f59e0b',
    border: '1px solid #f59e0b',
  },
  unverified: {
    background: '#2a2a3a',
    color: '#8888aa',
    border: '1px solid #4a4a6a',
  },
};
