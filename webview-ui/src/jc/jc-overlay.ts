// ── Just Curious Virtual Office — Rendering Overlay ──────────────
// Renders JC-specific overlays on top of the base Pixel Agents canvas.
// Called after the base renderFrame() to add nameplates, exec icons,
// absence indicators, zone labels, and state bubbles.

import { TILE_SIZE } from '../office/types.js';
import { jcGetExecPositions, jcGetNameplates, jcGetStats, jcIsActive } from './jc-state.js';
import type { JCBubbleType } from './jc-types.js';

// ── Constants ────────────────────────────────────────────────────
const NAMEPLATE_FONT = '7px "Press Start 2P", monospace';
const NAMEPLATE_FALLBACK_FONT = '8px monospace';
const NAMEPLATE_BG = 'rgba(0, 0, 0, 0.65)';
const NAMEPLATE_TEXT_COLOR = '#ffffff';
const NAMEPLATE_PRESENT_COLOR = '#00ff88';
const NAMEPLATE_ABSENT_COLOR = '#666666';
const NAMEPLATE_PADDING_X = 2;
const NAMEPLATE_PADDING_Y = 1;
const NAMEPLATE_OFFSET_Y = -2; // pixels above the seat tile

const ZONE_LABEL_FONT = '9px "Press Start 2P", monospace';
const ZONE_LABEL_FALLBACK_FONT = '10px monospace';
const ZONE_LABEL_COLOR = 'rgba(255, 255, 255, 0.3)';

const EXEC_ICON_SIZE = 12; // pixel size for exec portrait placeholder
const EXEC_LABEL_FONT = '6px "Press Start 2P", monospace';
const EXEC_LABEL_FALLBACK_FONT = '7px monospace';
const EXEC_BG = 'rgba(40, 40, 80, 0.7)';
const EXEC_BORDER = 'rgba(100, 100, 200, 0.5)';

const ABSENCE_DOT_RADIUS = 2;
const ABSENCE_DOT_COLOR = 'rgba(80, 80, 80, 0.5)';

const STATS_FALLBACK_FONT = '8px monospace';
const STATS_BG = 'rgba(0, 0, 0, 0.7)';
const STATS_COLOR = '#00ff88';

// Bubble emoji sprites (drawn as text for now, can be replaced with sprites)
const BUBBLE_EMOJIS: Record<string, string> = {
  thinking: '💭',
  reviewing: '✓',
  error: '❌',
  presenting: '📊',
  meeting: '🤝',
  coffee: '☕',
};

// ── Zone labels ──────────────────────────────────────────────────
const ZONE_LABELS: Array<{ text: string; col: number; row: number }> = [
  { text: 'ENTRANCE', col: 1, row: 2 },
  { text: 'EXEC', col: 15, row: 2 },
  { text: 'MEETING', col: 3, row: 6 },
  { text: 'BREAK', col: 7, row: 6 },
  { text: 'ENGINEERING', col: 14, row: 6 },
  { text: 'MARKETING', col: 2, row: 12 },
  { text: 'RESEARCH', col: 15, row: 12 },
  { text: 'OPS', col: 8, row: 18 },
];

// ── Main render function ─────────────────────────────────────────

/**
 * Render all JC overlays on top of the base canvas.
 * Call this after renderFrame() in the game loop.
 */
export function renderJCOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth: number,
): void {
  if (!jcIsActive()) return;

  const s = TILE_SIZE * zoom;

  // 1. Zone labels (background, lowest layer)
  renderZoneLabels(ctx, offsetX, offsetY, s, zoom);

  // 2. Absence indicators (dim dots on empty desks)
  renderAbsenceIndicators(ctx, offsetX, offsetY, s, zoom);

  // 3. Name plates (above desks)
  renderNamePlates(ctx, offsetX, offsetY, s, zoom);

  // 4. Exec icons
  renderExecIcons(ctx, offsetX, offsetY, s, zoom);

  // 5. Stats bar (top-right corner)
  renderStatsBar(ctx, canvasWidth);
}

// ── Sub-renderers ────────────────────────────────────────────────

function renderZoneLabels(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  ctx.save();
  ctx.font = zoom >= 3 ? ZONE_LABEL_FONT : ZONE_LABEL_FALLBACK_FONT;
  ctx.fillStyle = ZONE_LABEL_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const label of ZONE_LABELS) {
    const x = offsetX + label.col * s;
    const y = offsetY + label.row * s;
    ctx.fillText(label.text, x, y);
  }
  ctx.restore();
}

function renderAbsenceIndicators(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const nameplates = jcGetNameplates();
  ctx.save();
  for (const np of nameplates) {
    if (np.isPresent) continue; // Skip present members
    // Draw a dim dot at the desk position
    const cx = offsetX + (np.col + 0.5) * s;
    const cy = offsetY + (np.row + 0.5) * s;
    ctx.beginPath();
    ctx.arc(cx, cy, ABSENCE_DOT_RADIUS * zoom, 0, Math.PI * 2);
    ctx.fillStyle = ABSENCE_DOT_COLOR;
    ctx.fill();
  }
  ctx.restore();
}

function renderNamePlates(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const nameplates = jcGetNameplates();
  ctx.save();
  ctx.font = zoom >= 3 ? NAMEPLATE_FONT : NAMEPLATE_FALLBACK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const np of nameplates) {
    const x = offsetX + (np.col + 0.5) * s;
    const y = offsetY + np.row * s + NAMEPLATE_OFFSET_Y * zoom;

    const text = np.text;
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = 8 * (zoom >= 3 ? 1 : 1);

    // Background
    ctx.fillStyle = NAMEPLATE_BG;
    ctx.fillRect(
      x - textW / 2 - NAMEPLATE_PADDING_X,
      y - textH - NAMEPLATE_PADDING_Y,
      textW + NAMEPLATE_PADDING_X * 2,
      textH + NAMEPLATE_PADDING_Y * 2,
    );

    // Text
    ctx.fillStyle = np.isPresent ? NAMEPLATE_PRESENT_COLOR : NAMEPLATE_ABSENT_COLOR;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function renderExecIcons(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const execs = jcGetExecPositions();
  ctx.save();

  for (const exec of execs) {
    const x = offsetX + exec.col * s;
    const y = offsetY + exec.row * s;
    const iconS = EXEC_ICON_SIZE * zoom;

    // Portrait frame (placeholder)
    ctx.fillStyle = EXEC_BG;
    ctx.fillRect(x, y, iconS, iconS);
    ctx.strokeStyle = EXEC_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, iconS, iconS);

    // Label below
    ctx.font = zoom >= 3 ? EXEC_LABEL_FONT : EXEC_LABEL_FALLBACK_FONT;
    ctx.fillStyle = NAMEPLATE_TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(exec.label, x + iconS / 2, y + iconS + 2);
  }
  ctx.restore();
}

function renderStatsBar(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const stats = jcGetStats();
  const text = `${stats.present}/${stats.total}`;

  ctx.save();
  ctx.font = STATS_FALLBACK_FONT;
  const metrics = ctx.measureText(text);
  const x = canvasWidth - metrics.width - 12;
  const y = 4;

  // Background
  ctx.fillStyle = STATS_BG;
  ctx.fillRect(x - 4, y, metrics.width + 8, 14);

  // Text
  ctx.fillStyle = STATS_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y + 3);
  ctx.restore();
}

/**
 * Render a JC state bubble above a character.
 * Called per-character from the character rendering loop.
 */
export function renderJCBubble(
  ctx: CanvasRenderingContext2D,
  bubbleType: JCBubbleType,
  charX: number,
  charY: number,
  zoom: number,
): void {
  if (!bubbleType) return;

  const emoji = BUBBLE_EMOJIS[bubbleType];
  if (!emoji) return;

  ctx.save();
  ctx.font = `${10 * zoom}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // Draw bubble background
  const bx = charX;
  const by = charY - 20 * zoom;
  const bgSize = 12 * zoom;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(bx, by, bgSize / 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw emoji/symbol
  if (bubbleType === 'reviewing') {
    // Draw checkmark instead of emoji
    ctx.fillStyle = '#00cc44';
    ctx.font = `bold ${9 * zoom}px monospace`;
    ctx.fillText('✓', bx, by + 4 * zoom);
  } else if (bubbleType === 'error') {
    ctx.fillStyle = '#ff3333';
    ctx.font = `bold ${9 * zoom}px monospace`;
    ctx.fillText('!', bx, by + 4 * zoom);
  } else {
    ctx.fillText(emoji, bx, by + 5 * zoom);
  }

  ctx.restore();
}
