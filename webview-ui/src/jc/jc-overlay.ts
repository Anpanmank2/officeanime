// ── Just Curious Virtual Office — Rendering Overlay ──────────────
// Renders JC-specific overlays on top of the base Pixel Agents canvas.
// Called after the base renderFrame() to add nameplates, exec icons,
// absence indicators, zone labels, and state bubbles.
// v2: Neon startup aesthetic — "who, where, what" management dashboard

import type { Character } from '../office/types.js';
import { isSittingState, TILE_SIZE } from '../office/types.js';
import {
  gameGetCompanyScore,
  gameGetMember,
  gameGetPreview,
  gameGetRoutePreview,
  gameGetTodayCount,
  gameTickGauges,
  type GameTier,
  TIER_GLYPH,
} from './game-state.js';
import {
  ABSENT_DESK_OVERLAY,
  ABSENT_SLATE,
  BUBBLE_EMOJIS,
  DEPT_LABELS,
  DEPT_NEON,
  FOCUS_WORK_COUNT,
  IDLE_MURMUR_CYCLE_MS,
  IDLE_MURMUR_LINES,
  IDLE_MURMUR_ON_MS,
  IDLE_ZZZ_AFTER_MS,
  MAIL_FLIGHT_ARC_TILES,
  OCCUPANCY_CHIP_COLORS,
  OFFICE_CLOSED_SUBTITLE,
  OFFICE_CLOSED_TEXT_Y_RATIO,
  OFFICE_CLOSED_TITLE,
  OFFICE_CLOSED_TITLE_COLOR,
  OFFICE_DIM_RGB,
  OFFICE_HEARTBEAT_LABEL_COLOR,
  OFFICE_HEARTBEAT_RING_COLOR,
  OFFICE_SECRETARY_SEAT,
  PET_TILE,
  SPEECH_BUBBLE_COLORS,
  STATUS_APPROVAL_EMOJI,
  STATUS_FOCUS_EMOJI,
  STATUS_ICON_OFFSET_PX,
  TASK_STATUS_COLORS,
  ZONE_LABEL_TEXT,
  ZONE_LIGHT_TINTS,
} from './jc-constants.js';
import {
  jcGetActiveLiaisons,
  jcGetActiveMailFlights,
  jcGetActivitySummary,
  jcGetDashboardMembers,
  jcGetDeptColor,
  jcGetDeskPosition,
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
import { computeDeptOccupancy, computeMemberWorkloads } from './karte-state.js';
import { officeHoursRenderState } from './office-hours-state.js';
import { jcGetPet } from './pet-state.js';
import { getPlans } from './plan-state.js';
import { getRequestFlow } from './request-flow-state.js';

// ── Rendering Constants (overlay-specific) ───────────────────────
const NAMEPLATE_FONT = '7px "Press Start 2P", monospace';
const NAMEPLATE_FALLBACK_FONT = '8px monospace';
const NAMEPLATE_PADDING_X = 3;
const NAMEPLATE_PADDING_Y = 2;
const NAMEPLATE_OFFSET_Y = -2;

// 日本語ラベル (2026-07-03 藤井 spec §1): 日本語glyphは Press Start 2P に無く
// スタック内の monospace に落ちるため bold を付与して視認性を確保する。
const ZONE_LABEL_FONT = 'bold 9px "Press Start 2P", monospace';
const ZONE_LABEL_FALLBACK_FONT = 'bold 10px monospace';

const EXEC_ICON_SIZE = 12;
const EXEC_LABEL_FONT = '6px "Press Start 2P", monospace';
const EXEC_LABEL_FALLBACK_FONT = '7px monospace';

const STATS_FALLBACK_FONT = '8px monospace';

// ── Zone labels ──────────────────────────────────────────────────
// 文言は ZONE_LABEL_TEXT (jc-constants) に集約 — P3 差し替えは定数側で行う。
// 2026-07-03 藤井 layout spec §1: verify(検証室)/hall(殿堂) を転用追加。
const ZONE_LABELS: Array<{ text: string; col: number; row: number; zone: string }> = [
  { text: ZONE_LABEL_TEXT.exec, col: 10, row: 2, zone: 'exec' },
  { text: ZONE_LABEL_TEXT.marketing, col: 4, row: 7, zone: 'marketing' },
  { text: ZONE_LABEL_TEXT.research, col: 17, row: 7, zone: 'research' },
  { text: ZONE_LABEL_TEXT.dev, col: 4, row: 15, zone: 'dev' },
  { text: ZONE_LABEL_TEXT.ops, col: 17, row: 15, zone: 'ops' },
  { text: ZONE_LABEL_TEXT.verify, col: 2, row: 2, zone: 'verify' },
  { text: ZONE_LABEL_TEXT.hall, col: 20, row: 2, zone: 'hall' },
];

// ゾーン → 部署 (稼働チップ / 照明の実データ参照キー)。
// ops(ラウンジ)/verify(検証室)/hall(殿堂) は所属 roster を持たない共用ゾーン → null
// (チップ非表示・照明は全社稼働率に連動)。
const ZONE_TO_DEPT: Record<string, string | null> = {
  exec: 'exec',
  marketing: 'marketing',
  research: 'research',
  dev: 'engineering',
  ops: null,
  verify: null,
  hall: null,
};

// ── Glass walls ──────────────────────────────────────────────────
const GLASS_WALLS: Array<{ col: number; row: number; width: number; height: number }> = [];

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
  { zone: 'exec', col: 7, row: 2, width: 10, height: 4 },
  { zone: 'marketing', col: 1, row: 6, width: 12, height: 8 },
  { zone: 'research', col: 13, row: 6, width: 12, height: 8 },
  { zone: 'dev', col: 1, row: 15, width: 12, height: 7 },
  { zone: 'ops', col: 13, row: 15, width: 12, height: 7 },
  // 2026-07-03 藤井 layout spec §1 転用: 上段左=検証室 / 上段右=殿堂
  { zone: 'verify', col: 1, row: 2, width: 6, height: 4 },
  { zone: 'hall', col: 18, row: 2, width: 7, height: 4 },
];

/** ゾーンの稼働率% (分母=roster)。共用ゾーンは全社稼働率。
 *  稼働の定義は R1 正本 (未完了しごと保有 = computeDeptOccupancy) に統一。 */
function zoneWorkingRate(
  zone: string,
  deptStats: Record<string, { present: number; total: number; working: number }>,
): number {
  const deptKey = ZONE_TO_DEPT[zone];
  if (deptKey) {
    const stats = deptStats[deptKey];
    return stats && stats.total > 0 ? (stats.working / stats.total) * 100 : 0;
  }
  // 共用ゾーン (ラウンジ/検証室/殿堂): 全社の稼働率に連動
  let working = 0;
  let total = 0;
  for (const stats of Object.values(deptStats)) {
    working += stats.working;
    total += stats.total;
  }
  return total > 0 ? (working / total) * 100 : 0;
}

// §2(c) ゾーン照明=稼働率メタファー: 3段階 (≥50% アンバー灯 / 1-49% 淡灯 / 0% 消灯)
function renderZoneBackgrounds(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
): void {
  ctx.save();
  const deptStats = computeDeptOccupancy();

  for (const area of ZONE_AREAS) {
    const x = offsetX + area.col * s;
    const y = offsetY + area.row * s;
    const w = area.width * s;
    const h = area.height * s;

    const rate = zoneWorkingRate(area.zone, deptStats);
    ctx.fillStyle =
      rate >= 50 ? ZONE_LIGHT_TINTS.high : rate > 0 ? ZONE_LIGHT_TINTS.mid : ZONE_LIGHT_TINTS.off;
    ctx.fillRect(x, y, w, h);
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
    ctx.fillStyle = 'rgba(10, 15, 35, 0.85)';
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

  // ── R2 営業状態 (2026-07-04 藤井 spec): CLOSED (店じまい) 中は稼働系の発光を
  // 全 off にして「静けさ」を作る。減光は全面 dim レイヤ 1 枚に一本化するため、
  // ゾーン消灯 tint / 不在デスク暗転 / デスク glow / 品質ゲージ / チップ発光 /
  // ネームプレート / 稼働アイコンは asleep(=closed) では描かない (二重減光回避)。
  const office = officeHoursRenderState(Date.now());
  const asleep = office.phase === 'closed';

  // 0a. Zone background tints (lowest layer) — asleep は全面dimに一本化
  if (!asleep) renderZoneBackgrounds(ctx, offsetX, offsetY, s);

  // 0b. Neon glass walls (構造・薄く残す)
  renderGlassWalls(ctx, offsetX, offsetY, s, zoom);

  // 0c. §2(a) 不在デスクの空席暗転 (家具の上・ラベル/プレートの下)
  if (!asleep) renderAbsentDeskOverlays(ctx, offsetX, offsetY, s);

  // 1. Active desk glow rings (behind nameplates) — CLOSED で off
  if (!asleep) renderActiveDeskGlow(ctx, offsetX, offsetY, s, zoom);

  // 2. Department signs (neon wall-mounted plaques)
  renderDepartmentSigns(ctx, offsetX, offsetY, s, zoom);

  // 3. Always-on mini nameplates with state dots — CLOSED で off (静けさ)
  if (!asleep) renderAlwaysOnNameplates(ctx, offsetX, offsetY, s, zoom);

  // 4. Task status indicators on desks
  if (!asleep) renderTaskIndicators(ctx, offsetX, offsetY, s, zoom);

  // 4a. Slice1: quality gauge bars (speed reflects affinity — AC-1 visual) — CLOSED で off
  if (!asleep) renderQualityGauge(ctx, offsetX, offsetY, s, zoom);

  // 4b. Slice1: affinity ◎/△/✗ badges above characters
  if (!asleep) renderAffinityBadges(ctx, offsetX, offsetY, s, zoom);

  // 5. Hover nameplate (detailed, shown on mouse hover)
  if (hoverTileCol !== undefined && hoverTileRow !== undefined) {
    renderHoverNameplate(ctx, offsetX, offsetY, s, zoom, hoverTileCol, hoverTileRow);
  }

  // 6. Exec icons
  renderExecIcons(ctx, offsetX, offsetY, s, zoom);

  // 6b. Owner's companion (agent-pet) in the exec room — no-op when absent
  renderPetCompanion(ctx, offsetX, offsetY, s, zoom);

  // 7. Department liaison beams
  renderLiaisonBeams(ctx, offsetX, offsetY, s, zoom);

  // 7.5. R5 ✉️メール飛翔 (依頼発行=委任の実イベント駆動)
  if (characters) {
    renderMailFlights(ctx, characters, offsetX, offsetY, s, zoom);
  }

  // 8. R2 状態表示 v2 (Owner設計 5種・頭上統一オフセット・顔に被せない) — CLOSED で off
  if (characters && !asleep) {
    renderMemberStatusIcons(ctx, characters, offsetX, offsetY, zoom);
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

  // 12. Routing hint (screen-space) while a card hovers over a target zone.
  renderRouteHint(ctx, canvasWidth);

  // 13. R2 営業状態 (2026-07-04 藤井 spec §2-§4): 全面 dim / 店じまい文言 /
  // 秘書巡回リング。map+characters+overlay 全部の上に載せて一様に減光する
  // (故に最後に描く)。QC hook __JC_OFFICE_QC もここで公開。
  renderOfficeHours(ctx, office, offsetX, offsetY, s);
}

// ── R2 営業状態レイヤ (全面dim + 店じまい文言 + 秘書巡回リング) ──────────────
function renderOfficeHours(
  ctx: CanvasRenderingContext2D,
  office: ReturnType<typeof officeHoursRenderState>,
  offsetX: number,
  offsetY: number,
  s: number,
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // (a) 全面 dim レイヤ 1 枚 (map+characters+overlay を一様に減光)。
  if (office.dimAlpha > 0.001) {
    ctx.save();
    ctx.fillStyle = `rgba(${OFFICE_DIM_RGB}, ${office.dimAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  // (b) 店じまい文言 (中央やや下・背景なし・点滅なし)。dim の上に静かに。
  if (office.textAlpha > 0.001) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = cw / 2;
    const cy = ch * OFFICE_CLOSED_TEXT_Y_RATIO;
    // 主文 18px / 副文 13px (canvas は device-px・dpr 反映)。
    const titlePx = Math.round(18 * dpr);
    const subPx = Math.round(13 * dpr);
    ctx.globalAlpha = office.textAlpha;
    ctx.font = `${titlePx}px "Press Start 2P", sans-serif`;
    ctx.fillStyle = OFFICE_CLOSED_TITLE_COLOR;
    ctx.fillText(OFFICE_CLOSED_TITLE, cx, cy);
    // 副文はスレート明・やや薄く。
    ctx.globalAlpha = office.textAlpha * 0.9;
    ctx.font = `${subPx}px "Press Start 2P", sans-serif`;
    ctx.fillStyle = OFFICE_HEARTBEAT_LABEL_COLOR;
    ctx.fillText(OFFICE_CLOSED_SUBTITLE, cx, cy + titlePx + 10 * dpr);
    ctx.restore();
  }

  // (c) 秘書巡回リング (office_heartbeat のワンショット・既存 glow 流用・歩行なし)。
  // 秘書の席 (8,4) 足元に半径 0→大・alpha 0.5→0 のアンバーリング。CLOSED でも
  // dim の上に薄く出す (見守り感)。
  if (office.ringProgress !== null) {
    const p = office.ringProgress;
    const cx = offsetX + (OFFICE_SECRETARY_SEAT.col + 0.5) * s;
    const cy = offsetY + (OFFICE_SECRETARY_SEAT.row + 1) * s; // 足元
    const radius = s * (0.4 + p * 1.6);
    const alpha = 0.5 * (1 - p);
    ctx.save();
    ctx.strokeStyle = `rgba(${OFFICE_HEARTBEAT_RING_COLOR}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(2, s * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // (d) QC hook 公開 (表示検証専用 — skill: pixel-office-canvas-qc-hooks 準拠)。
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__JC_OFFICE_QC = {
      state: office.phase,
      dimAlpha: Number(office.dimAlpha.toFixed(3)),
      lastHeartbeat: office.lastHeartbeatAt,
      ringActive: office.ringProgress !== null,
    };
  }
}

// ── Living-loop routing hint: "→ 秘書へ委任" / "→ Engineering へ委任" ──
function renderRouteHint(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const label = gameGetRoutePreview();
  if (!label) return;
  const text = `→ ${label} へ委任`;
  ctx.save();
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = 10;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 22;
  const x = Math.round(canvasWidth / 2 - w / 2);
  const y = 92; // clear the top command ticker band (DOM overlay sits at the very top)
  // Hard pixel-art frame (sharp corners, hard shadow).
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = 'rgba(38, 43, 47, 0.95)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#39ff14';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
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
  const workloads = computeMemberWorkloads();
  const now = Date.now();
  ctx.save();

  for (const m of members) {
    if (!m.isPresent) continue;
    // R1 統一定義: 稼働 = 未完了の生きたしごとを保有
    if ((workloads.get(m.memberId)?.active.length ?? 0) === 0) continue;

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
  const workloads = computeMemberWorkloads();
  const miniFont = zoom >= 3 ? '5px "Press Start 2P", monospace' : '6px monospace';

  ctx.save();
  ctx.font = miniFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const m of members) {
    const cx = offsetX + (m.deskCol + 0.5) * s;
    const ty = offsetY + (m.deskRow + 1) * s + 1 * zoom; // Below desk tile

    // §2(a) 3状態 (R1 統一定義): 働き=未完了しごと保有 / 出社アイドル=在席・保有0 / 不在
    const hasWork = (workloads.get(m.memberId)?.active.length ?? 0) > 0;
    const isIdleish = m.isPresent && !hasWork;
    ctx.globalAlpha = m.isPresent && !isIdleish ? 1 : 0.6;

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

    // Left accent bar (department color; 不在はスレート)
    const accentW = Math.max(1, Math.round(zoom * 0.3));
    ctx.fillStyle = m.isPresent ? m.deptColor : ABSENT_SLATE;
    ctx.fillRect(bgX, bgY, accentW, bgH);

    // State dot (right side)
    const dotR = Math.max(1.5, zoom * 0.4);
    const dotX = bgX + bgW - dotR - 1;
    const dotY = bgY + bgH / 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = m.isPresent ? m.stateColor : ABSENT_SLATE;
    ctx.fill();

    // Name text (不在はスレート — 空席が「誰が居ないか」を語る)
    ctx.fillStyle = m.isPresent ? '#ccccdd' : ABSENT_SLATE;
    ctx.fillText(label, cx - dotR, ty);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── §2(a) 不在デスクの空席暗転オーバーレイ ─────────────────────
// 不在メンバーのデスクタイルを rgba(10,12,18,0.35) で暗転。空席=情報。
function renderAbsentDeskOverlays(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
): void {
  const members = jcGetDashboardMembers();
  ctx.save();
  ctx.fillStyle = ABSENT_DESK_OVERLAY;
  for (const m of members) {
    if (m.isPresent) continue;
    ctx.fillRect(offsetX + m.deskCol * s, offsetY + m.deskRow * s, s, s);
  }
  ctx.restore();
}

// ── Slice1: affinity badge ◎/△/✗ above characters (DEV-SPEC §6-3) ─────
const TIER_COLOR: Record<GameTier, string> = {
  great: '#39ff14', // ◎ neon green
  ok: '#f0ad4e', // △ amber
  bad: '#ff3d3d', // ✗ red
};

// R2 (差戻しv2): 顔に被る頭上バッジは廃止し、ゲージ行 (デスク下・ネームプレート
// の更に下) へ移設。頭上は 5種の状態表示専用にする。
function renderAffinityBadges(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  if (zoom < 2) return;
  const members = jcGetDashboardMembers();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const badgeFont = zoom >= 3 ? '9px "Press Start 2P", monospace' : '10px monospace';
  ctx.font = badgeFont;

  const preview = gameGetPreview();
  const now = Date.now();

  for (const m of members) {
    const g = gameGetMember(m.memberId);
    const isPreview = !g && preview?.memberId === m.memberId;
    if (!g && !isPreview) continue;
    const tier = g ? g.tier : preview!.tier;
    const glyph = TIER_GLYPH[tier];
    const cx = offsetX + (m.deskCol + 0.5) * s;
    // ゲージ行 (renderQualityGauge と同じ基準線) — 顔に被らない位置。
    const barH = Math.max(2, 3 * zoom);
    const rowCy = offsetY + (m.deskRow + 1) * s + 9 * zoom + barH / 2;
    const barW = s * 1.2;

    if (g) {
      // 実行中: ゲージ右端に tier グリフだけを添える (シンプル化)
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillText(glyph, cx + barW / 2 + Math.max(5, zoom * 2.5), rowCy);
      // T8: stalled member shows a flashing red [!] beside the glyph.
      if (g.stuck && Math.floor(now / 400) % 2 === 0) {
        ctx.fillStyle = '#ff3d3d';
        ctx.fillText('[!]', cx + barW / 2 + Math.max(12, zoom * 6), rowCy);
      }
    } else {
      // 委任カードのドロップ先プレビュー: 点線リング付きバッジ (ゲージ行に表示)
      const pulse = 0.75 + 0.25 * ((Math.sin(now / 250) + 1) / 2);
      const r = Math.max(6, zoom * 3);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(10, 15, 35, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, rowCy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, zoom * 0.4);
      ctx.strokeStyle = TIER_COLOR[tier];
      ctx.setLineDash([Math.max(2, zoom), Math.max(2, zoom)]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillText(glyph, cx, rowCy + 1);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ── Slice1: quality gauge bar below nameplate (DEV-SPEC §6-4) ──────────
function renderQualityGauge(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  if (zoom < 2) return;
  gameTickGauges(); // advance local interpolation each frame
  const members = jcGetDashboardMembers();
  const now = Date.now();
  ctx.save();

  for (const m of members) {
    const g = gameGetMember(m.memberId);
    if (!g) continue;
    const cx = offsetX + (m.deskCol + 0.5) * s;
    // Below the nameplate row (nameplate sits at deskRow+1).
    const barY = offsetY + (m.deskRow + 1) * s + 9 * zoom;
    const barW = s * 1.2;
    const barH = Math.max(2, 3 * zoom);
    const barX = cx - barW / 2;

    // Track
    ctx.fillStyle = 'rgba(10, 15, 35, 0.85)';
    ctx.fillRect(barX, barY, barW, barH);

    // Fill (width = gaugeValue%; color = tier). speedMul IS baked into gaugeValue.
    const fillW = (barW * Math.max(0, Math.min(100, g.gaugeValue))) / 100;
    ctx.fillStyle = TIER_COLOR[g.tier];
    ctx.fillRect(barX, barY, fillW, barH);

    // Border: red-flash when stalled, else tier color.
    const stalledFlash = g.stuck && Math.floor(now / 400) % 2 === 0;
    ctx.lineWidth = Math.max(1, zoom * 0.3);
    ctx.strokeStyle = stalledFlash ? '#ff3d3d' : TIER_COLOR[g.tier];
    ctx.strokeRect(barX, barY, barW, barH);
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
  // §2(b) 稼働チップ — R1 統一定義 (未完了しごと保有) から導出
  const deptStats = computeDeptOccupancy();

  for (const label of ZONE_LABELS) {
    const cx = offsetX + (label.col + 0.5) * s;
    const y = offsetY + label.row * s;

    const neon = DEPT_NEON[label.zone] ?? {
      primary: '#888888',
      glow: 'rgba(136,136,136,0.3)',
      fill: '#222222',
      text: '#cccccc',
    };

    // §2(b) 稼働チップ「働き/在籍」— roster を持つ部署ゾーンのみ (実データ)
    const chipDept = ZONE_TO_DEPT[label.zone];
    const chipStats = chipDept ? deptStats[chipDept] : undefined;
    const chipText = chipStats ? `${chipStats.working}/${chipStats.total}` : null;
    const chipRate =
      chipStats && chipStats.total > 0 ? (chipStats.working / chipStats.total) * 100 : 0;
    const chipColor =
      chipRate >= 50
        ? OCCUPANCY_CHIP_COLORS.high
        : chipRate > 0
          ? OCCUPANCY_CHIP_COLORS.mid
          : OCCUPANCY_CHIP_COLORS.zero;

    const signFont = zoom >= 3 ? ZONE_LABEL_FONT : ZONE_LABEL_FALLBACK_FONT;
    ctx.font = signFont;
    const labelW = ctx.measureText(label.text).width;
    const chipGap = chipText ? Math.max(4, zoom * 1.5) : 0;
    const chipW = chipText ? ctx.measureText(chipText).width : 0;
    const textW = labelW + chipGap + chipW;
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

    // Text (neon glow effect) — ラベル + 稼働チップを左詰めで並べる
    ctx.font = signFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const contentX = cx - textW / 2;
    // Text glow layer
    ctx.globalAlpha = 0.3 + pulse * 0.15;
    ctx.fillStyle = neon.primary;
    ctx.fillText(label.text, contentX + 0.5, signY + signH / 2 + 0.5);
    // Main text
    ctx.globalAlpha = 1;
    ctx.fillStyle = neon.text;
    ctx.fillText(label.text, contentX, signY + signH / 2);
    // 稼働チップ (数字色 = ≥50% ティール / 1-49% アンバー / 0% スレート)
    if (chipText) {
      ctx.fillStyle = chipColor;
      ctx.fillText(chipText, contentX + labelW + chipGap, signY + signH / 2);
    }
    ctx.textAlign = 'center';
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

// Task status colors imported from jc-constants.ts

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
      ctx.fillStyle = TASK_STATUS_COLORS.pending;
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
      ctx.fillStyle = TASK_STATUS_COLORS.running;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (task.status === 'done') {
      ctx.fillStyle = TASK_STATUS_COLORS.done;
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
      ctx.fillStyle = TASK_STATUS_COLORS.error;
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

// ── Owner's companion (agent-pet) ────────────────────────────────
// Stage 0 = egg, stage 1+ = hatched chick. Both are drawn as pixel spans in
// code so the companion scales with the office zoom without shipping a new
// PNG. The stage itself is never decided here: `agent-pet` promotes the pet
// on the morning run (source of truth = agent-pet/scripts/lib/stages.mjs)
// and this file only draws whatever stage the record already carries.

/** Egg silhouette: [startX, endX] per sprite-pixel row, 10w × 12h. */
const PET_EGG_ROWS: Array<[number, number]> = [
  [4, 5],
  [3, 6],
  [2, 7],
  [2, 7],
  [1, 8],
  [1, 8],
  [0, 9],
  [0, 9],
  [0, 9],
  [1, 8],
  [2, 7],
  [3, 6],
];
const PET_EGG_W = 10;
const PET_EGG_H = 12;
const PET_EGG_SHELL = '#F5E7C8';
const PET_EGG_SHADE = '#D9C39B';
const PET_EGG_SPOT = '#8FD3C7';
const PET_EGG_SHINE = '#FFFFFF';
const PET_EGG_OUTLINE = '#3A2E22';
const PET_SHADOW = 'rgba(0, 0, 0, 0.28)';
/** Spot pixels (x, y) in sprite coords. */
const PET_EGG_SPOTS: Array<[number, number]> = [
  [3, 6],
  [6, 8],
  [4, 10],
];
// ── Stage 1+ : hatched chick ─────────────────────────────────────
// Same technique as the egg (pixel spans, no PNG). 11w chick + 1px gap +
// 4w mug = exactly one 16px tile, so the pair stays centred on the tile.

/** Chick silhouette: [startX, endX] per sprite-pixel row, 11w × 11h (+1 feet row). */
const PET_CHICK_ROWS: Array<[number, number]> = [
  [3, 6],
  [2, 7],
  [1, 8],
  [1, 8],
  [2, 7],
  [2, 7],
  [1, 8],
  [0, 9],
  [0, 9],
  [1, 8],
  [2, 7],
];
const PET_CHICK_W = 11;
/** Body rows plus the feet row underneath. */
const PET_CHICK_H = PET_CHICK_ROWS.length + 1;
const PET_CHICK_BODY = '#F7D65A';
const PET_CHICK_SHADE = '#E0B63C';
const PET_CHICK_BEAK = '#F2913C';
/** Eye pixels (x, y). */
const PET_CHICK_EYES: Array<[number, number]> = [
  [3, 2],
  [6, 2],
];
/** Beak pixels (x, y) — pokes out to the right of the head. */
const PET_CHICK_BEAK_PIXELS: Array<[number, number]> = [
  [9, 3],
  [10, 3],
];
/** Wing pixels (x, y) on the near side of the body. */
const PET_CHICK_WING: Array<[number, number]> = [
  [2, 7],
  [3, 7],
  [2, 8],
  [3, 8],
];
/** Feet pixels (x, y) on the row under the body. */
const PET_CHICK_FEET: Array<[number, number]> = [
  [2, 11],
  [3, 11],
  [6, 11],
  [7, 11],
];
/** Leftover shell worn as a cap — only right after hatching (stage 1). */
const PET_CHICK_SHELL_CAP: [number, number] = [3, 6];

/** The mug the companion is given at stage 1 (骨子§5「もらえる持ち物」). */
const PET_MUG_W = 4;
const PET_MUG_H = 4;
const PET_MUG_GAP = 1;
const PET_MUG_BODY = '#E8EDF2';
const PET_MUG_SHADE = '#B9C3CC';
const PET_MUG_DRINK = '#6B4A2F';
/** Mug pixels (x, y, color) in sprite coords, bottom-aligned with the ground. */
const PET_MUG_PIXELS: Array<[number, number, string]> = [
  [0, 0, PET_MUG_BODY],
  [1, 0, PET_MUG_DRINK],
  [2, 0, PET_MUG_SHADE],
  [0, 1, PET_MUG_BODY],
  [1, 1, PET_MUG_BODY],
  [2, 1, PET_MUG_SHADE],
  [3, 1, PET_MUG_BODY],
  [0, 2, PET_MUG_BODY],
  [1, 2, PET_MUG_BODY],
  [2, 2, PET_MUG_SHADE],
  [3, 2, PET_MUG_BODY],
  [0, 3, PET_MUG_SHADE],
  [1, 3, PET_MUG_SHADE],
  [2, 3, PET_MUG_SHADE],
];

const PET_BOB_PERIOD_MS = 2600;
const PET_BOB_PIXELS = 1;
const PET_LABEL_FONT = '6px "Press Start 2P", monospace';
const PET_LABEL_FALLBACK_FONT = '8px monospace';
const PET_LABEL_COLOR = '#F5E7C8';
const PET_LABEL_SHADOW = '#0A0A14';
const PET_LABEL_GAP_PX = 3;

function renderPetCompanion(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const pet = jcGetPet();
  if (!pet) return;

  const px = zoom; // one sprite pixel in device pixels
  const bob =
    Math.round(Math.sin(((Date.now() % PET_BOB_PERIOD_MS) / PET_BOB_PERIOD_MS) * Math.PI * 2)) *
    PET_BOB_PIXELS *
    px;

  const tileX = offsetX + PET_TILE.col * s;
  const tileY = offsetY + PET_TILE.row * s;
  const groundY = tileY + Math.round((TILE_SIZE - 1) * px);

  ctx.save();

  if (pet.stage === 0) {
    const x0 = tileX + Math.round(((TILE_SIZE - PET_EGG_W) / 2) * px);
    const y0 = tileY + Math.round((TILE_SIZE - PET_EGG_H) * px) + bob;
    // Ground shadow (stays put while the egg bobs)
    ctx.fillStyle = PET_SHADOW;
    ctx.fillRect(x0 + px, groundY, (PET_EGG_W - 2) * px, px);
    drawPetEgg(ctx, x0, y0, px);
  } else {
    // Chick + mug read as one 16px-wide group so the pair stays tile-centred.
    const groupW = PET_CHICK_W + PET_MUG_GAP + PET_MUG_W;
    const x0 = tileX + Math.round(((TILE_SIZE - groupW) / 2) * px);
    const y0 = tileY + Math.round((TILE_SIZE - PET_CHICK_H) * px) + bob;
    ctx.fillStyle = PET_SHADOW;
    ctx.fillRect(x0 + px, groundY, (PET_CHICK_W - 2) * px, px);
    drawPetChick(ctx, x0, y0, px, pet.stage);
    // The mug sits on the floor, so it does not bob with the chick.
    drawPetMug(
      ctx,
      x0 + (PET_CHICK_W + PET_MUG_GAP) * px,
      tileY + Math.round((TILE_SIZE - PET_MUG_H) * px),
      px,
    );
  }

  // Name label (runtime value — never hardcoded)
  ctx.font = zoom >= 3 ? PET_LABEL_FONT : PET_LABEL_FALLBACK_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelX = tileX + s / 2;
  const labelY = tileY + TILE_SIZE * px + PET_LABEL_GAP_PX;
  ctx.fillStyle = PET_LABEL_SHADOW;
  ctx.fillText(pet.name, labelX + 1, labelY + 1);
  ctx.fillStyle = PET_LABEL_COLOR;
  ctx.fillText(pet.name, labelX, labelY);

  ctx.restore();
}

/** Stage 0 — the unhatched egg. */
function drawPetEgg(ctx: CanvasRenderingContext2D, x0: number, y0: number, px: number): void {
  // 1px outline silhouette (sides, plus a capping row above and below)
  ctx.fillStyle = PET_EGG_OUTLINE;
  for (let row = -1; row <= PET_EGG_ROWS.length; row++) {
    const clamped = Math.max(0, Math.min(PET_EGG_ROWS.length - 1, row));
    const [sx, ex] = PET_EGG_ROWS[clamped];
    ctx.fillRect(x0 + (sx - 1) * px, y0 + row * px, (ex - sx + 3) * px, px);
  }
  for (let row = 0; row < PET_EGG_ROWS.length; row++) {
    const [sx, ex] = PET_EGG_ROWS[row];
    const y = y0 + row * px;
    ctx.fillStyle = PET_EGG_SHELL;
    ctx.fillRect(x0 + sx * px, y, (ex - sx + 1) * px, px);
    // Right-side shading
    ctx.fillStyle = PET_EGG_SHADE;
    ctx.fillRect(x0 + (ex - 1) * px, y, 2 * px, px);
  }

  ctx.fillStyle = PET_EGG_SPOT;
  for (const [sx, sy] of PET_EGG_SPOTS) {
    ctx.fillRect(x0 + sx * px, y0 + sy * px, px, px);
  }
  ctx.fillStyle = PET_EGG_SHINE;
  ctx.fillRect(x0 + 2 * px, y0 + 4 * px, px, 2 * px);
}

/** Stage 1+ — the hatched chick. Stage 1 still wears a piece of its shell. */
function drawPetChick(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  px: number,
  stage: number,
): void {
  // 1px outline silhouette, same construction as the egg.
  ctx.fillStyle = PET_EGG_OUTLINE;
  for (let row = -1; row <= PET_CHICK_ROWS.length; row++) {
    const clamped = Math.max(0, Math.min(PET_CHICK_ROWS.length - 1, row));
    const [sx, ex] = PET_CHICK_ROWS[clamped];
    ctx.fillRect(x0 + (sx - 1) * px, y0 + row * px, (ex - sx + 3) * px, px);
  }
  for (let row = 0; row < PET_CHICK_ROWS.length; row++) {
    const [sx, ex] = PET_CHICK_ROWS[row];
    const y = y0 + row * px;
    ctx.fillStyle = PET_CHICK_BODY;
    ctx.fillRect(x0 + sx * px, y, (ex - sx + 1) * px, px);
    // Right-side shading
    ctx.fillStyle = PET_CHICK_SHADE;
    ctx.fillRect(x0 + ex * px, y, px, px);
  }

  ctx.fillStyle = PET_CHICK_SHADE;
  for (const [sx, sy] of PET_CHICK_WING) {
    ctx.fillRect(x0 + sx * px, y0 + sy * px, px, px);
  }
  ctx.fillStyle = PET_CHICK_BEAK;
  for (const [sx, sy] of [...PET_CHICK_BEAK_PIXELS, ...PET_CHICK_FEET]) {
    ctx.fillRect(x0 + sx * px, y0 + sy * px, px, px);
  }
  ctx.fillStyle = PET_EGG_OUTLINE;
  for (const [sx, sy] of PET_CHICK_EYES) {
    ctx.fillRect(x0 + sx * px, y0 + sy * px, px, px);
  }

  // Freshly hatched: a bit of shell still sits on its head.
  if (stage === 1) {
    const [sx, ex] = PET_CHICK_SHELL_CAP;
    ctx.fillStyle = PET_EGG_OUTLINE;
    ctx.fillRect(x0 + (sx - 1) * px, y0 - 2 * px, (ex - sx + 3) * px, px);
    ctx.fillStyle = PET_EGG_SHELL;
    ctx.fillRect(x0 + sx * px, y0 - px, (ex - sx + 1) * px, px);
    ctx.fillStyle = PET_EGG_SHADE;
    ctx.fillRect(x0 + ex * px, y0 - px, px, px);
  }
}

/** The mug the companion is handed at stage 1. Sits on the floor beside it. */
function drawPetMug(ctx: CanvasRenderingContext2D, x0: number, y0: number, px: number): void {
  ctx.fillStyle = PET_EGG_OUTLINE;
  ctx.fillRect(x0 - px, y0 - px, (PET_MUG_W + 1) * px, (PET_MUG_H + 2) * px);
  for (const [sx, sy, color] of PET_MUG_PIXELS) {
    ctx.fillStyle = color;
    ctx.fillRect(x0 + sx * px, y0 + sy * px, px, px);
  }
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
      liaison.color ??
      (liaison.fromZone === 'research'
        ? DEPT_NEON['research'].primary
        : DEPT_NEON['marketing'].primary);

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

    // Moving light pulse along the beam.
    // (✉️ は R5 renderMailFlights に一本化 — delegate で二重に飛ばない)
    const px = x1 + (x2 - x1) * progress;
    const py = y1 + (y2 - y1) * progress;

    ctx.beginPath();
    ctx.arc(px, py, LIAISON_PARTICLE_SIZE * zoom * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = beamColor;
    ctx.globalAlpha = alpha * 0.35;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, LIAISON_PARTICLE_SIZE * zoom * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.8;
    ctx.fill();
  }

  ctx.restore();
}

// ── Team HUD (top-right) ─────────────────────────────────────────

function renderTeamHUD(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const stats = jcGetStats();
  // R1 統一定義: 稼働 = 未完了しごと保有 (computeDeptOccupancy / workloads)
  const deptCounts = computeDeptOccupancy();
  const workloads = computeMemberWorkloads();
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
    deptLines.push({
      label: DEPT_LABELS[dept] ?? dept.toUpperCase(),
      present: count.present,
      total: count.total,
      color: jcGetDeptColor(dept),
      hasWorking: count.working > 0,
    });
  }

  // Active members (未完了しごと保有) with activity info
  const activeMembers = members.filter((m) => (workloads.get(m.memberId)?.active.length ?? 0) > 0);

  // Slice1: company score rows (top of HUD, DEV-SPEC §6-8)
  const companyScore = gameGetCompanyScore();
  const todayCount = gameGetTodayCount();
  const scoreText = `会社Score ▲${companyScore}`;
  const todayText = `本日完了 ${todayCount}件 🎉`;

  // Calculate box dimensions
  const headerText = `TEAM ${stats.present}/${stats.total}`;
  const headerMetrics = ctx.measureText(headerText);
  let maxWidth = headerMetrics.width + 20;
  // Grow for the wider company-score rows (ticker-overlap safe).
  maxWidth = Math.max(maxWidth, ctx.measureText(scoreText).width + 20);
  maxWidth = Math.max(maxWidth, ctx.measureText(todayText).width + 20);

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
    2 * lineHeight + // Slice1: company score + today count rows
    deptLines.length * lineHeight + // dept rows
    separatorLines * 8 + // separator
    (showActiveList ? activeMembers.length * lineHeight : 0) +
    padding * 2;

  const boxWidth = maxWidth + padding * 2;
  const boxX = canvasWidth - boxWidth - rightMargin;
  const boxY = topMargin;

  // Background with glass effect
  ctx.fillStyle = 'rgba(38, 43, 47, 0.94)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  // Neon border
  ctx.strokeStyle = 'rgba(46, 158, 144, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  // Top accent line
  ctx.fillStyle = 'rgba(95, 194, 180, 0.55)';
  ctx.fillRect(boxX, boxY, boxWidth, 1);

  // Header
  const textX = canvasWidth - rightMargin - padding;
  let textY = boxY + padding;

  ctx.font = STATS_FALLBACK_FONT;
  ctx.fillStyle = '#5FC2B4';
  ctx.fillText(headerText, textX, textY);
  textY += lineHeight;

  // Slice1: company score + today completed (bright accent, DEV-SPEC §6-8)
  ctx.fillStyle = '#39ff14';
  ctx.fillText(scoreText, textX, textY);
  textY += lineHeight;
  ctx.fillStyle = '#E4C36E';
  ctx.fillText(todayText, textX, textY);
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
    ctx.fillStyle = 'rgba(95, 194, 180, 0.2)';
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

// ── R2 状態表示 v2 (Owner設計・5種・2026-07-03 差戻しv2) ─────────────
// ① 通常稼働 (未完了しごと1件) = アイコンなし (働く姿 + ゲージはデスク下)
// ② タスク集中 (2件以上)       = 🔥
// ③ 待機 (0件・出社中)          = 吹き出しでぼやき → 5分継続で zzz
// ④ 承認待ち (Owner回答待ち)     = ‼️ (キャラクリックで確認パネルが開く)
// ⑤ 不在                        = 空席暗転 (renderAbsentDeskOverlays)
// 全インジケータは頭上統一オフセット STATUS_ICON_OFFSET_PX — 顔に被せない。
// 稼働判定は R1 正本 (computeMemberWorkloads) に統一。

/** member → 最新の非subagentキャラ (skill: seatuid-trap の正解パターン) */
function memberIdOfChar(ch: Character): string | undefined {
  return ch.jcMemberId ?? jcGetMemberForAgent(ch.id);
}

/**
 * 承認待ち (Owner の回答待ち) member 集合:
 * 依頼フローの確認 (phase=confirming) + plan確認 (承認まちtray awaiting)。
 * 表示 (‼️) とクリック導線 (App.handleClick) が同じ判定を共有する。
 */
export function jcGetApprovalWaitMemberIds(): Set<string> {
  const out = new Set<string>();
  const flow = getRequestFlow();
  if (flow && flow.phase === 'confirming') out.add(flow.memberId);
  for (const p of getPlans()) {
    if (p.status === 'awaiting') out.add(p.memberId);
  }
  return out;
}

function renderMemberStatusIcons(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const now = Date.now();
  const workloads = computeMemberWorkloads(now);
  const approvalWait = jcGetApprovalWaitMemberIds();
  const liveBubbles = jcGetSpeechBubbles();
  // QC/実機検証フック: 各 member の状態アイコンとキャラ画面座標を毎フレーム公開
  // (描画には無関与 — playwright QC がクリック座標と表示状態を検証するために読む)
  const qcDebug: Array<{ memberId: string; icon: string; x: number; y: number }> = [];

  // member → 最後 (最新) のキャラ。同一 member の再到着で複数 char が居ても 1 個。
  const charOf = new Map<string, Character>();
  for (const ch of characters) {
    if (ch.isSubagent) continue;
    const mid = memberIdOfChar(ch);
    if (mid) charOf.set(mid, ch);
  }

  for (const [memberId, ch] of charOf) {
    const runtime = jcGetMemberRuntime(memberId);
    if (!runtime?.isPresent) continue;
    const wl = workloads.get(memberId);
    const active = wl?.active.length ?? 0;

    // §2(a) 彩度落ちも R1 統一定義から: 在席かつ未完了しごと0 = 出社アイドル
    ch.jcDesaturated = active === 0;

    const sittingOff = isSittingState(ch.state) ? -4 : 0;
    const anchorX = offsetX + ch.x * zoom;
    const headY = offsetY + (ch.y + sittingOff) * zoom;
    const anchorY = headY - STATUS_ICON_OFFSET_PX * zoom;

    // 一時エフェクト (🎉/👋/🧠/😤ほか) は最優先 — 2秒で消える演出レイヤー
    if (runtime.emotionEmoji && now < runtime.emotionUntil) {
      renderStatusEmoji(ctx, runtime.emotionEmoji, anchorX, anchorY, zoom, null, 1);
      qcDebug.push({ memberId, icon: runtime.emotionEmoji, x: anchorX, y: anchorY });
      continue;
    }
    if (runtime.emotionEmoji && now >= runtime.emotionUntil) {
      runtime.emotionEmoji = null;
    }

    // ④ ‼️ 承認待ち — Owner が承認/回答するまで点滅 (クリックでパネル)
    if (approvalWait.has(memberId)) {
      const pulse = 0.7 + 0.3 * ((Math.sin(now / 280) + 1) / 2);
      renderStatusEmoji(ctx, STATUS_APPROVAL_EMOJI, anchorX, anchorY, zoom, '#ff3d3d', pulse);
      qcDebug.push({ memberId, icon: 'approval', x: anchorX, y: anchorY });
      continue;
    }

    // ② 🔥 タスク集中 (未完了の生きたしごと 2件以上)
    if (active >= FOCUS_WORK_COUNT) {
      renderStatusEmoji(ctx, STATUS_FOCUS_EMOJI, anchorX, anchorY, zoom, null, 1);
      qcDebug.push({ memberId, icon: 'focus', x: anchorX, y: anchorY });
      continue;
    }

    // ① 通常稼働 (1件) = アイコンなし — 普通に働く姿で語る
    if (active >= 1) {
      qcDebug.push({ memberId, icon: 'working', x: anchorX, y: anchorY });
      continue;
    }

    // ③ 待機 (未完了0件・出社中): ぼやき → IDLE_ZZZ_AFTER_MS 継続で zzz
    const idleAnchor = runtime.idleSince ?? runtime.stateSince;
    const elapsed = now - idleAnchor;
    if (elapsed >= IDLE_ZZZ_AFTER_MS) {
      renderZzz(ctx, anchorX, anchorY, zoom, now);
      qcDebug.push({ memberId, icon: 'zzz', x: anchorX, y: anchorY });
      continue;
    }
    qcDebug.push({ memberId, icon: 'idle', x: anchorX, y: anchorY });
    // ぼやきは周期表示。実セリフ (speech bubble) 表示中は譲る。
    if (liveBubbles.some((b) => b.memberId === memberId)) continue;
    const cycle = Math.floor(elapsed / IDLE_MURMUR_CYCLE_MS);
    const phase = elapsed % IDLE_MURMUR_CYCLE_MS;
    if (phase < IDLE_MURMUR_ON_MS) {
      let hash = 0;
      for (let i = 0; i < memberId.length; i++) hash = (hash * 31 + memberId.charCodeAt(i)) | 0;
      const line = IDLE_MURMUR_LINES[Math.abs(hash + cycle) % IDLE_MURMUR_LINES.length];
      renderMurmurBubble(ctx, line, anchorX, headY, zoom);
    }
  }

  // QC hook 公開 (表示検証専用 — UI 挙動には無関与)。view = 現在のカメラ変換
  // (camera-follow で pan が動くため、QC のタイル→画面座標変換はこれを使う)。
  (window as unknown as Record<string, unknown>).__JC_STATUS_QC = qcDebug;
  (window as unknown as Record<string, unknown>).__JC_VIEW_QC = { offsetX, offsetY, zoom };
}

/** 頭上統一位置に絵文字ステータスを描く (白丸バブル + 任意の注意リング) */
function renderStatusEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  zoom: number,
  ringColor: string | null,
  alpha: number,
): void {
  ctx.save();
  const bgSize = 12 * zoom;
  ctx.globalAlpha = alpha;

  // Soft white bubble background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(x, y, bgSize / 2, 0, Math.PI * 2);
  ctx.fill();

  // Attention ring (‼️ 用) or subtle slate ring
  ctx.beginPath();
  ctx.arc(x, y, bgSize / 2 + 1, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor ?? 'rgba(102, 102, 136, 0.4)';
  ctx.lineWidth = ringColor ? Math.max(1.5, zoom * 0.6) : 1;
  ctx.stroke();

  ctx.font = `${10 * zoom}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y + zoom * 0.5);
  ctx.restore();
}

/** ③ 待機5分超の zzz 表記 (ゆっくり上下に揺れる寝息) */
function renderZzz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  now: number,
): void {
  ctx.save();
  const bob = Math.sin(now / 600) * zoom;
  ctx.font = `bold ${Math.max(8, 7 * zoom)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0a0a14';
  ctx.fillText('zzz', x + 1, y + bob + 1);
  ctx.fillStyle = '#9fb0c0';
  ctx.fillText('zzz', x, y + bob);
  ctx.restore();
}

/** ③ 待機のぼやき吹き出し (「仕事がないなー…」等 — jc-constants の汎用文言) */
function renderMurmurBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  charX: number,
  charYScreen: number,
  zoom: number,
): void {
  ctx.save();
  const FONT = zoom >= 3 ? '6px "Press Start 2P", monospace' : '7px monospace';
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const PADDING_X = 4 * zoom;
  const PADDING_Y = 3 * zoom;
  const OFFSET_Y = -36 * zoom; // 実セリフ (speech bubble) と同じ頭上帯 — 顔に被らない
  const TAIL_SIZE = 3 * zoom;

  const textW = ctx.measureText(text).width;
  const textH = zoom >= 3 ? 6 : 7;
  const bgX = charX - textW / 2 - PADDING_X;
  const bgY = charYScreen + OFFSET_Y - textH - PADDING_Y;
  const bgW = textW + PADDING_X * 2;
  const bgH = textH + PADDING_Y * 2;

  ctx.globalAlpha = 0.92;
  // Shadow + dark bg + slate border (独白トーン: 部署色を使わない)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bgX + 1, bgY + 1, bgW, bgH);
  ctx.fillStyle = 'rgba(24, 27, 34, 0.92)';
  ctx.fillRect(bgX, bgY, bgW, bgH);
  ctx.strokeStyle = 'rgba(148, 163, 178, 0.55)';
  ctx.lineWidth = Math.max(1, zoom * 0.4);
  ctx.strokeRect(bgX, bgY, bgW, bgH);

  // Tail
  ctx.fillStyle = 'rgba(24, 27, 34, 0.92)';
  ctx.beginPath();
  ctx.moveTo(charX - TAIL_SIZE, bgY + bgH);
  ctx.lineTo(charX, bgY + bgH + TAIL_SIZE);
  ctx.lineTo(charX + TAIL_SIZE, bgY + bgH);
  ctx.fill();

  ctx.fillStyle = '#b8c2cc';
  ctx.fillText(text, charX, charYScreen + OFFSET_Y);
  ctx.restore();
}

// ── R5 ✉️メール飛翔 (依頼発行=委任の実イベント駆動) ──────────────────
// jcMailFly (event-watcher handleDelegate / browserMock delegate) のみが発火源。
// 封筒は送り手→受け手のキャラ間を放物線で飛び、着地でパルスが出る。
// 新規スプライトなし — 絵文字✉️の Canvas 描画。
function renderMailFlights(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  s: number,
  zoom: number,
): void {
  const flights = jcGetActiveMailFlights();
  if (flights.length === 0) return;
  const now = Date.now();

  const posOf = (memberId: string): { x: number; y: number } | null => {
    let found: Character | undefined;
    for (const ch of characters) {
      if (!ch.isSubagent && memberIdOfChar(ch) === memberId) found = ch;
    }
    if (found) {
      return { x: offsetX + found.x * zoom, y: offsetY + (found.y - 8) * zoom };
    }
    // キャラ不在 (未出社) はデスク位置へ
    const deskId = jcGetMemberRuntime(memberId)?.config.deskId;
    const desk = deskId ? jcGetDeskPosition(deskId) : undefined;
    return desk ? { x: offsetX + (desk.col + 0.5) * s, y: offsetY + (desk.row + 0.5) * s } : null;
  };

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const f of flights) {
    const from = posOf(f.fromMemberId);
    const to = posOf(f.toMemberId);
    if (!from || !to) continue;

    const t = Math.min(1, (now - f.startTime) / f.duration);
    // easeInOutQuad — 飛び出しと着地が柔らかい
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // 放物線 (2次ベジェ): 制御点は中点の上空
    const ctrlX = (from.x + to.x) / 2;
    const ctrlY = Math.min(from.y, to.y) - MAIL_FLIGHT_ARC_TILES * s;
    const bez = (p: number): { x: number; y: number } => {
      const m = 1 - p;
      return {
        x: m * m * from.x + 2 * m * p * ctrlX + p * p * to.x,
        y: m * m * from.y + 2 * m * p * ctrlY + p * p * to.y,
      };
    };

    // 残像トレイル (2枚・薄く)
    for (let k = 1; k <= 2; k++) {
      const p = Math.max(0, e - k * 0.09);
      const q = bez(p);
      ctx.globalAlpha = 0.2 / k;
      ctx.font = `${Math.max(10, 10 * zoom)}px serif`;
      ctx.fillText('✉️', q.x, q.y);
    }

    // 封筒本体 (着地間際でフェードアウト)
    const pos = bez(e);
    ctx.globalAlpha = t > 0.92 ? Math.max(0, (1 - t) / 0.08) : 1;
    ctx.font = `${Math.max(12, 12 * zoom)}px serif`;
    ctx.fillText('✉️', pos.x, pos.y);

    // 着地パルス — 受け手に「届いた」リング
    if (t > 0.8) {
      const pp = (t - 0.8) / 0.2;
      ctx.globalAlpha = (1 - pp) * 0.7;
      ctx.beginPath();
      ctx.arc(to.x, to.y, (4 + pp * 10) * zoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#E4C36E';
      ctx.lineWidth = Math.max(1.5, zoom * 0.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
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
  const BUBBLE_BG = 'rgba(38, 43, 47, 0.94)';
  const BUBBLE_BORDER = 'rgba(95, 194, 180, 0.4)';
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
    const memberId = memberIdOfChar(ch);
    if (!memberId) continue;
    const summary = jcGetActivitySummary(memberId);
    if (!summary) continue;

    const sittingOff = isSittingState(ch.state) ? -4 : 0;
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

// Speech bubble department colors imported from jc-constants.ts as SPEECH_BUBBLE_COLORS

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
      const memberId = memberIdOfChar(ch);
      if (memberId === bubble.memberId) {
        const sittingOff = isSittingState(ch.state) ? -4 : 0;
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

    const deptColor = SPEECH_BUBBLE_COLORS[bubble.department] ?? '#888888';

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
