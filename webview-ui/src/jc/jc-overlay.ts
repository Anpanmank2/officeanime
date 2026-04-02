// ── Just Curious Virtual Office — Rendering Overlay ──────────────
// Renders JC-specific overlays on top of the base Pixel Agents canvas.
// Called after the base renderFrame() to add nameplates, exec icons,
// absence indicators, zone labels, and state bubbles.
// v2: Neon startup aesthetic — "who, where, what" management dashboard

import type { Character } from '../office/types.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import {
  jcGetActiveLiaisons,
  jcGetActivitySummary,
  jcGetDashboardMembers,
  jcGetDeptColor,
  jcGetDeptStats,
  jcGetDeskTaskStatus,
  jcGetExecPositions,
  jcGetMemberForAgent,
  jcGetMemberRuntime,
  jcGetNameplates,
  jcGetSpeechBubbles,
  jcGetStateColor,
  jcGetStats,
  jcIsActive,
} from './jc-state.js';
import type { JCBubbleType, JCState } from './jc-types.js';

// ── Constants ────────────────────────────────────────────────────
const NAMEPLATE_FONT = '7px "Press Start 2P", monospace';
const NAMEPLATE_FALLBACK_FONT = '8px monospace';
const NAMEPLATE_PADDING_X = 3;
const NAMEPLATE_PADDING_Y = 2;
const NAMEPLATE_OFFSET_Y = -2;

const ZONE_LABEL_FONT = '9px "Press Start 2P", monospace';
const ZONE_LABEL_FALLBACK_FONT = '10px monospace';

const EXEC_ICON_SIZE = 12;
const EXEC_LABEL_FONT = '6px "Press Start 2P", monospace';
const EXEC_LABEL_FALLBACK_FONT = '7px monospace';

const STATS_FALLBACK_FONT = '8px monospace';

// Bubble emoji sprites — status icons above characters
const BUBBLE_EMOJIS: Record<string, string> = {
  coding: '⚙️',
  thinking: '💭',
  reading: '🔍',
  reviewing: '👀',
  error: '❌',
  presenting: '📊',
  meeting: '🤝',
  coffee: '☕',
  idle: '⏳',
  // Break behavior variants
  sofa: '💤',
  arcade: '🎮',
  bookshelf: '📚',
};

// ── Neon Department Colors ───────────────────────────────────────
const DEPT_NEON: Record<string, { primary: string; glow: string; fill: string; text: string }> = {
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

// ── Zone labels ──────────────────────────────────────────────────
const ZONE_LABELS: Array<{ text: string; col: number; row: number; zone: string }> = [
  { text: 'EXEC AREA', col: 3, row: 2, zone: 'exec' },
  { text: 'DEV ZONE', col: 4, row: 7, zone: 'dev' },
  { text: 'MARKETING', col: 17, row: 7, zone: 'marketing' },
  { text: 'RESEARCH LAB', col: 4, row: 15, zone: 'research' },
  { text: 'MTG ROOM', col: 17, row: 15, zone: 'ops' },
];

// ── Glass walls ──────────────────────────────────────────────────
const GLASS_WALLS: Array<{ col: number; row: number; width: number; height: number }> = [
  { col: 1, row: 6, width: 24, height: 1 },
  { col: 12, row: 7, width: 1, height: 7 },
  { col: 1, row: 14, width: 24, height: 1 },
  { col: 12, row: 15, width: 1, height: 7 },
];

// ── Liaison beam effect ──────────────────────────────────────────
const LIAISON_LINE_WIDTH = 2;
const LIAISON_PARTICLE_SIZE = 3;

// ── Zone background tints ───────────────────────────────────────

const ZONE_AREAS: Array<{
  zone: string;
  col: number;
  row: number;
  width: number;
  height: number;
}> = [
  { zone: 'exec', col: 1, row: 2, width: 10, height: 4 },
  { zone: 'dev', col: 1, row: 7, width: 11, height: 7 },
  { zone: 'marketing', col: 13, row: 7, width: 12, height: 7 },
  { zone: 'research', col: 1, row: 15, width: 11, height: 7 },
  { zone: 'ops', col: 13, row: 15, width: 12, height: 7 },
];

function renderZoneBackgrounds(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
): void {
  ctx.save();
  const deptStats = jcGetDeptStats();

  for (const area of ZONE_AREAS) {
    const neon = DEPT_NEON[area.zone];
    if (!neon) continue;

    const x = offsetX + area.col * s;
    const y = offsetY + area.row * s;
    const w = area.width * s;
    const h = area.height * s;

    // Check if any members are active in this zone
    const deptKey =
      area.zone === 'dev' ? 'engineering' : area.zone === 'ops' ? 'engineering' : area.zone;
    const stats = deptStats[deptKey];
    const hasActive = stats ? stats.present > 0 : false;

    // Subtle zone tint — brighter when members are active
    ctx.fillStyle = neon.glow;
    ctx.globalAlpha = hasActive ? 0.08 : 0.03;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Glass wall renderer (neon-enhanced) ──────────────────────────

function renderGlassWalls(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  ctx.save();
  const now = Date.now();

  for (const wall of GLASS_WALLS) {
    const x = offsetX + wall.col * s;
    const y = offsetY + wall.row * s;
    const w = wall.width * s;
    const h = wall.height * s;

    // Animated pulse for neon glow
    const pulse = (Math.sin(now / 2000) + 1) / 2;

    // Glass panel fill — dark with subtle blue tint
    ctx.fillStyle = 'rgba(10, 15, 35, 0.55)';
    ctx.fillRect(x, y, w, h);

    // Neon border glow (outer)
    const glowAlpha = 0.15 + pulse * 0.1;
    ctx.strokeStyle = `rgba(0, 180, 255, ${glowAlpha})`;
    ctx.lineWidth = Math.max(3, zoom * 1.5);
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

    // Inner neon line
    ctx.strokeStyle = `rgba(0, 240, 255, ${0.35 + pulse * 0.15})`;
    ctx.lineWidth = Math.max(1, zoom * 0.5);
    ctx.strokeRect(x, y, w, h);

    // Reflection highlight (scanline effect)
    ctx.fillStyle = `rgba(0, 240, 255, ${0.06 + pulse * 0.04})`;
    if (wall.height === 1) {
      ctx.fillRect(x, y, w, Math.max(1, zoom * 0.3));
    } else {
      ctx.fillRect(x, y, Math.max(1, zoom * 0.3), h);
    }

    // Traveling light dot along glass
    if (zoom >= 2) {
      const speed = wall.height === 1 ? w : h;
      const travel = ((now / 30) % speed) / speed;
      const dotSize = Math.max(2, zoom);
      ctx.fillStyle = `rgba(0, 240, 255, ${0.5 + pulse * 0.3})`;
      if (wall.height === 1) {
        ctx.fillRect(x + w * travel - dotSize / 2, y, dotSize, h);
      } else {
        ctx.fillRect(x, y + h * travel - dotSize / 2, w, dotSize);
      }
    }
  }

  ctx.restore();
}

// ── Main render function ─────────────────────────────────────────

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

  // 0a. Zone background tints (lowest layer)
  renderZoneBackgrounds(ctx, offsetX, offsetY, s);

  // 0b. Neon glass walls
  renderGlassWalls(ctx, offsetX, offsetY, s, zoom);

  // 1. Active desk glow rings (behind nameplates)
  renderActiveDeskGlow(ctx, offsetX, offsetY, s, zoom);

  // 2. Department signs (neon wall-mounted plaques)
  renderDepartmentSigns(ctx, offsetX, offsetY, s, zoom);

  // 3. Always-on mini nameplates with state dots
  renderAlwaysOnNameplates(ctx, offsetX, offsetY, s, zoom);

  // 4. Task status indicators on desks
  renderTaskIndicators(ctx, offsetX, offsetY, s, zoom);

  // 5. Hover nameplate (detailed, shown on mouse hover)
  if (hoverTileCol !== undefined && hoverTileRow !== undefined) {
    renderHoverNameplate(ctx, offsetX, offsetY, s, zoom, hoverTileCol, hoverTileRow);
  }

  // 6. Exec icons
  renderExecIcons(ctx, offsetX, offsetY, s, zoom);

  // 7. Department liaison beams
  renderLiaisonBeams(ctx, offsetX, offsetY, s, zoom);

  // 8. JC state bubbles above characters
  if (characters) {
    renderJCCharacterBubbles(ctx, characters, offsetX, offsetY, zoom);
  }

  // 9. Activity summary speech bubbles
  if (characters) {
    renderActivityBubbles(ctx, characters, offsetX, offsetY, zoom);
  }

  // 10. Cross-department speech bubbles (text chat)
  if (characters) {
    renderSpeechBubbles(ctx, characters, offsetX, offsetY, zoom);
  }

  // 11. Team HUD (top-right)
  renderTeamHUD(ctx, canvasWidth);
}

// ── Active desk glow ─────────────────────────────────────────────

function renderActiveDeskGlow(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  if (zoom < 2) return;
  const members = jcGetDashboardMembers();
  const now = Date.now();
  ctx.save();

  for (const m of members) {
    if (!m.isPresent) continue;
    if (m.state === 'idle' || m.state === 'arriving' || m.state === 'leaving') continue;

    const cx = offsetX + (m.deskCol + 0.5) * s;
    const cy = offsetY + (m.deskRow + 0.5) * s;
    const pulse = (Math.sin(now / 800 + m.deskCol) + 1) / 2;
    const radius = s * 0.7 + pulse * s * 0.15;

    // Outer glow ring
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, `${m.stateColor}10`);
    grad.addColorStop(1, `${m.stateColor}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Neon ring outline
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = m.stateColor;
    ctx.globalAlpha = 0.2 + pulse * 0.15;
    ctx.lineWidth = Math.max(1, zoom * 0.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Always-on mini nameplates ────────────────────────────────────

function renderAlwaysOnNameplates(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  if (zoom < 2) return;
  const members = jcGetDashboardMembers();
  const miniFont = zoom >= 3 ? '5px "Press Start 2P", monospace' : '6px monospace';

  ctx.save();
  ctx.font = miniFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const m of members) {
    const cx = offsetX + (m.deskCol + 0.5) * s;
    const ty = offsetY + (m.deskRow + 1) * s + 1 * zoom; // Below desk tile

    // Short name label
    const label = m.nameEn.length > 10 ? m.nameEn.slice(0, 9) + '.' : m.nameEn;
    const metrics = ctx.measureText(label);
    const textW = metrics.width;
    const textH = zoom >= 3 ? 5 : 6;
    const padX = 2;
    const padY = 1;

    const bgX = cx - textW / 2 - padX;
    const bgY = ty - padY;
    const bgW = textW + padX * 2;
    const bgH = textH + padY * 2;

    // Background
    ctx.fillStyle = m.isPresent ? 'rgba(10, 15, 35, 0.85)' : 'rgba(10, 10, 20, 0.6)';
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Left accent bar (department color)
    const accentW = Math.max(1, Math.round(zoom * 0.3));
    ctx.fillStyle = m.isPresent ? m.deptColor : `${m.deptColor}44`;
    ctx.fillRect(bgX, bgY, accentW, bgH);

    // State dot (right side)
    const dotR = Math.max(1.5, zoom * 0.4);
    const dotX = bgX + bgW - dotR - 1;
    const dotY = bgY + bgH / 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = m.stateColor;
    ctx.fill();

    // Name text
    ctx.fillStyle = m.isPresent ? '#ccccdd' : '#555566';
    ctx.fillText(label, cx - dotR, ty);
  }

  ctx.restore();
}

// ── Department signs (neon style) ────────────────────────────────

function renderDepartmentSigns(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  ctx.save();
  const now = Date.now();

  for (const label of ZONE_LABELS) {
    const cx = offsetX + (label.col + 0.5) * s;
    const y = offsetY + label.row * s;

    const neon = DEPT_NEON[label.zone] ?? {
      primary: '#888888',
      glow: 'rgba(136,136,136,0.3)',
      fill: '#222222',
      text: '#cccccc',
    };

    const signFont = zoom >= 3 ? ZONE_LABEL_FONT : ZONE_LABEL_FALLBACK_FONT;
    ctx.font = signFont;
    const textMetrics = ctx.measureText(label.text);
    const textW = textMetrics.width;
    const textH = zoom >= 3 ? 9 : 10;

    const padX = Math.max(6, 7 * zoom * 0.4);
    const padY = Math.max(4, 5 * zoom * 0.4);
    const signW = textW + padX * 2;
    const signH = textH + padY * 2;
    const signX = cx - signW / 2;
    const signY = y;

    // Neon glow pulse
    const pulse = (Math.sin(now / 1500 + label.col * 0.5) + 1) / 2;

    // Outer neon glow (blurred effect via multiple layers)
    ctx.globalAlpha = 0.15 + pulse * 0.1;
    ctx.fillStyle = neon.glow;
    ctx.fillRect(signX - 3, signY - 3, signW + 6, signH + 6);
    ctx.globalAlpha = 1;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(signX + 2, signY + 2, signW, signH);

    // Dark fill
    ctx.fillStyle = neon.fill;
    ctx.fillRect(signX, signY, signW, signH);

    // Neon border (outer frame)
    ctx.strokeStyle = neon.primary;
    ctx.lineWidth = Math.max(2, Math.round(zoom * 0.6));
    ctx.globalAlpha = 0.7 + pulse * 0.3;
    ctx.strokeRect(signX, signY, signW, signH);
    ctx.globalAlpha = 1;

    // Inner highlight (subtle scanline at top)
    ctx.fillStyle = `rgba(255,255,255,0.08)`;
    ctx.fillRect(signX + 1, signY + 1, signW - 2, 1);

    // Left accent bar
    const borderW = Math.max(2, Math.round(zoom * 0.5));
    ctx.fillStyle = neon.primary;
    ctx.globalAlpha = 0.6 + pulse * 0.2;
    ctx.fillRect(signX, signY, borderW, signH);
    ctx.globalAlpha = 1;

    // Mounting bracket pins
    const pinW = Math.max(2, Math.round(zoom * 0.5));
    const pinH = Math.max(3, Math.round(zoom * 0.7));
    const pinY = signY - pinH;
    const bracketColor = neon.primary;

    const lx = cx - signW * 0.28;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(lx - pinW / 2 + 1, pinY + 1, pinW, pinH);
    ctx.fillStyle = bracketColor;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(lx - pinW / 2, pinY, pinW, pinH);

    const rx = cx + signW * 0.28;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.globalAlpha = 1;
    ctx.fillRect(rx - pinW / 2 + 1, pinY + 1, pinW, pinH);
    ctx.fillStyle = bracketColor;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(rx - pinW / 2, pinY, pinW, pinH);
    ctx.globalAlpha = 1;

    // Text (neon glow effect)
    ctx.font = signFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Text glow layer
    ctx.globalAlpha = 0.3 + pulse * 0.15;
    ctx.fillStyle = neon.primary;
    ctx.fillText(label.text, cx + 0.5, signY + signH / 2 + 0.5);
    // Main text
    ctx.globalAlpha = 1;
    ctx.fillStyle = neon.text;
    ctx.fillText(label.text, cx, signY + signH / 2);
  }

  ctx.restore();
}

// ── Hover nameplate (detailed) ───────────────────────────────────

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
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bgX + 1, bgY + 1, bgW, bgH);

  // Background: dark glass
  ctx.fillStyle = 'rgba(10, 15, 35, 0.92)';
  ctx.fillRect(bgX, bgY, bgW, bgH);

  // Neon border
  const zoneNeon = DEPT_NEON[np.zone];
  const borderColor = zoneNeon ? zoneNeon.primary : 'rgba(255,255,255,0.25)';
  ctx.strokeStyle = borderColor;
  ctx.globalAlpha = np.isPresent ? 0.8 : 0.3;
  ctx.lineWidth = 1;
  ctx.strokeRect(bgX, bgY, bgW, bgH);
  ctx.globalAlpha = 1;

  // Left accent bar (department neon)
  if (zoneNeon) {
    const accentW = Math.max(2, Math.round(zoom * 0.5));
    ctx.fillStyle = np.isPresent ? zoneNeon.primary : `${zoneNeon.primary}44`;
    ctx.fillRect(bgX, bgY, accentW, bgH);
  }

  // Text
  const stateColor = np.isPresent ? '#00ff88' : '#555566';
  ctx.fillStyle = stateColor;
  ctx.fillText(text, x, y);

  ctx.restore();
}

// ── Task indicators ──────────────────────────────────────────────

const TASK_PENDING_COLOR = '#ffbf00';
const TASK_RUNNING_COLOR = '#39ff14';
const TASK_DONE_COLOR = '#00b4ff';
const TASK_ERROR_COLOR = '#ff3d3d';

function renderTaskIndicators(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const nameplates = jcGetNameplates();
  if (zoom < 2) return;

  ctx.save();

  for (const np of nameplates) {
    const task = jcGetDeskTaskStatus(np.col, np.row);
    if (!task) continue;

    const cx = offsetX + (np.col + 0.5) * s;
    const cy = offsetY + np.row * s - 2 * zoom;
    const iconSize = Math.max(4, 3 * zoom);

    if (task.status === 'pending') {
      ctx.beginPath();
      ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = TASK_PENDING_COLOR;
      ctx.globalAlpha = 0.8;
      ctx.fill();
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
      const pulse = (Math.sin(Date.now() / 300) + 1) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (iconSize / 2) * (0.8 + 0.2 * pulse), 0, Math.PI * 2);
      ctx.fillStyle = TASK_RUNNING_COLOR;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (task.status === 'done') {
      ctx.fillStyle = TASK_DONE_COLOR;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
      ctx.fill();
      const half = iconSize / 2;
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.35, cy);
      ctx.lineTo(cx - half * 0.05, cy + half * 0.3);
      ctx.lineTo(cx + half * 0.4, cy - half * 0.3);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, zoom * 0.4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (task.status === 'error') {
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

// ── Exec icons ───────────────────────────────────────────────────

function renderExecIcons(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const execs = jcGetExecPositions();
  const neon = DEPT_NEON['exec'];
  ctx.save();

  for (const exec of execs) {
    const x = offsetX + exec.col * s;
    const y = offsetY + exec.row * s;
    const iconS = EXEC_ICON_SIZE * zoom;

    // Portrait frame with neon border
    ctx.fillStyle = neon.fill;
    ctx.fillRect(x, y, iconS, iconS);
    ctx.strokeStyle = neon.primary;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, iconS, iconS);
    ctx.globalAlpha = 1;

    // Label below
    ctx.font = zoom >= 3 ? EXEC_LABEL_FONT : EXEC_LABEL_FALLBACK_FONT;
    ctx.fillStyle = neon.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(exec.label, x + iconS / 2, y + iconS + 2);
  }
  ctx.restore();
}

// ── Liaison beams (neon) ─────────────────────────────────────────

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

    const beamColor =
      liaison.fromZone === 'research'
        ? DEPT_NEON['research'].primary
        : DEPT_NEON['marketing'].primary;

    // Draw beam line with neon glow
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = beamColor;
    ctx.lineWidth = LIAISON_LINE_WIDTH * zoom + 2;
    ctx.globalAlpha = alpha * 0.15;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = beamColor;
    ctx.lineWidth = LIAISON_LINE_WIDTH * zoom;
    ctx.globalAlpha = alpha * 0.6;
    ctx.stroke();

    // Moving envelope icon along the beam
    const px = x1 + (x2 - x1) * progress;
    const py = y1 + (y2 - y1) * progress;

    // Envelope glow
    ctx.beginPath();
    ctx.arc(px, py, LIAISON_PARTICLE_SIZE * zoom * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = beamColor;
    ctx.globalAlpha = alpha * 0.25;
    ctx.fill();

    // Envelope emoji
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.max(8, 10 * zoom)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✉️', px, py);
  }

  ctx.restore();
}

// ── Team HUD (top-right) ─────────────────────────────────────────

function renderTeamHUD(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const stats = jcGetStats();
  const deptCounts = jcGetDeptStats();
  const members = jcGetDashboardMembers();

  ctx.save();
  ctx.font = STATS_FALLBACK_FONT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  const lineHeight = 13;
  const rightMargin = 12;
  const topMargin = 4;
  const padding = 6;
  const dotRadius = 3;
  const statusDotR = 4;

  // Build department lines with status indicators
  const deptOrder = ['exec', 'engineering', 'marketing', 'research'];
  const deptLabels: Record<string, string> = {
    exec: 'EXEC',
    engineering: 'ENG',
    marketing: 'MKT',
    research: 'RES',
  };
  const deptLines: Array<{
    label: string;
    present: number;
    total: number;
    color: string;
    hasWorking: boolean;
  }> = [];
  for (const dept of deptOrder) {
    const count = deptCounts[dept];
    if (!count || count.total === 0) continue;
    const working = members.filter(
      (m) =>
        m.department === dept &&
        m.isPresent &&
        m.state !== 'idle' &&
        m.state !== 'arriving' &&
        m.state !== 'leaving',
    );
    deptLines.push({
      label: deptLabels[dept] ?? dept.toUpperCase(),
      present: count.present,
      total: count.total,
      color: jcGetDeptColor(dept),
      hasWorking: working.length > 0,
    });
  }

  // Active members (present & working) with activity info
  const activeMembers = members.filter(
    (m) => m.isPresent && m.state !== 'idle' && m.state !== 'arriving' && m.state !== 'leaving',
  );

  // Calculate box dimensions
  const headerText = `TEAM ${stats.present}/${stats.total}`;
  const headerMetrics = ctx.measureText(headerText);
  let maxWidth = headerMetrics.width + 20;

  for (const m of activeMembers) {
    // Name + state + optional activity
    const activity = m.activitySummary ? ` ${m.activitySummary.slice(0, 12)}` : '';
    const rowText = `${m.nameEn}${activity}`;
    const rowW = ctx.measureText(rowText).width + dotRadius * 2 + statusDotR * 2 + 16;
    if (rowW > maxWidth) maxWidth = rowW;
  }

  for (const line of deptLines) {
    const lineWidth =
      ctx.measureText(`${line.label} ${line.present}/${line.total}`).width + statusDotR * 2 + 12;
    if (lineWidth > maxWidth) maxWidth = lineWidth;
  }

  const showActiveList = activeMembers.length > 0;
  const separatorLines = showActiveList ? 1 : 0;
  const boxHeight =
    lineHeight + // header
    deptLines.length * lineHeight + // dept rows
    separatorLines * 8 + // separator
    (showActiveList ? activeMembers.length * lineHeight : 0) +
    padding * 2;

  const boxWidth = maxWidth + padding * 2;
  const boxX = canvasWidth - boxWidth - rightMargin;
  const boxY = topMargin;

  // Background with glass effect
  ctx.fillStyle = 'rgba(8, 10, 25, 0.88)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  // Neon border
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  // Top accent line
  ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
  ctx.fillRect(boxX, boxY, boxWidth, 1);

  // Header
  const textX = canvasWidth - rightMargin - padding;
  let textY = boxY + padding;

  ctx.font = STATS_FALLBACK_FONT;
  ctx.fillStyle = '#00f0ff';
  ctx.fillText(headerText, textX, textY);
  textY += lineHeight;

  // Department lines with status indicators (🟢/⚪/🔴)
  for (const line of deptLines) {
    const lineText = `${line.label} ${line.present}/${line.total}`;
    const lineW = ctx.measureText(lineText).width;

    // Status dot: 🟢 working, ⚪ present but idle, 🔴 no one
    const statusX = textX - lineW - statusDotR * 2 - 6;
    const statusY = textY + 5;
    ctx.beginPath();
    ctx.arc(statusX, statusY, statusDotR, 0, Math.PI * 2);
    if (line.hasWorking) {
      ctx.fillStyle = '#39ff14'; // green — active
    } else if (line.present > 0) {
      ctx.fillStyle = '#888899'; // gray — idle
    } else {
      ctx.fillStyle = '#ff3d3d'; // red — absent
    }
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Text
    ctx.fillStyle = line.present > 0 ? line.color : `${line.color}66`;
    ctx.fillText(lineText, textX, textY);
    textY += lineHeight;
  }

  // Active members section
  if (showActiveList) {
    // Separator line
    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.fillRect(boxX + padding, textY + 2, boxWidth - padding * 2, 1);
    textY += 8;

    for (const m of activeMembers) {
      // State dot
      ctx.beginPath();
      const nameLabel = m.nameEn.length > 10 ? m.nameEn.slice(0, 9) + '.' : m.nameEn;
      const activity = m.activitySummary ? ` ${m.activitySummary.slice(0, 12)}` : '';
      const fullText = `${nameLabel}${activity}`;
      const fullW = ctx.measureText(fullText).width;
      ctx.arc(textX - fullW - 8, textY + 5, dotRadius - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = m.stateColor;
      ctx.fill();

      // Name (bright) + activity (dimmer)
      ctx.fillStyle = '#ccccdd';
      ctx.fillText(nameLabel, textX - ctx.measureText(activity).width, textY);
      if (activity) {
        ctx.fillStyle = '#777790';
        ctx.fillText(activity, textX, textY);
      }
      textY += lineHeight;
    }
  }

  ctx.restore();
}

// ── Character bubbles ────────────────────────────────────────────

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
  const BUBBLE_BG = 'rgba(8, 10, 25, 0.92)';
  const BUBBLE_BORDER = 'rgba(0, 240, 255, 0.3)';
  const BUBBLE_TEXT = '#d0d0e8';
  const BUBBLE_PADDING_X = 4 * zoom;
  const BUBBLE_PADDING_Y = 2 * zoom;
  const BUBBLE_OFFSET_Y = -30 * zoom;
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

    const metrics = ctx.measureText(summary);
    const textW = metrics.width;
    const textH = Math.max(6, 7 * zoom);

    const bgX = screenX - textW / 2 - BUBBLE_PADDING_X;
    const bgY = screenY - textH - BUBBLE_PADDING_Y;
    const bgW = textW + BUBBLE_PADDING_X * 2;
    const bgH = textH + BUBBLE_PADDING_Y * 2;

    // Background
    ctx.fillStyle = BUBBLE_BG;
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Neon border
    ctx.strokeStyle = BUBBLE_BORDER;
    ctx.lineWidth = Math.max(1, zoom * 0.5);
    ctx.strokeRect(bgX, bgY, bgW, bgH);

    // Tail
    ctx.fillStyle = BUBBLE_BG;
    ctx.beginPath();
    ctx.moveTo(screenX - TAIL_SIZE, bgY + bgH);
    ctx.lineTo(screenX, bgY + bgH + TAIL_SIZE);
    ctx.lineTo(screenX + TAIL_SIZE, bgY + bgH);
    ctx.fill();

    // Text
    ctx.fillStyle = BUBBLE_TEXT;
    ctx.fillText(summary, screenX, screenY);
  }

  ctx.restore();
}

// ── Speech Bubbles (cross-department chat) ──────────────────────

/** Department border colors for speech bubbles */
const SPEECH_DEPT_COLORS: Record<string, string> = {
  engineering: '#4A90D9',
  marketing: '#50C878',
  research: '#9B59B6',
  exec: '#FFD700',
};

function renderSpeechBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const bubbles = jcGetSpeechBubbles();
  if (bubbles.length === 0) return;

  const FONT = zoom >= 3 ? '6px "Press Start 2P", monospace' : '7px monospace';
  const MAX_TEXT_WIDTH = 80 * zoom;
  const PADDING_X = 4 * zoom;
  const PADDING_Y = 3 * zoom;
  const OFFSET_Y = -36 * zoom;
  const TAIL_SIZE = 3 * zoom;
  const BORDER_WIDTH = Math.max(1.5, zoom * 0.6);

  ctx.save();
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const bubble of bubbles) {
    // Find the character for this member
    let charX: number | null = null;
    let charY: number | null = null;
    for (const ch of characters) {
      if (ch.isSubagent) continue;
      const memberId = jcGetMemberForAgent(ch.id);
      if (memberId === bubble.memberId) {
        const sittingOff = ch.state === CharacterState.TYPE ? -4 : 0;
        charX = offsetX + ch.x * zoom;
        charY = offsetY + (ch.y + sittingOff) * zoom;
        break;
      }
    }
    if (charX === null || charY === null) continue;

    // Fade out in last 500ms
    const elapsed = Date.now() - bubble.timestamp;
    const remaining = bubble.duration - elapsed;
    const alpha = remaining < 500 ? remaining / 500 : 1;
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;

    // Truncate text to fit
    let text = bubble.text;
    const metrics = ctx.measureText(text);
    if (metrics.width > MAX_TEXT_WIDTH) {
      while (ctx.measureText(text + '…').width > MAX_TEXT_WIDTH && text.length > 0) {
        text = text.slice(0, -1);
      }
      text += '…';
    }

    const textW = ctx.measureText(text).width;
    const textH = zoom >= 3 ? 6 : 7;

    const bgX = charX - textW / 2 - PADDING_X;
    const bgY = charY + OFFSET_Y - textH - PADDING_Y;
    const bgW = textW + PADDING_X * 2;
    const bgH = textH + PADDING_Y * 2;

    const deptColor = SPEECH_DEPT_COLORS[bubble.department] ?? '#888888';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bgX + 1, bgY + 1, bgW, bgH);

    // Background — dark with dept tint
    ctx.fillStyle = 'rgba(15, 18, 35, 0.93)';
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Department-colored border (pixel art dotted style)
    ctx.strokeStyle = deptColor;
    ctx.lineWidth = BORDER_WIDTH;
    ctx.strokeRect(bgX, bgY, bgW, bgH);

    // Left accent bar (department color)
    const accentW = Math.max(2, Math.round(zoom * 0.6));
    ctx.fillStyle = deptColor;
    ctx.fillRect(bgX, bgY, accentW, bgH);

    // Tail pointing down to character
    ctx.fillStyle = 'rgba(15, 18, 35, 0.93)';
    ctx.beginPath();
    ctx.moveTo(charX - TAIL_SIZE, bgY + bgH);
    ctx.lineTo(charX, bgY + bgH + TAIL_SIZE);
    ctx.lineTo(charX + TAIL_SIZE, bgY + bgH);
    ctx.fill();
    // Tail border
    ctx.strokeStyle = deptColor;
    ctx.lineWidth = Math.max(1, zoom * 0.4);
    ctx.beginPath();
    ctx.moveTo(charX - TAIL_SIZE, bgY + bgH);
    ctx.lineTo(charX, bgY + bgH + TAIL_SIZE);
    ctx.lineTo(charX + TAIL_SIZE, bgY + bgH);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#e0e0f0';
    ctx.fillText(text, charX, charY + OFFSET_Y);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── JC Bubble ────────────────────────────────────────────────────

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

  const bx = charX;
  const by = charY - 20 * zoom;
  const bgSize = 12 * zoom;

  // Neon-tinted bubble background
  const breakTypes = new Set(['coffee', 'sofa', 'arcade', 'bookshelf']);
  const stateForColor = breakTypes.has(bubbleType ?? '') ? 'break' : (bubbleType as string);
  const bubbleColor = jcGetStateColor(stateForColor as JCState);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(bx, by, bgSize / 2, 0, Math.PI * 2);
  ctx.fill();

  // Subtle neon ring
  ctx.beginPath();
  ctx.arc(bx, by, bgSize / 2 + 1, 0, Math.PI * 2);
  ctx.strokeStyle = bubbleColor;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Draw emoji/symbol
  if (bubbleType === 'reviewing') {
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
