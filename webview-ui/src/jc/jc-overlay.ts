// ── Just Curious Virtual Office — Rendering Overlay ──────────────
// Renders JC-specific overlays on top of the base Pixel Agents canvas.
// Called after the base renderFrame() to add nameplates, exec icons,
// absence indicators, zone labels, and state bubbles.

import type { Character } from '../office/types.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import {
  jcGetActiveLiaisons,
  jcGetActivitySummary,
  jcGetDeptStats,
  jcGetDeskTaskStatus,
  jcGetExecPositions,
  jcGetMemberForAgent,
  jcGetMemberRuntime,
  jcGetNameplates,
  jcGetStats,
  jcIsActive,
} from './jc-state.js';
import type { JCBubbleType } from './jc-types.js';

// ── Constants ────────────────────────────────────────────────────
const NAMEPLATE_FONT = '7px "Press Start 2P", monospace';
const NAMEPLATE_FALLBACK_FONT = '8px monospace';
const NAMEPLATE_TEXT_COLOR = '#ffffff';
const NAMEPLATE_PRESENT_COLOR = '#00ff88';
const NAMEPLATE_ABSENT_COLOR = '#555555';
const NAMEPLATE_PADDING_X = 3;
const NAMEPLATE_PADDING_Y = 2;
const NAMEPLATE_OFFSET_Y = -2; // pixels above the seat tile

const ZONE_LABEL_FONT = '9px "Press Start 2P", monospace';
const ZONE_LABEL_FALLBACK_FONT = '10px monospace';

const EXEC_ICON_SIZE = 12; // pixel size for exec portrait placeholder
const EXEC_LABEL_FONT = '6px "Press Start 2P", monospace';
const EXEC_LABEL_FALLBACK_FONT = '7px monospace';
const EXEC_BG = 'rgba(40, 40, 80, 0.7)';
const EXEC_BORDER = 'rgba(100, 100, 200, 0.5)';

const ABSENCE_DOT_RADIUS = 2;
const ABSENCE_DOT_COLOR = 'rgba(80, 80, 80, 0.5)';

const STATS_FALLBACK_FONT = '8px monospace';
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

// Liaison beam effect
const LIAISON_COLOR_RESEARCH = 'rgba(100, 100, 255, 0.4)';
const LIAISON_COLOR_MARKETING = 'rgba(255, 100, 100, 0.4)';
const LIAISON_LINE_WIDTH = 2;
const LIAISON_PARTICLE_SIZE = 3;

// ── Zone labels ──────────────────────────────────────────────────
const ZONE_LABELS: Array<{ text: string; col: number; row: number; zone: string }> = [
  { text: 'EXEC AREA', col: 1, row: 2, zone: 'exec' },
  { text: 'ENTRANCE', col: 10, row: 2, zone: 'entrance' },
  { text: 'POKER TABLE', col: 10, row: 4, zone: 'poker' },
  { text: 'BREAK ZONE', col: 18, row: 2, zone: 'break' },
  { text: 'DEV ZONE', col: 1, row: 7, zone: 'dev' },
  { text: 'MARKETING', col: 13, row: 7, zone: 'marketing' },
  { text: 'RESEARCH LAB', col: 1, row: 15, zone: 'research' },
  { text: 'OPS HUB', col: 13, row: 15, zone: 'ops' },
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
  characters?: Character[],
  hoverTileCol?: number,
  hoverTileRow?: number,
): void {
  if (!jcIsActive()) return;

  const s = TILE_SIZE * zoom;

  // 1. Department signs (wall-mounted plaques, lowest layer)
  renderDepartmentSigns(ctx, offsetX, offsetY, s, zoom);

  // 2. Absence indicators (dim dots on empty desks)
  renderAbsenceIndicators(ctx, offsetX, offsetY, s, zoom);

  // 2.5. Task status indicators on desks
  renderTaskIndicators(ctx, offsetX, offsetY, s, zoom);

  // 3. Hover nameplate (shown only when mouse is near a desk)
  if (hoverTileCol !== undefined && hoverTileRow !== undefined) {
    renderHoverNameplate(ctx, offsetX, offsetY, s, zoom, hoverTileCol, hoverTileRow);
  }

  // 4. Exec icons
  renderExecIcons(ctx, offsetX, offsetY, s, zoom);

  // 4.5. Department liaison beams
  renderLiaisonBeams(ctx, offsetX, offsetY, s, zoom);

  // 5. JC state bubbles above characters
  if (characters) {
    renderJCCharacterBubbles(ctx, characters, offsetX, offsetY, zoom);
  }

  // 6. Stats bar (top-right corner, fixed position)
  renderStatsBar(ctx, canvasWidth);

  // 7. Activity summary speech bubbles above characters
  if (characters) {
    renderActivityBubbles(ctx, characters, offsetX, offsetY, zoom);
  }
}

// ── Sub-renderers ────────────────────────────────────────────────

// Department sign solid colors (matching zone theme but solid for signs)
const DEPT_SIGN_COLORS: Record<string, { frame: string; fill: string; text: string }> = {
  dev: { frame: '#3a6fd8', fill: '#1a3a7a', text: '#a0c4ff' },
  marketing: { frame: '#d83a6f', fill: '#7a1a3a', text: '#ffa0c4' },
  research: { frame: '#3ad87a', fill: '#1a7a3a', text: '#a0ffbc' },
  ops: { frame: '#8a6ad8', fill: '#3a1a7a', text: '#c4a0ff' },
  exec: { frame: '#d8b83a', fill: '#7a5a1a', text: '#ffe0a0' },
  entrance: { frame: '#888888', fill: '#333333', text: '#cccccc' },
  poker: { frame: '#888888', fill: '#333333', text: '#cccccc' },
  break: { frame: '#d87a3a', fill: '#7a3a1a', text: '#ffc4a0' },
};

function renderDepartmentSigns(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  ctx.save();

  for (const label of ZONE_LABELS) {
    const cx = offsetX + (label.col + 0.5) * s; // center of sign horizontally
    const y = offsetY + label.row * s;

    const colors = DEPT_SIGN_COLORS[label.zone] ?? {
      frame: '#888888',
      fill: '#333333',
      text: '#cccccc',
    };

    // Sign dimensions: scale with zoom but keep readable
    const signFont = zoom >= 3 ? ZONE_LABEL_FONT : ZONE_LABEL_FALLBACK_FONT;
    ctx.font = signFont;
    const textMetrics = ctx.measureText(label.text);
    const textW = textMetrics.width;
    const textH = zoom >= 3 ? 9 : 10;

    const padX = Math.max(4, 5 * zoom * 0.4);
    const padY = Math.max(3, 4 * zoom * 0.4);
    const signW = textW + padX * 2;
    const signH = textH + padY * 2;
    const signX = cx - signW / 2;
    const signY = y;

    // Shadow (1px offset, subtle depth)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(signX + 1, signY + 1, signW, signH);

    // Outer frame (department color, 2px border)
    ctx.fillStyle = colors.frame;
    ctx.fillRect(signX, signY, signW, signH);

    // Inner fill (2px inset on each side)
    const borderW = Math.max(1, Math.round(zoom * 0.5));
    ctx.fillStyle = colors.fill;
    ctx.fillRect(signX + borderW, signY + borderW, signW - borderW * 2, signH - borderW * 2);

    // Left accent bar (brighter strip, like a mounting rail)
    ctx.fillStyle = colors.frame;
    ctx.fillRect(signX + borderW, signY + borderW, borderW + 1, signH - borderW * 2);

    // Mounting pins (two small dots above sign center)
    const pinSize = Math.max(1, Math.round(zoom * 0.4));
    const pinY = signY - pinSize * 2;
    ctx.fillStyle = colors.frame;
    ctx.fillRect(cx - signW * 0.25 - pinSize / 2, pinY, pinSize, pinSize * 2);
    ctx.fillRect(cx + signW * 0.25 - pinSize / 2, pinY, pinSize, pinSize * 2);

    // Text (centered)
    ctx.font = signFont;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, cx, signY + signH / 2);
  }

  ctx.restore();
}

function renderHoverNameplate(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
  hoverCol: number,
  hoverRow: number,
): void {
  const nameplates = jcGetNameplates();
  // Find nameplate within 1 tile of hover position
  const np = nameplates.find(
    (n) => Math.abs(n.col - hoverCol) <= 1 && Math.abs(n.row - hoverRow) <= 1,
  );
  if (!np) return;

  ctx.save();
  ctx.font = zoom >= 3 ? NAMEPLATE_FONT : NAMEPLATE_FALLBACK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const x = offsetX + (np.col + 0.5) * s;
  const y = offsetY + np.row * s + NAMEPLATE_OFFSET_Y * zoom;

  const text = np.text;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const textH = 8;

  const bgX = x - textW / 2 - NAMEPLATE_PADDING_X;
  const bgY = y - textH - NAMEPLATE_PADDING_Y;
  const bgW = textW + NAMEPLATE_PADDING_X * 2;
  const bgH = textH + NAMEPLATE_PADDING_Y * 2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bgX + 1, bgY + 1, bgW, bgH);

  // Background: dark tooltip style
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(bgX, bgY, bgW, bgH);

  // Border (1px solid)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bgX, bgY, bgW, bgH);

  // Left accent bar (department color)
  const zoneColor = NAMEPLATE_ZONE_COLORS[np.zone];
  if (zoneColor) {
    const accentW = Math.max(2, Math.round(zoom * 0.5));
    ctx.fillStyle = np.isPresent ? zoneColor : `${zoneColor}44`;
    ctx.fillRect(bgX, bgY, accentW, bgH);
  }

  // Text
  ctx.fillStyle = np.isPresent ? NAMEPLATE_PRESENT_COLOR : NAMEPLATE_ABSENT_COLOR;
  ctx.fillText(text, x, y);

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

// Task status indicator colors
const TASK_PENDING_COLOR = '#f0ad4e'; // yellow/amber
const TASK_RUNNING_COLOR = '#3fb950'; // green
const TASK_DONE_COLOR = '#58a6ff'; // blue
const TASK_ERROR_COLOR = '#ff4444'; // red

function renderTaskIndicators(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const nameplates = jcGetNameplates();
  if (zoom < 2) return; // Too small to see

  ctx.save();

  for (const np of nameplates) {
    const task = jcGetDeskTaskStatus(np.col, np.row);
    if (!task) continue;

    const cx = offsetX + (np.col + 0.5) * s;
    // Position the indicator above the desk, below the nameplate
    const cy = offsetY + np.row * s - 2 * zoom;
    const iconSize = Math.max(4, 3 * zoom);

    if (task.status === 'pending') {
      // Clock icon: small circle with hands
      ctx.beginPath();
      ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = TASK_PENDING_COLOR;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      // Clock hands
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - iconSize / 3);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + iconSize / 4, cy);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, zoom * 0.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (task.status === 'running') {
      // Already handled by character typing animation — skip visual indicator
      // (keep running indicator minimal: small green pulse dot)
      const pulse = (Math.sin(Date.now() / 300) + 1) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (iconSize / 2) * (0.8 + 0.2 * pulse), 0, Math.PI * 2);
      ctx.fillStyle = TASK_RUNNING_COLOR;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (task.status === 'done') {
      // Checkmark
      ctx.fillStyle = TASK_DONE_COLOR;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fill();
      // Draw checkmark
      ctx.beginPath();
      const half = iconSize / 2;
      ctx.moveTo(cx - half * 0.35, cy);
      ctx.lineTo(cx - half * 0.05, cy + half * 0.3);
      ctx.lineTo(cx + half * 0.4, cy - half * 0.3);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, zoom * 0.4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (task.status === 'error') {
      // Red exclamation
      ctx.fillStyle = TASK_ERROR_COLOR;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold ${iconSize}px monospace`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

// Nameplate zone accent colors (subtle left border)
const NAMEPLATE_ZONE_COLORS: Record<string, string> = {
  dev: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
};

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

function renderLiaisonBeams(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const liaisons = jcGetActiveLiaisons();
  if (liaisons.length === 0) return;

  ctx.save();
  const now = Date.now();

  for (const liaison of liaisons) {
    const progress = (now - liaison.startTime) / liaison.duration;
    const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;

    const x1 = offsetX + (liaison.fromCol + 0.5) * s;
    const y1 = offsetY + (liaison.fromRow + 0.5) * s;
    const x2 = offsetX + (liaison.toCol + 0.5) * s;
    const y2 = offsetY + (liaison.toRow + 0.5) * s;

    // Draw beam line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle =
      liaison.fromZone === 'research' ? LIAISON_COLOR_RESEARCH : LIAISON_COLOR_MARKETING;
    ctx.lineWidth = LIAISON_LINE_WIDTH * zoom;
    ctx.globalAlpha = alpha * 0.6;
    ctx.stroke();

    // Draw moving particle along the beam
    const px = x1 + (x2 - x1) * progress;
    const py = y1 + (y2 - y1) * progress;
    ctx.beginPath();
    ctx.arc(px, py, LIAISON_PARTICLE_SIZE * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha;
    ctx.fill();
  }

  ctx.restore();
}

// Department stats colors
const DEPT_STAT_COLORS: Record<string, string> = {
  engineering: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
};

function renderStatsBar(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const stats = jcGetStats();

  // Gather per-department counts
  const deptCounts = jcGetDeptStats();

  ctx.save();
  ctx.font = STATS_FALLBACK_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  const lineHeight = 14;
  const rightMargin = 12;
  const topMargin = 4;
  const padding = 6;

  // Build text lines for measurement
  const headerText = `${stats.present}/${stats.total} online`;
  const deptLines: Array<{ label: string; text: string; color: string }> = [];
  for (const [dept, count] of Object.entries(deptCounts)) {
    if (count.total > 0) {
      const deptLabel = dept === 'engineering' ? 'ENG' : dept === 'marketing' ? 'MKT' : 'RES';
      deptLines.push({
        label: deptLabel,
        text: `${count.present}/${count.total}`,
        color: DEPT_STAT_COLORS[dept] ?? STATS_COLOR,
      });
    }
  }

  // Measure max width needed
  const headerMetrics = ctx.measureText(headerText);
  let maxWidth = headerMetrics.width;
  for (const line of deptLines) {
    const lineWidth = ctx.measureText(`${line.label} ${line.text}`).width;
    if (lineWidth > maxWidth) maxWidth = lineWidth;
  }

  const boxWidth = maxWidth + padding * 2;
  const boxHeight = lineHeight + deptLines.length * lineHeight + padding * 2;
  const boxX = canvasWidth - boxWidth - rightMargin;
  const boxY = topMargin;

  // Background with border
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  // Header
  const textX = canvasWidth - rightMargin - padding;
  let textY = boxY + padding;
  ctx.fillStyle = STATS_COLOR;
  ctx.fillText(headerText, textX, textY);
  textY += lineHeight;

  // Department lines
  for (const line of deptLines) {
    ctx.fillStyle = line.color;
    ctx.fillText(`${line.label} ${line.text}`, textX, textY);
    textY += lineHeight;
  }

  ctx.restore();
}

/**
 * Render JC state bubbles for all mapped characters.
 * Looks up each character's agentId → memberId → JC state → bubble type.
 */
function renderJCCharacterBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (ch.isSubagent) continue;
    const memberId = jcGetMemberForAgent(ch.id);
    if (!memberId) continue;
    const runtime = jcGetMemberRuntime(memberId);
    if (!runtime || !runtime.bubbleType) continue;

    // Character pixel position → screen position
    // Sitting offset: characters sit higher when in TYPE state
    const sittingOff = ch.state === CharacterState.TYPE ? -4 : 0;
    const screenX = offsetX + ch.x * zoom;
    const screenY = offsetY + (ch.y + sittingOff) * zoom;

    renderJCBubble(ctx, runtime.bubbleType, screenX, screenY, zoom);
  }
}

/** Render activity summary speech bubbles above characters */
function renderActivityBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const BUBBLE_FONT = `${Math.max(6, 7 * zoom)}px "Press Start 2P", monospace`;
  const BUBBLE_FALLBACK_FONT = `${Math.max(7, 8 * zoom)}px monospace`;
  const BUBBLE_BG = 'rgba(30, 30, 46, 0.92)';
  const BUBBLE_BORDER = 'rgba(255, 255, 255, 0.3)';
  const BUBBLE_TEXT = '#e0e0e0';
  const BUBBLE_PADDING_X = 4 * zoom;
  const BUBBLE_PADDING_Y = 2 * zoom;
  const BUBBLE_OFFSET_Y = -30 * zoom; // Above character + emoji bubble
  const TAIL_SIZE = 3 * zoom;

  ctx.save();
  ctx.font = zoom >= 3 ? BUBBLE_FONT : BUBBLE_FALLBACK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const ch of characters) {
    if (ch.isSubagent) continue;
    const memberId = jcGetMemberForAgent(ch.id);
    if (!memberId) continue;
    const summary = jcGetActivitySummary(memberId);
    if (!summary) continue;

    const sittingOff = ch.state === CharacterState.TYPE ? -4 : 0;
    const screenX = offsetX + ch.x * zoom;
    const screenY = offsetY + (ch.y + sittingOff) * zoom + BUBBLE_OFFSET_Y;

    // Measure text
    const metrics = ctx.measureText(summary);
    const textW = metrics.width;
    const textH = Math.max(6, 7 * zoom);

    // Bubble background
    const bgX = screenX - textW / 2 - BUBBLE_PADDING_X;
    const bgY = screenY - textH - BUBBLE_PADDING_Y;
    const bgW = textW + BUBBLE_PADDING_X * 2;
    const bgH = textH + BUBBLE_PADDING_Y * 2;

    // Draw rounded-ish bubble (pixel art style = sharp corners)
    ctx.fillStyle = BUBBLE_BG;
    ctx.fillRect(bgX, bgY, bgW, bgH);
    ctx.strokeStyle = BUBBLE_BORDER;
    ctx.lineWidth = Math.max(1, zoom * 0.5);
    ctx.strokeRect(bgX, bgY, bgW, bgH);

    // Draw tail (small triangle pointing down)
    ctx.fillStyle = BUBBLE_BG;
    ctx.beginPath();
    ctx.moveTo(screenX - TAIL_SIZE, bgY + bgH);
    ctx.lineTo(screenX, bgY + bgH + TAIL_SIZE);
    ctx.lineTo(screenX + TAIL_SIZE, bgY + bgH);
    ctx.fill();

    // Draw text
    ctx.fillStyle = BUBBLE_TEXT;
    ctx.fillText(summary, screenX, screenY);
  }

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
