// ── 社員カルテ v2 (プロフィール先出し + タブ + ステータスバー5本) ─────────────
// v1「詳細1枚ドン」への **作り替え** (作り直しでない)。v1 の区画0 (素性+状態アンカー)・
// データ元栓 (computeMemberWorkloads / computeCompletionArchive)・pop-in・フリップ配置・
// 触るな境界はそのまま流用し、その上に以下を載せる:
//   ① カルテを 2 タブ化 (プロフィール既定 / いまのしごと)。共有ヘッダ (区画0) はタブ外常駐。
//   ② プロフィールタブ = 人物像 4tier (性格/思想/キャリア/得意/苦手/主な業務) + ステータスバー5本。
//   ③ バー5本を全員同じ物差し (0-100 共通指標) に一元化 (素質2金系 / 活動3寒色)。
//   ④ いまのしごとタブ = v1 の柱 (現タスク / 未完了 / 稼働履歴 / 相性) を収容。
//   ⑤ ①統一バグ修正: 現タスクを open work の実データから導き、「手が空いている」と未完了溜まりの
//      矛盾を構造的に解消 (両方 open[] 由来の1系統)。
//   ⑥ 稼働履歴を通算処理数の簡素表示に (本日HERO/10segバー/直近3件は撤去)。
// 設計正本: .company/engineering/docs/2026-07-04-pixel-office-member-card-v2-profile-tabs-spec-fujii.md (§11 v2-AC-1〜14)
//
// 触るな境界 (無改変・import もしない): affinity*.ts / affinity-preview.ts / routing-target.ts /
//   persona-lines.ts / ResearchResultPanel.tsx / research-result-state.ts。相性は gameGetMember
//   (READ-ONLY getter) のみ。待機ぼやきは IDLE_MURMUR_LINES (jc-constants) のみ。
//   ★プロフィールの性格/思想 (persona) は config.persona (jc-config.json 手書き) 由来であって
//    persona-lines.ts (待機ぼやき) ではない — 別系統 (混同禁止)。
// 新規 postMessage channel 0 (タブは内部 useState)・新規 fs read 0 (persona は jcConfigLoaded 相乗り)。

import { useEffect, useRef, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { isSittingState, TILE_SIZE } from '../office/types.js';
import { ConfidenceBadge } from './ConfidenceBadge.js';
import { formatElapsedJa } from './format-elapsed.js';
import { formatFreshness } from './freshness.js';
import { gameGetMember, TIER_GLYPH } from './game-state.js';
import {
  CONVERSATION_BAR_CAP,
  DEPT_COLORS,
  DEPT_LABELS,
  EXPERIENCE_FLOOR,
  FOCUS_WORK_COUNT,
  IDLE_MURMUR_LINES,
  IDLE_ZZZ_AFTER_MS,
  LAYER_EXPERIENCE,
  MOMENTUM_BAR_CAP,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STAT_BAR_SEGMENTS,
  STATE_COLORS,
  STATE_LABELS,
  STATUS_APPROVAL_EMOJI,
  STATUS_FOCUS_EMOJI,
  THROUGHPUT_BAR_CAP,
} from './jc-constants.js';
import {
  jcGetActivitySummary,
  jcGetMemberForAgent,
  jcGetMemberRuntime,
  jcGetMemberTaskStatus,
} from './jc-state.js';
import {
  computeCompletionArchive,
  computeConversationVolume,
  computeMemberMomentum,
  computeMemberWorkloads,
  karteEarliestAt,
} from './karte-state.js';
import { MemberPortrait } from './MemberPortrait.js';
import { getPlans } from './plan-state.js';
import { getRequestFlow } from './request-flow-state.js';

// ── 素材トークン (spec §1 = v1 流用) ─────────────────────────────────────────
const CARD_W = 320;
const CARD_BG = '#1e1e2e'; // solid (半透明禁止)。CLAUDE.md の pixel-bg token 値。
const CARD_SHADOW = 'var(--pixel-shadow)'; // = 2px 2px 0px #0a0a14 (blur 無・ハードオフセットのみ)
// フォント 4 段 (16 / 13 / 11 / 10) — 名前を最大にせず状態を先に読ませる。
const FS_NAME = 16;
const FS_BODY = 13;
const FS_SUB = 11;
const FS_MICRO = 10;
const AFFINITY_HEARTS = 5;

// ── ステータスバー配色 (spec §3) ────────────────────────────────────────────
const STAT_GOLD = '#E4C36E'; // 素質2本 (経験/専門性・不変・設定値)
const STAT_COOL = '#5ac88c'; // 活動3本 (作業量/会話量/勢い・実データ)
const STAT_EMPTY = '#33334a'; // 空セグメント
const STAT_UNSET = '#2a2a3c'; // 専門性 未設定のグレー空バー (捏造値を埋めない)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** memberId から安定した murmur 行を引く (flicker 防止に hash 固定・時間で回さない)。 */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function todayStartMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** epoch ms → "M/D" (観測開始境界の表示)。 */
function formatMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 中黒/読点区切りの文字列 → チップ配列 (空要素は除去)。 */
function splitChips(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[·・、,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ── ステータスバー 1 本 (spec §3・バー塗りが唯一の共通スケール・右数値は小 dim) ──
interface StatBarProps {
  label: string;
  /** 0-100 pct、または null = 設定なし (グレー空バー・捏造しない) */
  pct: number | null;
  /** 右端の小さい dim 注記 (L3 / 70 / 通算16 / 委任10 / 直近…) */
  note: string;
  /** バー塗り色 (素質=金 STAT_GOLD / 活動=寒色 STAT_COOL) */
  color: string;
}

function StatBar({ label, pct, note, color }: StatBarProps) {
  const isUnset = pct === null;
  const filled = isUnset ? 0 : clamp(Math.round(pct / 10), 0, STAT_BAR_SEGMENTS);
  const emptyColor = isUnset ? STAT_UNSET : STAT_EMPTY;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1.5px 0' }}>
      <span style={{ width: 44, flexShrink: 0, fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>
        {label}
      </span>
      <div style={{ flex: 1, display: 'flex', gap: 2 }}>
        {Array.from({ length: STAT_BAR_SEGMENTS }).map((_, i) => (
          <span
            key={i}
            style={{ flex: 1, height: 8, background: i < filled ? color : emptyColor }}
          />
        ))}
      </div>
      <span
        style={{
          width: 46,
          flexShrink: 0,
          textAlign: 'right',
          fontSize: FS_MICRO,
          color: isUnset ? '#6a6a80' : '#8a8aa2',
        }}
      >
        {note}
      </span>
    </div>
  );
}

interface JCMemberInfoPanelProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  /** 「すべての履歴」→ 完了アーカイブ(本棚)へ 1 手奥ジャンプ。未提供なら本ボタンは非表示。 */
  onOpenArchive?: () => void;
}

export function JCMemberInfoPanel({
  officeState,
  containerRef,
  zoom,
  panRef,
  onOpenArchive,
}: JCMemberInfoPanelProps) {
  // Use state for current time to avoid impure Date.now() in render
  // (同じ idiom: AbsentStatusPopup.tsx / DeskCard.tsx)。
  const [now, setNow] = useState(() => Date.now());
  // タブ状態 (spec §2・既定=profile・新規 postMessage channel 0)。
  const [tab, setTab] = useState<'profile' | 'work'>('profile');
  const cardRef = useRef<HTMLDivElement>(null);
  const measuredHRef = useRef(400);

  // ライブ更新: 滞在時間 / 停滞 / 本日完了を毎フレーム反映。selection(imperative) の
  // 変化も次フレームで即座に拾う (別キャラクリックで枠がその場で差し替わる)。
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setNow(Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Esc で閉じる (空クリック / 同キャラ再クリックは canvas 側が既に deselect)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        officeState.selectedAgentId = null;
        officeState.cameraFollowId = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [officeState]);

  // 高さを実測して上下フリップ配置に使う (画面下端で溢れないよう)。
  useEffect(() => {
    if (cardRef.current) measuredHRef.current = cardRef.current.offsetHeight;
  });

  const selectedId = officeState.selectedAgentId;
  if (selectedId === null) return null;

  // ── memberId 解決 (空カルテを出さない要): jcMemberId ?? agent→member、runtime は
  //    jcGetMemberRuntime で引く (live agent を持たない在席/不在席でも埋まる)。 ──
  const ch = officeState.characters.get(selectedId);
  if (!ch) return null;
  const memberId = ch.jcMemberId ?? jcGetMemberForAgent(selectedId);
  if (!memberId) return null;
  const runtime = jcGetMemberRuntime(memberId);
  if (!runtime) return null;

  const el = containerRef.current;
  if (!el) return null;

  // ── 位置計算 (キャラ頭上に pop-in・下端では上フリップ・v1 流用) ──
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);
  const sittingOffset = isSittingState(ch.state) ? CHARACTER_SITTING_OFFSET_PX : 0;
  const anchorX = (deviceOffsetX + ch.x * zoom) / dpr;
  const headY = (deviceOffsetY + (ch.y + sittingOffset) * zoom) / dpr;
  const footY = (deviceOffsetY + (ch.y + sittingOffset + TILE_SIZE) * zoom) / dpr;

  const cardH = measuredHRef.current;
  const gap = 10;
  const left = clamp(anchorX - CARD_W / 2, 8, Math.max(8, rect.width - CARD_W - 8));
  let top = headY - gap - cardH;
  if (top < 8) top = footY + gap; // 上に入らなければ下へフリップ
  top = clamp(top, 8, Math.max(8, rect.height - cardH - 8));

  // ── データ導出 ──
  // now は上の rAF useEffect で毎フレーム setNow() 済み (impure Date.now() 直呼び禁止)。
  const { config, jcState, isPresent, stateSince, idleSince } = runtime;
  const dotColor = STATE_COLORS[jcState] ?? '#9e9e9e';
  // dot は canvas と厳密同一 (STATE_COLORS)。absent の dot 色 (#333344) は暗地に沈んで
  // ラベルが読めないため、ラベル文字だけ可読な dim にする (dot は不変)。
  const stateLabelColor = jcState === 'absent' ? 'var(--pixel-text-dim)' : dotColor;
  const stateLabel = STATE_LABELS[jcState] ?? jcState;
  const deptColor = DEPT_COLORS[config.department] ?? 'var(--pixel-text-dim)';
  const deptLabel = DEPT_LABELS[config.department] ?? config.department;
  const accentColor = config.accentColor ?? deptColor;
  const layer = config.layer; // optional (無ければ非表示)
  const persona = config.persona; // optional (手書き public-safe・無ければ「未設定」)

  const workload = computeMemberWorkloads(now).get(memberId);
  const openWorks = workload?.open ?? [];
  const activeCount = workload?.active.length ?? 0;
  const stalledCount = workload?.stalled.length ?? 0;
  const openCount = openWorks.length;

  // 承認待ち (Owner 回答待ち): request flow(hidden/confirming) or plan(awaiting)。
  const flow = getRequestFlow();
  const flowApproval =
    !!flow && flow.memberId === memberId && (flow.hidden || flow.phase === 'confirming');
  const planApproval = getPlans().some((p) => p.status === 'awaiting' && p.memberId === memberId);
  const isApproval = flowApproval || planApproval;

  const isFocus = activeCount >= FOCUS_WORK_COUNT;
  const isWaiting = openCount === 0 && isPresent;
  const waitElapsed = now - (idleSince ?? stateSince ?? now);
  const isZzz = isWaiting && waitElapsed > IDLE_ZZZ_AFTER_MS;
  const stateElapsed = now - (stateSince ?? now);

  // 状態チップ (単一・優先順): 承認待ち → 集中 → 停滞 → 待機。手空きと停滞/承認待ちを別表示。
  let chip: { emoji: string; label: string; color: string } | null = null;
  if (isApproval) chip = { emoji: STATUS_APPROVAL_EMOJI, label: '承認待ち', color: '#f59e0b' };
  else if (isFocus) chip = { emoji: STATUS_FOCUS_EMOJI, label: '集中', color: '#5ac88c' };
  else if (stalledCount > 0 && activeCount === 0)
    chip = { emoji: '⚠', label: '停滞', color: '#f59e0b' };
  else if (isZzz) chip = { emoji: '💤', label: '待機', color: '#8888aa' };
  else if (isWaiting) chip = { emoji: '', label: '待機', color: '#8888aa' };

  // 待機ぼやき (IDLE_MURMUR_LINES のみ・persona-lines.ts 不可侵)。手空き時だけ小さく。
  const murmur = isWaiting
    ? IDLE_MURMUR_LINES[stableHash(memberId) % IDLE_MURMUR_LINES.length]
    : null;

  // ── §5 ①統一のバグ修正: 現タスク headline を open work の実データから導く ──
  //   着手済を優先 → なければ最新受付 (受付のみが着手中を追い越さない)。
  const currentWork = openWorks.find((w) => w.hasStarted) ?? openWorks[0] ?? null;
  //   TaskDef は presence gate から外し、running のときだけ badge 装飾 + mirror-bug ガードに使う。
  const runningTask = jcGetMemberTaskStatus(memberId);
  const runningDef = runningTask && runningTask.status === 'running' ? runningTask : null;
  //   headline テキスト: currentWork(実データ) 優先 → 無ければ runningDef.prompt (逆方向 mirror-bug
  //   ガード = TaskDef 有・open 無 で「手が空いています」と誤表示しない)。
  const headlineText = currentWork ? currentWork.task : (runningDef?.prompt ?? null);
  //   未完了リスト = open work から headline に昇格した 1 件を除いた残り。
  const restOpen = currentWork ? openWorks.filter((w) => w !== currentWork) : openWorks;
  //   空状態は open work が無く running TaskDef も無い時のみ (未完了と空状態は物理的に共存不能)。
  const showEmpty = headlineText === null;

  const activitySummary = jcGetActivitySummary(memberId);

  // 稼働履歴 (成果): 実データ (computeCompletionArchive) を memberId + 当日0時で数える。
  const archive = computeCompletionArchive();
  const mine = archive.filter((r) => r.memberId === memberId);
  const todayCount = mine.filter((r) => r.completedAt >= todayStartMs(now)).length;
  const totalCount = mine.length; // = 作業量バーと同源 (無矛盾)
  const earliest = karteEarliestAt(); // null=記録なし / 有=観測開始境界

  // ── ステータスバー5本 (spec §3・全て絶対固定 cap・相対 max 正規化でない) ──
  const experiencePct = LAYER_EXPERIENCE[layer ?? ''] ?? EXPERIENCE_FLOOR;
  const specialtyVal = persona?.specialty;
  const specialtyPct = typeof specialtyVal === 'number' ? specialtyVal : null;
  const throughputPct = Math.min(100, Math.round((100 * totalCount) / THROUGHPUT_BAR_CAP));
  const convoRaw = computeConversationVolume().get(memberId) ?? 0;
  const conversationPct =
    convoRaw === 0
      ? 0
      : Math.min(100, Math.round((100 * Math.log1p(convoRaw)) / Math.log1p(CONVERSATION_BAR_CAP)));
  const momentumRaw = computeMemberMomentum(now).get(memberId) ?? 0;
  const momentumPct = Math.min(100, Math.round((100 * momentumRaw) / MOMENTUM_BAR_CAP));

  // 得意/苦手チップ (中黒区切り)。
  const strengthChips = splitChips(persona?.strengths);
  const weaknessChips = splitChips(persona?.weaknesses);
  const mainWork = persona?.mainWork ?? config.role; // 無ければ role fallback

  // 相性 (READ-ONLY・gameGetMember のみ)。無ければ grey 休息ハート + 待機。
  const game = gameGetMember(memberId);
  const heartsFilled = game ? (game.tier === 'great' ? 5 : game.tier === 'ok' ? 3 : 1) : 0;
  const affinityLabel = game ? `相性 ${TIER_GLYPH[game.tier]}` : '待機';
  const affinityColor = game
    ? game.tier === 'great'
      ? '#5ac88c'
      : game.tier === 'ok'
        ? '#f59e0b'
        : '#ff6b6b'
    : '#6a6a80';

  const closeCard = () => {
    officeState.selectedAgentId = null;
    officeState.cameraFollowId = null;
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: FS_SUB,
    color: 'var(--pixel-text-dim)',
    letterSpacing: 1,
    padding: '5px 10px 3px',
    borderTop: '2px solid #2a2a3c',
  };
  const statGroupCaptionStyle: React.CSSProperties = {
    fontSize: FS_MICRO,
    color: 'var(--pixel-text-dim)',
    letterSpacing: 1,
    margin: '8px 0 3px',
  };
  const personaLabelStyle: React.CSSProperties = {
    fontSize: FS_MICRO,
    color: 'var(--pixel-text-dim)',
    flexShrink: 0,
    width: 30,
  };

  // タブボタン (spec §2・active=accent塗り+上2px+■ / inactive=dim+下2px shelf線・角丸/blur無)。
  const tabBtn = (key: 'profile' | 'work', label: string) => {
    const active = tab === key;
    return (
      <button
        onClick={() => setTab(key)}
        style={{
          flex: 1,
          cursor: 'pointer',
          background: active ? `${accentColor}22` : 'transparent',
          border: 'none',
          borderTop: active ? `2px solid ${accentColor}` : '2px solid transparent',
          borderBottom: active ? `2px solid ${CARD_BG}` : '2px solid #2a2a3c',
          borderRight: key === 'profile' ? '2px solid #2a2a3c' : 'none',
          color: active ? 'var(--pixel-text)' : 'var(--pixel-text-dim)',
          fontFamily: "'FS Pixel Sans', sans-serif",
          fontSize: FS_SUB,
          fontWeight: active ? 700 : 400,
          padding: '6px 8px',
          letterSpacing: 1,
          transition: 'background 80ms steps(1, end)',
        }}
      >
        {active ? '■ ' : ''}
        {label}
      </button>
    );
  };

  return (
    <div style={{ position: 'absolute', left, top, zIndex: 60, pointerEvents: 'auto' }}>
      {/* pop-in は steps() 離散ピクセルステップ (smooth ease-out 不可)。開いた瞬間が手応え。 */}
      <style>{`
        @keyframes jc-karte-pop {
          0%   { transform: translateY(8px) scale(0.92); opacity: 0; }
          100% { transform: translateY(0)   scale(1);    opacity: 1; }
        }
      `}</style>
      <div
        ref={cardRef}
        data-jc-karte
        data-jc-member={memberId}
        style={{
          width: CARD_W,
          boxSizing: 'border-box',
          background: CARD_BG,
          color: 'var(--pixel-text)',
          border: `2px solid ${accentColor}`,
          borderRadius: 0,
          boxShadow: CARD_SHADOW,
          fontFamily: "'FS Pixel Sans', sans-serif",
          animation: 'jc-karte-pop 120ms steps(4, end) both',
        }}
      >
        {/* ── 共有ヘッダ (区画0: 素性 + 状態・タブ外常駐・切替で再描画しない・v1 流用) ── */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '9px 10px',
            background: `${accentColor}14`,
            borderBottom: `2px solid ${accentColor}`,
          }}
        >
          {/* 顔グラ (立ち姿48px) */}
          <div
            style={{
              flexShrink: 0,
              width: 48,
              minHeight: 56,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <MemberPortrait
              memberId={config.id}
              palette={ch.palette}
              hueShift={ch.hueShift}
              present={isPresent}
            />
          </div>

          {/* 名前 / 役割 / 状態 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: FS_NAME,
                  fontWeight: 700,
                  color: 'var(--pixel-text)',
                  whiteSpace: 'normal',
                }}
              >
                {config.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: FS_MICRO,
                    color: deptColor,
                    background: `${deptColor}22`,
                    border: `1px solid ${deptColor}66`,
                    padding: '1px 4px',
                    letterSpacing: 1,
                  }}
                >
                  {deptLabel}
                </span>
                {layer && (
                  <span style={{ fontSize: FS_MICRO, color: 'var(--pixel-text-dim)' }}>
                    ⟨{layer}⟩
                  </span>
                )}
                <button
                  onClick={closeCard}
                  title="閉じる (Esc)"
                  aria-label="閉じる"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: FS_BODY,
                    padding: '0 2px',
                    color: 'var(--pixel-close-text)',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 役割 · id */}
            <div style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)', marginTop: 2 }}>
              {config.role} · {config.id}
            </div>

            {/* 状態 dot + label + 滞在時間 + 状態チップ (両タブ常時可視) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 5,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: dotColor,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: FS_BODY, color: stateLabelColor }}>{stateLabel}</span>
              <span style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>
                · {formatElapsedJa(stateElapsed)}
              </span>
              {chip && (
                <span
                  style={{
                    fontSize: FS_SUB,
                    color: chip.color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    marginLeft: 2,
                  }}
                >
                  {chip.emoji && <span>{chip.emoji}</span>}
                  {chip.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── タブ帯 (spec §2・角丸/blur無・steps切替) ── */}
        <div style={{ display: 'flex' }}>
          {tabBtn('profile', 'プロフィール')}
          {tabBtn('work', 'いまのしごと')}
        </div>

        {tab === 'profile' ? (
          /* ══ TAB-A: プロフィール (既定・最初に見せる) ══ */
          <div style={{ padding: '8px 10px 10px' }}>
            {/* ① 性格 + 思想 tagline (引用調・essay 禁止) */}
            {persona ? (
              <>
                <div
                  style={{
                    fontSize: FS_BODY,
                    color: 'var(--pixel-text)',
                    lineHeight: 1.5,
                    whiteSpace: 'normal',
                  }}
                >
                  “{persona.personality}”
                </div>
                {persona.philosophy && (
                  <div
                    style={{
                      fontSize: FS_SUB,
                      color: '#9a9ab8',
                      lineHeight: 1.5,
                      marginTop: 2,
                      whiteSpace: 'normal',
                    }}
                  >
                    “{persona.philosophy}”
                  </div>
                )}
                {/* ② 簡易キャリア */}
                {persona.career && (
                  <div
                    style={{
                      fontSize: FS_MICRO,
                      color: 'var(--pixel-text-dim)',
                      marginTop: 5,
                      whiteSpace: 'normal',
                    }}
                  >
                    {persona.career}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>ペルソナ未設定</div>
            )}

            {/* ③ 得意 チップ (accent/green) */}
            {strengthChips.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginTop: 7,
                  flexWrap: 'wrap',
                }}
              >
                <span style={personaLabelStyle}>得意</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                  {strengthChips.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: FS_MICRO,
                        color: '#5ac88c',
                        background: '#5ac88c1a',
                        border: '1px solid #5ac88c55',
                        padding: '1px 5px',
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* ③ 苦手 チップ (dim/赤み・空なら行ごと非表示) */}
            {weaknessChips.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginTop: 4,
                  flexWrap: 'wrap',
                }}
              >
                <span style={personaLabelStyle}>苦手</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                  {weaknessChips.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: FS_MICRO,
                        color: '#c98a8a',
                        background: '#c98a8a1a',
                        border: '1px solid #c98a8a55',
                        padding: '1px 5px',
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* ④ 主な業務 (無ければ role fallback) */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={personaLabelStyle}>業務</span>
              <span style={{ fontSize: FS_SUB, color: '#b8b8d0', flex: 1, whiteSpace: 'normal' }}>
                {mainWork}
              </span>
            </div>

            {/* ── 素質 ・ 設定値 (telemetry でないと明示・実測誤読を防ぐ) ── */}
            <div style={statGroupCaptionStyle}>素質 ・ 設定値</div>
            <StatBar label="経験" pct={experiencePct} note={layer ?? '—'} color={STAT_GOLD} />
            <StatBar
              label="専門性"
              pct={specialtyPct}
              note={specialtyPct === null ? '設定なし' : String(specialtyPct)}
              color={STAT_GOLD}
            />

            {/* 2px ピクセル区切り (素質↔活動の境界) */}
            <div style={{ height: 0, borderTop: '2px solid #2a2a3c', marginTop: 6 }} />

            {/* ── 活動 ・ 実データ ── */}
            <div style={statGroupCaptionStyle}>活動 ・ 実データ</div>
            <StatBar
              label="作業量"
              pct={throughputPct}
              note={`通算 ${totalCount}`}
              color={STAT_COOL}
            />
            <StatBar
              label="会話量"
              pct={conversationPct}
              note={`委任 ${convoRaw}`}
              color={STAT_COOL}
            />
            <StatBar label="勢い" pct={momentumPct} note="直近" color={STAT_COOL} />
          </div>
        ) : (
          /* ══ TAB-B: いまのしごと (v1 の柱を収容) ══ */
          <div>
            {/* ── 担当しごと (現タスク = open work 由来・§5 統一) ── */}
            <div style={sectionHeaderStyle}>担当しごと</div>
            <div style={{ padding: '0 10px 8px' }}>
              {!showEmpty ? (
                <div style={{ marginBottom: restOpen.length > 0 ? 8 : 0 }}>
                  {/* badge enrich: running TaskDef があれば headline 出所に関係なく付与 (spec §5) */}
                  {runningDef && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: FS_MICRO,
                          fontWeight: 700,
                          color: PRIORITY_COLORS[runningDef.priority] ?? '#8b949e',
                          border: `1px solid ${PRIORITY_COLORS[runningDef.priority] ?? '#8b949e'}`,
                          padding: '0 4px',
                        }}
                      >
                        {PRIORITY_LABELS[runningDef.priority] ?? `P${runningDef.priority}`}
                      </span>
                      {runningDef.confidence && <ConfidenceBadge level={runningDef.confidence} />}
                      {runningDef.extractedAt != null &&
                        (() => {
                          const { label, warn } = formatFreshness(runningDef.extractedAt);
                          return (
                            <span
                              style={{ fontSize: FS_MICRO, color: warn ? '#f59e0b' : '#888899' }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                    </div>
                  )}
                  {/* headline (実データ全文折返し) */}
                  <div
                    style={{
                      fontSize: FS_BODY,
                      color: 'var(--pixel-text)',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: 1.5,
                    }}
                  >
                    {headlineText}
                  </div>
                  {/* current work chip (着手済/受付のみ/停滞 + 経過)。currentWork 由来のみ。 */}
                  {currentWork && (
                    <div style={{ fontSize: FS_MICRO, color: '#7a7a92', marginTop: 3 }}>
                      {currentWork.stalled
                        ? '停滞'
                        : currentWork.hasStarted
                          ? '着手済'
                          : '受付のみ'}{' '}
                      {formatElapsedJa(now - currentWork.startedAt)}
                    </div>
                  )}
                </div>
              ) : (
                /* 空状態 (spec §5 must_fix#4: 承認待ち / 在席手空き / 不在 を撃ち分け) */
                <div style={{ fontSize: FS_BODY, color: 'var(--pixel-text-dim)', marginBottom: 6 }}>
                  {isApproval
                    ? '承認待ち・回答待ち'
                    : isWaiting
                      ? '手が空いています'
                      : '現在のしごとはありません'}
                  {!isApproval && isWaiting && murmur && (
                    <div style={{ fontSize: FS_SUB, color: '#7a7a92', marginTop: 3 }}>
                      “{murmur}”
                    </div>
                  )}
                </div>
              )}

              {/* 活動サマリ (人間可読 1 行・折返し・據置) */}
              {activitySummary && (
                <div
                  style={{
                    fontSize: FS_SUB,
                    color: '#9a9ab8',
                    whiteSpace: 'normal',
                    marginBottom: restOpen.length > 0 ? 6 : 0,
                  }}
                >
                  {activitySummary}
                </div>
              )}

              {/* 未完了リスト (headline に昇格した 1 件を除いた残り) */}
              {restOpen.length > 0 && (
                <>
                  <div style={{ fontSize: FS_SUB, color: '#7a7a92', margin: '2px 0 3px' }}>
                    未完了
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {restOpen.map((w) => {
                      const c = w.stalled ? '#f59e0b' : '#b8b8d0';
                      return (
                        <div
                          key={`${w.task}|${w.startedAt}`}
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 5,
                            fontSize: FS_SUB,
                            whiteSpace: 'normal',
                          }}
                        >
                          <span style={{ color: c, flexShrink: 0 }}>{w.stalled ? '⚠' : '▸'}</span>
                          <span style={{ color: c, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                            {w.task || '(無題のしごと)'}
                          </span>
                          <span style={{ color: '#7a7a92', flexShrink: 0 }}>
                            {w.stalled ? '停滞' : w.hasStarted ? '着手済' : '受付のみ'}{' '}
                            {formatElapsedJa(now - w.startedAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── 稼働履歴 (通算処理数を主役に簡素化・spec §6) ── */}
            <div style={sectionHeaderStyle}>稼働履歴</div>
            <div style={{ padding: '4px 10px 8px' }}>
              {/* 通算 HERO (大 full-height amber 数字・本日でなく通算) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>通算</span>
                <b style={{ fontSize: 30, fontWeight: 900, color: '#E4C36E', lineHeight: 1 }}>
                  {totalCount}
                </b>
                <span style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>件 処理</span>
              </div>
              {/* 従の小行: 記録境界 + 本日 + すべての履歴 (0件 と 記録なし を区別) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: FS_MICRO,
                  color: '#7a7a92',
                }}
              >
                <span>
                  {earliest !== null
                    ? `記録 ${formatMD(earliest)}〜 · 本日 ${todayCount}件`
                    : '記録なし'}
                </span>
                {onOpenArchive && (
                  <button
                    onClick={onOpenArchive}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: FS_MICRO,
                      color: 'var(--pixel-accent)',
                      padding: 0,
                    }}
                  >
                    すべての履歴
                  </button>
                )}
              </div>
            </div>

            {/* ── 相性 (今のしごと・READ-ONLY 最小・いまのしごとタブ末尾に据置) ── */}
            <div style={sectionHeaderStyle}>相性（今のしごと）</div>
            <div
              style={{
                padding: '2px 10px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: FS_BODY, letterSpacing: 1, color: affinityColor }}>
                {Array.from({ length: AFFINITY_HEARTS })
                  .map((_, i) => (i < heartsFilled ? '♥' : '♡'))
                  .join('')}
              </span>
              <span style={{ fontSize: FS_SUB, color: 'var(--pixel-text-dim)' }}>
                {affinityLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
