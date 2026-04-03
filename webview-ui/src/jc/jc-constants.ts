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
};

// ── Task Status Colors (canvas overlay) ─────────────────────────
export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#ffbf00',
  running: '#39ff14',
  done: '#00b4ff',
  error: '#ff3d3d',
};

// ── Permanent Resident Roles ────────────────────────────────────
// Members with these roles never auto-depart on idle timeout.
export const PERMANENT_ROLES = new Set([
  'CEO',
  'Secretary',
  'PM / Director',
  'Research Lead (Owner兼務)',
]);

// ── Timing ──────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── Speech Bubble Department Colors ─────────────────────────────
export const SPEECH_BUBBLE_COLORS: Record<string, string> = {
  engineering: '#4A90D9',
  marketing: '#50C878',
  research: '#9B59B6',
  exec: '#FFD700',
};
