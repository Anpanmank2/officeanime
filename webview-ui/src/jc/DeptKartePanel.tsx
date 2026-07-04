// ── 部署カルテパネル v2 (2026-07-03 差戻しv2 / Owner確定 R3) ──────────
// 部署ホワイトボードのクリックで開く。表示値は全て jc-events 実データ +
// 依頼フロー/承認まちの live store — ダミー値なし。
// ① 稼働 (大きい数字・R1 統一定義 = 未完了しごと保有)
// ② 詰まり・要対応 (承認待ち‼️ + 長時間停滞) — 上位に配置
// ③ 依頼ごとの進行状況 (受付→確認→実行中→完了 の段階表示)
// ※ 完了の蓄積 (今週完了/直近/7日推移) はカルテから撤去 → 本棚の完了アーカイブへ

import { useEffect, useState } from 'react';

import {
  OCCUPANCY_CHIP_COLORS,
  STATUS_APPROVAL_EMOJI,
  WORK_STALL_MS,
  ZONE_LABEL_TEXT,
} from './jc-constants.js';
import { jcGetAllMembers, jcGetMemberNames, subscribeMembers } from './jc-state.js';
import {
  computeDeptOccupancy,
  computeOpenWork,
  type OpenWork,
  subscribeKarte,
} from './karte-state.js';
import { getPlans, type PlanCard, subscribePlans } from './plan-state.js';
import { getRequestFlow, type RequestFlow, subscribeRequestFlow } from './request-flow-state.js';

const PANEL_W = 340;

// パネル配色 (§5 差分表)
const PANEL_BG = 'rgba(38, 43, 47, 0.94)'; // チャコール地
const PANEL_BORDER = 'rgba(46, 158, 144, 0.45)'; // ティール枠
const ACCENT_TEXT = '#5FC2B4'; // アクセント文字
const HERO_NUM = '#E4C36E'; // 数値ヒーロー (アンバー)
const BODY_TEXT = '#D8D2C4'; // 本文
const MUTED_TEXT = '#8A97A0'; // 補助 (旧スレートより1段明るく — 可読性向上)
const ALERT_RED = '#ff6b6b'; // 詰まり・要対応

// department → 画面表示名 (ZONE_LABEL_TEXT と同一文言)
const DEPT_PANEL_LABEL: Record<string, string> = {
  marketing: ZONE_LABEL_TEXT.marketing,
  research: ZONE_LABEL_TEXT.research,
  engineering: ZONE_LABEL_TEXT.dev,
  exec: ZONE_LABEL_TEXT.exec,
};

const STAGES = ['受付', '確認', '実行中', '完了'] as const;

function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '1分未満';
  if (min < 60) return `${min}分`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}時間${min % 60 > 0 ? `${min % 60}分` : ''}`;
  return `${Math.floor(hours / 24)}日${hours % 24 > 0 ? `${hours % 24}時間` : ''}`;
}

/** 受付→確認→実行中→完了 の段階ストリップ (current を強調・済みは点灯) */
function StageStrip({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
      {STAGES.map((label, i) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 5px',
              border: `1px solid ${i === current ? HERO_NUM : i < current ? ACCENT_TEXT : 'rgba(94,107,115,0.5)'}`,
              color:
                i === current ? '#0a0a14' : i < current ? ACCENT_TEXT : 'rgba(138,151,160,0.7)',
              background: i === current ? HERO_NUM : 'transparent',
              fontWeight: i === current ? 'bold' : 'normal',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
          {i < STAGES.length - 1 && (
            <span style={{ color: 'rgba(94,107,115,0.7)', fontSize: '9px', padding: '0 2px' }}>
              ▸
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** 依頼 1 件分の進行行: タスク名 + 担当 + 経過 + 段階ストリップ */
interface ProgressItem {
  key: string;
  task: string;
  memberId: string;
  since: number | null;
  /** STAGES index: 0=受付 1=確認 2=実行中 (3=完了 はアーカイブ行き) */
  stage: number;
  stalled: boolean;
}

export interface DeptKartePanelProps {
  department: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function DeptKartePanel({ department, position, onClose }: DeptKartePanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [openWork, setOpenWork] = useState<OpenWork[]>(() => computeOpenWork());
  const [occupancy, setOccupancy] = useState(() => computeDeptOccupancy()[department]);
  const [names, setNames] = useState(() => jcGetMemberNames());
  const [flow, setFlow] = useState<RequestFlow | null>(() => getRequestFlow());
  const [plans, setPlans] = useState<PlanCard[]>(() => [...getPlans()]);

  useEffect(() => {
    const update = () => {
      const t = Date.now();
      setNow(t);
      setOpenWork(computeOpenWork(t));
      setOccupancy(computeDeptOccupancy(t)[department]);
      setNames(jcGetMemberNames());
      setFlow(getRequestFlow());
      setPlans([...getPlans()]);
    };
    update();
    const unsubs = [
      subscribeKarte(update),
      subscribeMembers(update),
      subscribeRequestFlow(update),
      subscribePlans(update),
    ];
    // 経過時間表示のため 30s ごとに再計算
    const timer = setInterval(update, 30000);
    return () => {
      for (const u of unsubs) u();
      clearInterval(timer);
    };
  }, [department]);

  const nameOf = (memberId: string) => names.get(memberId) ?? memberId;

  // 部署 roster
  const deptMemberIds = new Set(
    jcGetAllMembers()
      .filter((m) => m.department === department)
      .map((m) => m.id),
  );

  const deptOpen = openWork.filter((w) => deptMemberIds.has(w.memberId));

  // ── ② 詰まり・要対応 ──
  // 承認待ち (Owner回答待ち): 依頼フロー confirming + plan承認まち
  const approvalItems: Array<{ key: string; label: string; memberId: string }> = [];
  if (flow && flow.phase === 'confirming' && deptMemberIds.has(flow.memberId)) {
    const t = flow.template.overview || flow.template.purpose || '依頼のすり合わせ';
    approvalItems.push({ key: `flow-${flow.id}`, label: t, memberId: flow.memberId });
  }
  for (const p of plans) {
    if (p.status === 'awaiting' && deptMemberIds.has(p.memberId)) {
      approvalItems.push({ key: `plan-${p.id}`, label: p.task, memberId: p.memberId });
    }
  }
  const stalledItems = deptOpen.filter((w) => w.stalled);
  const blockedCount = approvalItems.length + stalledItems.length;

  // ── ③ 依頼ごとの進行状況 (未完了のみ — 完了はアーカイブへ) ──
  const progress: ProgressItem[] = [];
  if (flow && deptMemberIds.has(flow.memberId)) {
    // 依頼フロー中 (テンプレ入力/確認質問生成/Owner確認) = 「確認」段階
    progress.push({
      key: `flow-${flow.id}`,
      task: flow.template.overview || flow.template.purpose || '依頼のすり合わせ',
      memberId: flow.memberId,
      since: null,
      stage: 1,
      stalled: false,
    });
  }
  for (const w of deptOpen) {
    progress.push({
      key: `${w.memberId}|${w.task}`,
      task: w.task || '(タスク名なし)',
      memberId: w.memberId,
      since: w.startedAt,
      stage: w.hasStarted ? 2 : 0,
      stalled: w.stalled,
    });
  }

  const working = occupancy?.working ?? 0;
  const total = occupancy?.total ?? 0;
  const rate = total > 0 ? (working / total) * 100 : 0;
  const chipColor =
    rate >= 50
      ? OCCUPANCY_CHIP_COLORS.high
      : rate > 0
        ? OCCUPANCY_CHIP_COLORS.mid
        : OCCUPANCY_CHIP_COLORS.zero;

  // 画面外にはみ出さないよう clamp
  const left = Math.max(8, Math.min(position.x - PANEL_W / 2, window.innerWidth - PANEL_W - 8));
  const top = Math.max(8, Math.min(position.y + 12, window.innerHeight * 0.28));

  const sectionTitle: React.CSSProperties = {
    fontSize: '12px',
    color: ACCENT_TEXT,
    marginBottom: 6,
    letterSpacing: '0.05em',
  };

  return (
    <div
      data-dept-karte
      style={{
        position: 'absolute',
        left,
        top,
        width: PANEL_W,
        maxHeight: '62vh',
        overflowY: 'auto',
        zIndex: 62,
        background: PANEL_BG,
        border: `2px solid ${PANEL_BORDER}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        color: BODY_TEXT,
        fontSize: '13px',
        padding: '12px 14px',
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
          {DEPT_PANEL_LABEL[department] ?? department} カルテ
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

      {/* ── ① 稼働 (大きい数字・R1 統一定義) ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={sectionTitle}>稼働</span>
          <span style={{ fontSize: '30px', fontWeight: 900, color: chipColor, lineHeight: 1 }}>
            {working}
            <span style={{ fontSize: '16px', fontWeight: 'bold' }}>/{total}</span>
          </span>
          <span style={{ fontSize: '11px', color: MUTED_TEXT }}>
            働き/在籍（未完了のしごとを持つ人）
          </span>
        </div>
        <div style={{ height: 8, background: 'rgba(10, 12, 18, 0.6)', position: 'relative' }}>
          <div
            style={{
              width: `${total > 0 ? Math.round((working / total) * 100) : 0}%`,
              height: '100%',
              background: chipColor,
            }}
          />
        </div>
      </div>

      {/* ── ② 詰まり・要対応 (上位配置) ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={sectionTitle}>詰まり・要対応</span>
          <span
            style={{
              fontSize: '22px',
              fontWeight: 900,
              lineHeight: 1,
              color: blockedCount > 0 ? ALERT_RED : MUTED_TEXT,
            }}
          >
            {blockedCount}
          </span>
          <span style={{ fontSize: '11px', color: MUTED_TEXT }}>件</span>
        </div>
        {blockedCount === 0 ? (
          <div style={{ color: MUTED_TEXT, fontSize: '12px' }}>なし — 順調です</div>
        ) : (
          <>
            {approvalItems.map((a) => (
              <div
                key={a.key}
                style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'baseline' }}
              >
                <span style={{ flexShrink: 0 }}>{STATUS_APPROVAL_EMOJI}</span>
                <span style={{ color: ALERT_RED, flexShrink: 0, fontSize: '12px' }}>承認待ち</span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={a.label}
                >
                  {a.label}
                </span>
                <span style={{ color: ACCENT_TEXT, flexShrink: 0, fontSize: '12px' }}>
                  {nameOf(a.memberId)}
                </span>
              </div>
            ))}
            {stalledItems.map((w) => (
              <div
                key={`${w.memberId}|${w.task}`}
                style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'baseline' }}
              >
                <span style={{ flexShrink: 0 }}>⏸</span>
                <span style={{ color: HERO_NUM, flexShrink: 0, fontSize: '12px' }}>停滞</span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={w.task}
                >
                  {w.task || '(タスク名なし)'}
                </span>
                <span style={{ color: ACCENT_TEXT, flexShrink: 0, fontSize: '12px' }}>
                  {nameOf(w.memberId)}
                </span>
                <span style={{ color: ALERT_RED, flexShrink: 0, fontSize: '11px' }}>
                  {formatElapsed(now - w.startedAt)}
                </span>
              </div>
            ))}
            <div style={{ color: MUTED_TEXT, fontSize: '10px', marginTop: 2 }}>
              停滞 = 完了しないまま {Math.round(WORK_STALL_MS / 3600000)}時間 超過
            </div>
          </>
        )}
      </div>

      {/* ── ③ 依頼ごとの進行状況 (受付→確認→実行中→完了) ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={sectionTitle}>依頼ごとの進行状況</span>
          <span style={{ fontSize: '22px', fontWeight: 900, color: HERO_NUM, lineHeight: 1 }}>
            {progress.length}
          </span>
          <span style={{ fontSize: '11px', color: MUTED_TEXT }}>件 進行中</span>
        </div>
        {progress.length === 0 ? (
          <div style={{ color: MUTED_TEXT, fontSize: '12px' }}>
            進行中の依頼なし（完了の履歴は本棚のアーカイブへ）
          </div>
        ) : (
          progress.slice(0, 8).map((p) => (
            <div
              key={p.key}
              style={{
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid rgba(94,107,115,0.25)',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4 }}>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#EDE8DC',
                  }}
                  title={p.task}
                >
                  {p.task}
                </span>
                <span style={{ color: ACCENT_TEXT, flexShrink: 0, fontSize: '12px' }}>
                  {nameOf(p.memberId)}
                </span>
                {p.since !== null && (
                  <span
                    style={{
                      color: p.stalled ? ALERT_RED : HERO_NUM,
                      flexShrink: 0,
                      fontSize: '11px',
                    }}
                  >
                    {formatElapsed(now - p.since)}
                  </span>
                )}
              </div>
              <StageStrip current={p.stage} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
