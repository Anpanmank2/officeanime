// ── Just Curious Virtual Office — Rendering Overlay ──────────────
// Renders JC-specific overlays on top of the base Pixel Agents canvas.
// Called after the base renderFrame() to add nameplates, exec icons,
// absence indicators, zone labels, and state bubbles.

import type { Character } from '../office/types.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import {
  jcGetActiveLiaisons,
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
const NAMEPLATE_BG = 'rgba(0, 0, 0, 0.7)';
const NAMEPLATE_TEXT_COLOR = '#ffffff';
const NAMEPLATE_PRESENT_COLOR = '#00ff88';
const NAMEPLATE_ABSENT_COLOR = '#555555';
const NAMEPLATE_PADDING_X = 3;
const NAMEPLATE_PADDING_Y = 2;
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

// Zone color themes
const ZONE_COLORS: Record<string, string> = {
  exec: 'rgba(200, 180, 120, 0.35)',
  entrance: 'rgba(255, 255, 255, 0.25)',
  poker: 'rgba(255, 255, 255, 0.20)',
  break: 'rgba(255, 140, 60, 0.30)',
  dev: 'rgba(90, 140, 255, 0.30)',
  marketing: 'rgba(255, 107, 138, 0.30)',
  research: 'rgba(140, 221, 106, 0.30)',
  ops: 'rgba(180, 140, 255, 0.30)',
};

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
): void {
  if (!jcIsActive()) return;

  const s = TILE_SIZE * zoom;

  // 1. Zone labels (background, lowest layer)
  renderZoneLabels(ctx, offsetX, offsetY, s, zoom);

  // 2. Absence indicators (dim dots on empty desks)
  renderAbsenceIndicators(ctx, offsetX, offsetY, s, zoom);

  // 2.5. Task status indicators on desks
  renderTaskIndicators(ctx, offsetX, offsetY, s, zoom);

  // 3. Name plates (above desks)
  renderNamePlates(ctx, offsetX, offsetY, s, zoom);

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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (const label of ZONE_LABELS) {
    const x = offsetX + label.col * s;
    const y = offsetY + label.row * s;
    const zoneColor = ZONE_COLORS[label.zone] ?? ZONE_LABEL_COLOR;

    // Draw zone label with department-specific color
    ctx.font = zoom >= 3 ? ZONE_LABEL_FONT : ZONE_LABEL_FALLBACK_FONT;
    ctx.fillStyle = zoneColor;
    ctx.fillText(label.text, x, y);

    // Draw a subtle underline accent for department zones
    if (label.zone === 'dev' || label.zone === 'marketing' || label.zone === 'research') {
      const metrics = ctx.measureText(label.text);
      ctx.fillStyle = zoneColor;
      ctx.fillRect(x, y + (zoom >= 3 ? 11 : 12), metrics.width, Math.max(1, zoom * 0.5));
    }
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
    const textH = 8;

    const bgX = x - textW / 2 - NAMEPLATE_PADDING_X;
    const bgY = y - textH - NAMEPLATE_PADDING_Y;
    const bgW = textW + NAMEPLATE_PADDING_X * 2;
    const bgH = textH + NAMEPLATE_PADDING_Y * 2;

    // Background
    ctx.fillStyle = NAMEPLATE_BG;
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Left accent bar (department color)
    const zoneColor = NAMEPLATE_ZONE_COLORS[np.zone];
    if (zoneColor) {
      const accentW = Math.max(1, zoom * 0.5);
      ctx.fillStyle = np.isPresent ? zoneColor : `${zoneColor}44`;
      ctx.fillRect(bgX, bgY, accentW, bgH);
    }

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
