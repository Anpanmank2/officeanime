// ── 全社稼働可視化ボード (マクロ層ロースター＋コンペバッジ) ────────────────────
// 設計正本: .company/engineering/docs/2026-07-25-pixel-office-activation-board-spec-fujii.md
// 個人カルテ (JCMemberInfoPanel・ミクロ) / 部署カルテ (DeptKartePanel・メゾ) に対する
// マクロ層 = 全28名を1画面で俯瞰する新パネル。
// トリガー: 左上「会社ボード」ミニパネル (App.tsx CommandBoard) のクリックのみ。
// 表示項目は全て既存 karte-state.ts の3関数 (computeMemberWorkloads /
// computeDeptOccupancy / computeCompletionArchive) + computeOpenWork /
// karteWorkingCount / karteEarliestAt + game-state.ts / office-hours-state.ts の
// 既存値の組み合わせのみで構成する。新規集計関数は0本 (karte-state.ts 無改変)。
//
// ⚠ 触るな境界 (社員カルテv2 spec §10 と同一・無改変・import もしない):
//   affinity*.ts / affinity-preview.ts / routing-target.ts / persona-lines.ts /
//   ResearchResultPanel.tsx / research-result-state.ts
//
// コンペバッジ (古賀design §6 反映・spec §3): 絶対件数バッジのみ (🥉🥈🥇)。
// %表示・相対順位は一切実装しない。報酬=演出のみ (評価接続ロジックは未実装)。
// 主指標は「通算完了件数 (named route集計・PM PASS未検証)」の proxy — 正式主指標
// (PM PASS紐付き実働ヒット数) は jc-events に検証フィールドが無く needs_wiring (spec §7)。
//
// ── badge「一度も登場しない」判定の限界 (誠実に明記) ──────────────────────────
// karte-state.ts は「この member が過去に一度でも jc-event に登場したか」を直接
// 答える関数を持たない (新規集計関数0本の制約のため追加もしない)。本コンポーネントは
// 既存2関数の返り値だけから近似する: 通算完了 (computeCompletionArchive) に1件でも
// あるか、または現在進行中の仕事 (computeMemberWorkloads) を持つか。どちらも無ければ
// 「─」(未計測) とする。放置(abandoned・12h)で盤面から消えた後に一度も完了しなかった
// member は、実際には過去に delegate 等で登場していても本近似では「─」になり得る
// (既知の限界。spec §7 needs_wiring と同種の proxy 制約)。
//
// パネル様式: JCMemberInfoPanel/DeptKartePanel と同一のピクセル調 (チャコール地・
// ティール枠・ハード影)。トリガーがキャラ/デスクのクリック位置でなく固定ミニパネルの
// ため、position prop は持たず画面上部中央に固定配置する (他パネルとの相違点)。

import { useEffect, useState } from 'react';

import { gameGetCompanyScore, gameGetTodayCount, subscribeGame } from './game-state.js';
import {
  COMP_BADGE_BRONZE,
  COMP_BADGE_EXCLUDED_IDS,
  COMP_BADGE_EXCLUDED_LABEL,
  COMP_BADGE_GOLD,
  COMP_BADGE_NONE_GLYPH,
  COMP_BADGE_SILVER,
  COMP_BADGE_TOOLTIP_DISCLAIMER,
  OFFICE_HEARTBEAT_LABEL_COLOR,
  OFFICE_PILL_BG,
  OFFICE_PILL_CLOSED_COLOR,
  OFFICE_PILL_OPEN_COLOR,
  OFFICE_PILL_TEXT_COLOR,
  STATE_COLORS,
  ZONE_LABEL_TEXT,
} from './jc-constants.js';
import { jcGetAllMembers, jcGetMemberRuntime, subscribeMembers } from './jc-state.js';
import type { JCMemberConfig } from './jc-types.js';
import {
  computeCompletionArchive,
  computeDeptOccupancy,
  computeMemberWorkloads,
  computeOpenWork,
  karteEarliestAt,
  karteWorkingCount,
  subscribeKarte,
} from './karte-state.js';
import { MemberPortrait } from './MemberPortrait.js';
import {
  officeHoursGetLastHeartbeatAt,
  officeHoursGetPhase,
  subscribeOfficeHours,
} from './office-hours-state.js';

const PANEL_W = 760;

// パネル配色 (DeptKartePanel §5 差分表と同一値 — ピクセル調の統一)。
const PANEL_BG = 'rgba(38, 43, 47, 0.94)';
const PANEL_BORDER = 'rgba(46, 158, 144, 0.45)';
const ACCENT_TEXT = '#5FC2B4';
const HERO_NUM = '#E4C36E';
const BODY_TEXT = '#D8D2C4';
const MUTED_TEXT = '#8A97A0';

// 区画B/C の部署グルーピング順 (spec §1 mockup と AC-3 記載順に一致・組織図順)。
const DEPT_ORDER = ['exec', 'marketing', 'research', 'engineering'] as const;

// 部署表示名 (DeptKartePanel の DEPT_PANEL_LABEL と同一導出 — ZONE_LABEL_TEXT 由来)。
const DEPT_BOARD_LABEL: Record<string, string> = {
  exec: ZONE_LABEL_TEXT.exec,
  marketing: ZONE_LABEL_TEXT.marketing,
  research: ZONE_LABEL_TEXT.research,
  engineering: ZONE_LABEL_TEXT.dev,
};

// ロースター並び順 §2 (部署→layer→名前の組織図順・Owner確定=選択肢A)。
const LAYER_SORT_WEIGHT: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };
function layerWeight(layer: string | undefined): number {
  if (!layer) return 99;
  return LAYER_SORT_WEIGHT[layer] ?? 50;
}

/** epoch ms → "M/D" (観測開始境界の表示、JCMemberInfoPanel の formatMD と同一 idiom)。 */
function formatMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** office_heartbeat 時刻 → HH:MM (無ければ「—」、App.tsx CommandBoard と同一 idiom)。 */
function formatHeartbeatHHMM(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface BadgeInfo {
  /** 表示グリフ (🥉🥈🥇 / ─ / 対象外 / 素の件数)。 */
  glyph: string;
  /** バッジ色 (tier 無し/対象外/未計測は MUTED_TEXT)。 */
  color: string;
  /** hover tooltip 文言 (title 属性・DeptKartePanel の title={a.label} と同一 idiom)。 */
  tooltip: string;
}

function computeBadge(
  memberId: string,
  completionCount: number,
  hasAnySignal: boolean,
  earliestAt: number | null,
): BadgeInfo {
  if (COMP_BADGE_EXCLUDED_IDS.has(memberId)) {
    // AC-16: 対象外 member は tier 数値・tooltip 内訳のいずれも出さない。
    return {
      glyph: COMP_BADGE_EXCLUDED_LABEL,
      color: MUTED_TEXT,
      tooltip: `${COMP_BADGE_EXCLUDED_LABEL}（Lead/PM/秘書は計測対象外）`,
    };
  }

  // 常時固定表示 (N=0でも表示・誠実性 — 古賀design §6 / spec §3)。
  const earliestLabel = earliestAt !== null ? `${formatMD(earliestAt)}` : '記録なし';
  const tooltip = `実働完了${completionCount}件（named route集計・${earliestLabel}〜現在）\n${COMP_BADGE_TOOLTIP_DISCLAIMER}`;

  if (!hasAnySignal) {
    // AC-10: 一度も jc-events に登場しない member は「─」(「0件」の数字は出さない)。
    return { glyph: COMP_BADGE_NONE_GLYPH, color: MUTED_TEXT, tooltip };
  }
  if (completionCount >= COMP_BADGE_GOLD) return { glyph: '🥇', color: HERO_NUM, tooltip };
  if (completionCount >= COMP_BADGE_SILVER) return { glyph: '🥈', color: '#C7CDD6', tooltip };
  if (completionCount >= COMP_BADGE_BRONZE) return { glyph: '🥉', color: '#C98A4B', tooltip };
  // 登場済みだが bronze 未満 (0-2件): 実数を出す (─ は「未計測」専用・数字を隠さない)。
  return { glyph: `${completionCount}件`, color: MUTED_TEXT, tooltip };
}

export interface CompanyActivationBoardProps {
  onClose: () => void;
}

export function CompanyActivationBoard({ onClose }: CompanyActivationBoardProps) {
  const [now, setNow] = useState(() => Date.now());
  const [members, setMembers] = useState<readonly JCMemberConfig[]>(() => jcGetAllMembers());
  const [companyScore, setCompanyScore] = useState(() => gameGetCompanyScore());
  const [todayCount, setTodayCount] = useState(() => gameGetTodayCount());
  const [officePhase, setOfficePhase] = useState(() => officeHoursGetPhase());
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(() =>
    officeHoursGetLastHeartbeatAt(),
  );

  useEffect(() => {
    const update = () => {
      const t = Date.now();
      setNow(t);
      setMembers(jcGetAllMembers());
      setCompanyScore(gameGetCompanyScore());
      setTodayCount(gameGetTodayCount());
      setOfficePhase(officeHoursGetPhase(t));
      setLastHeartbeatAt(officeHoursGetLastHeartbeatAt());
    };
    update();
    const unsubs = [
      subscribeKarte(update),
      subscribeMembers(update),
      subscribeGame(update),
      subscribeOfficeHours(update),
    ];
    // 経過時間表示のため 30s ごとに再計算 (DeptKartePanel と同一周期)。
    const timer = setInterval(update, 30000);
    return () => {
      for (const u of unsubs) u();
      clearInterval(timer);
    };
  }, []);

  const officeClosed = officePhase === 'closed';

  // ── 区画B: 部署別集計 (AC-3: DeptKartePanel と同一 computeDeptOccupancy 呼び出し) ──
  const occupancy = computeDeptOccupancy(now);
  const openWork = computeOpenWork(now);
  const deptOpenCount: Record<string, number> = {};
  for (const dept of DEPT_ORDER) {
    const deptMemberIds = new Set(members.filter((m) => m.department === dept).map((m) => m.id));
    deptOpenCount[dept] = openWork.filter((w) => deptMemberIds.has(w.memberId)).length;
  }

  // ── 区画C: ロースター (部署→layer→名前の組織図順・Owner確定=選択肢A) ──
  const rosterSorted = [...members].sort((a, b) => {
    const da = DEPT_ORDER.indexOf(a.department as (typeof DEPT_ORDER)[number]);
    const db = DEPT_ORDER.indexOf(b.department as (typeof DEPT_ORDER)[number]);
    const daSafe = da === -1 ? 99 : da;
    const dbSafe = db === -1 ? 99 : db;
    if (daSafe !== dbSafe) return daSafe - dbSafe;
    const la = layerWeight(a.layer);
    const lb = layerWeight(b.layer);
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name, 'ja');
  });

  const groups: Array<{ dept: string; rows: JCMemberConfig[] }> = [];
  for (const m of rosterSorted) {
    const last = groups[groups.length - 1];
    if (last && last.dept === m.department) last.rows.push(m);
    else groups.push({ dept: m.department, rows: [m] });
  }

  // ── バッジ用データ元栓 (既存2関数のみ・新規集計関数0本) ──
  const archive = computeCompletionArchive();
  const completionCounts = new Map<string, number>();
  for (const r of archive) {
    completionCounts.set(r.memberId, (completionCounts.get(r.memberId) ?? 0) + 1);
  }
  const workloads = computeMemberWorkloads(now);
  const earliestAt = karteEarliestAt();

  // ── 区画D: 全社進行中総数 (AC-11: karteWorkingCount または Σ active.length と一致) ──
  let totalActive = 0;
  for (const wl of workloads.values()) totalActive += wl.active.length;
  const workingMemberCount = karteWorkingCount(now);

  return (
    <div
      data-company-activation-board
      style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        width: PANEL_W,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh',
        overflowY: 'auto',
        // 既存帯: DeskCard/RequestFlowPanel/DeptKartePanel/CompletedArchivePanel = 62-65、
        // AbsentStatusPopup=100、DialogBox=200 (2026-07-25 実装時 grep 再確認)。
        // マクロ層ボードは常時それらより手前 (spec §1 案どおり 70 を採用)。
        zIndex: 70,
        pointerEvents: 'auto',
        background: PANEL_BG,
        border: `2px solid ${PANEL_BORDER}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        color: BODY_TEXT,
        fontSize: '13px',
        padding: '12px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── ヘッダー ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          paddingBottom: 6,
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 'bold', color: ACCENT_TEXT }}>
          全社稼働可視化ボード
        </span>
        <button
          onClick={onClose}
          title="閉じる"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-close-text)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 2px',
          }}
        >
          ✕
        </button>
      </div>

      {/* ── 区画A: 会社サマリ (既存CommandBoard値の再掲・新規ロジック0) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '11px', color: MUTED_TEXT }}>会社スコア</span>
            <b style={{ fontSize: '24px', fontWeight: 900, color: '#39ff14', lineHeight: 1 }}>
              {companyScore.toLocaleString()}
            </b>
          </span>
          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '11px', color: MUTED_TEXT }}>本日完了</span>
            <b style={{ fontSize: '24px', fontWeight: 900, color: HERO_NUM, lineHeight: 1 }}>
              {todayCount.toLocaleString()}件
            </b>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: OFFICE_PILL_BG,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: '11px',
              whiteSpace: 'nowrap',
              color: officeClosed ? OFFICE_PILL_CLOSED_COLOR : OFFICE_PILL_TEXT_COLOR,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                display: 'inline-block',
                background: officeClosed ? OFFICE_PILL_CLOSED_COLOR : OFFICE_PILL_OPEN_COLOR,
              }}
            />
            {officeClosed ? '本日終了' : '営業中'}
          </span>
          <span style={{ fontSize: '11px', color: OFFICE_HEARTBEAT_LABEL_COLOR }}>
            最終確認 {formatHeartbeatHHMM(lastHeartbeatAt)}
          </span>
        </div>
      </div>

      {/* ── 区画B: 部署別集計 (既存 computeDeptOccupancy 流用) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${PANEL_BORDER}`,
        }}
      >
        {DEPT_ORDER.map((dept) => {
          const occ = occupancy[dept];
          const working = occ?.working ?? 0;
          const total = occ?.total ?? 0;
          return (
            <div
              key={dept}
              style={{
                background: 'rgba(10, 12, 18, 0.35)',
                padding: '6px 8px',
              }}
            >
              <div style={{ fontSize: '11px', color: ACCENT_TEXT, marginBottom: 3 }}>
                {DEPT_BOARD_LABEL[dept] ?? dept}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#EDE8DC', lineHeight: 1 }}>
                {working}
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: MUTED_TEXT }}>
                  /{total}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: MUTED_TEXT, marginTop: 2 }}>
                進行中{deptOpenCount[dept] ?? 0}件
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 区画C: 全member ロースターグリッド (部署グルーピング・組織図順・常時展開) ── */}
      <div style={{ marginBottom: 10 }}>
        {groups.map((g) => (
          <div key={g.dept} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: '11px',
                color: ACCENT_TEXT,
                letterSpacing: '0.05em',
                marginBottom: 4,
                paddingBottom: 2,
                borderBottom: '1px solid rgba(94,107,115,0.3)',
              }}
            >
              {DEPT_BOARD_LABEL[g.dept] ?? g.dept}
            </div>
            {g.rows.map((m) => {
              const workload = workloads.get(m.id);
              const activeN = workload?.active.length ?? 0;
              const stalledN = workload?.stalled.length ?? 0;
              // R1 稼働区分 (active/stalled/idle) を STATE_COLORS の既存トークンで表現
              // (AC-5: computeMemberWorkloads 由来・STATE_COLORS と一致・個人カルテと
              // 矛盾しない — 個人カルテの13状態FSMそのものではなく、稼働の有無という
              // 上位区分を同じ色系統で表す簡易ダイジェスト)。
              const dotColor =
                activeN > 0
                  ? STATE_COLORS.coding
                  : stalledN > 0
                    ? STATE_COLORS.error
                    : STATE_COLORS.idle;
              const completionCount = completionCounts.get(m.id) ?? 0;
              const hasAnySignal = completionCounts.has(m.id) || workloads.has(m.id);
              const badge = computeBadge(m.id, completionCount, hasAnySignal, earliestAt);
              return (
                <div
                  key={m.id}
                  title={badge.tooltip}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 4px',
                    borderBottom: '1px solid rgba(94,107,115,0.15)',
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 28,
                      minHeight: 32,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                    }}
                  >
                    <MemberPortrait
                      palette={m.palette ?? 0}
                      hueShift={m.hueShift}
                      present={jcGetMemberRuntime(m.id)?.isPresent ?? false}
                    />
                  </div>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#EDE8DC',
                      fontSize: '12px',
                    }}
                  >
                    {m.name}
                    {m.layer && (
                      <span style={{ color: MUTED_TEXT, fontSize: '10px' }}> ⟨{m.layer}⟩</span>
                    )}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      minWidth: 42,
                      textAlign: 'right',
                      fontSize: '13px',
                      color: badge.color,
                    }}
                  >
                    {badge.glyph}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── 区画D: 全社進行中総数 (フッター1行) ── */}
      <div
        style={{
          paddingTop: 8,
          borderTop: `1px solid ${PANEL_BORDER}`,
          fontSize: '12px',
          color: MUTED_TEXT,
        }}
      >
        全社 進行中 <span style={{ color: HERO_NUM, fontWeight: 'bold' }}>{totalActive}</span>件
        （稼働中member{' '}
        <span style={{ color: ACCENT_TEXT, fontWeight: 'bold' }}>{workingMemberCount}</span>
        人）
      </div>
    </div>
  );
}
