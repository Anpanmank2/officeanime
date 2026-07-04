// ── 完了アーカイブ (保存ボックス) パネル — R4 (2026-07-03 差戻しv2) ─────
// 本棚クリックで開く履歴ブラウザ。過去の完了しごとを日付順 (新しい順) で見られる。
// データは jc-events 実データ (task_completed / delegation_complete) のみ —
// ダミーなし。jc-events 観測開始前の期間は「記録なし」として明示的に区別する。
// カルテから撤去した「完了の蓄積」はすべてここに集約 (第一弾スキル棚案の置き換え)。

import { useEffect, useState } from 'react';

import { DEPT_COLORS } from './jc-constants.js';
import { jcGetAllMembers, jcGetMemberNames, subscribeMembers } from './jc-state.js';
import {
  type CompletionRecord,
  computeCompletionArchive,
  karteEarliestAt,
  subscribeKarte,
} from './karte-state.js';

const PANEL_W = 380;

const PANEL_BG = 'rgba(38, 43, 47, 0.96)';
const PANEL_BORDER = 'rgba(228, 195, 110, 0.5)'; // 本棚 = アンバー枠 (カルテと区別)
const ACCENT_TEXT = '#E4C36E';
const BODY_TEXT = '#D8D2C4';
const MUTED_TEXT = '#8A97A0';

function dayLabel(dayStart: number): string {
  const d = new Date(dayStart);
  const youbi = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${youbi})`;
}

function timeLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function localDayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface CompletedArchivePanelProps {
  position: { x: number; y: number };
  onClose: () => void;
}

export function CompletedArchivePanel({ position, onClose }: CompletedArchivePanelProps) {
  const [records, setRecords] = useState<CompletionRecord[]>(() => computeCompletionArchive());
  const [earliestAt, setEarliestAt] = useState<number | null>(() => karteEarliestAt());
  const [names, setNames] = useState(() => jcGetMemberNames());

  useEffect(() => {
    const update = () => {
      setRecords(computeCompletionArchive());
      setEarliestAt(karteEarliestAt());
      setNames(jcGetMemberNames());
    };
    update();
    const unsubKarte = subscribeKarte(update);
    const unsubMembers = subscribeMembers(update);
    return () => {
      unsubKarte();
      unsubMembers();
    };
  }, []);

  const nameOf = (memberId: string) => names.get(memberId) ?? memberId;
  const deptOf = new Map<string, string>();
  for (const m of jcGetAllMembers()) deptOf.set(m.id, m.department);

  // 日付グループ (新しい順)
  const groups: Array<{ dayStart: number; items: CompletionRecord[] }> = [];
  for (const r of records) {
    const ds = localDayStart(r.completedAt);
    const last = groups[groups.length - 1];
    if (last && last.dayStart === ds) last.items.push(r);
    else groups.push({ dayStart: ds, items: [r] });
  }

  const left = Math.max(8, Math.min(position.x - PANEL_W / 2, window.innerWidth - PANEL_W - 8));
  const top = Math.max(8, Math.min(position.y + 10, window.innerHeight * 0.2));

  return (
    <div
      data-completed-archive
      style={{
        position: 'absolute',
        left,
        top,
        width: PANEL_W,
        maxHeight: '66vh',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 62,
        background: PANEL_BG,
        border: `2px solid ${PANEL_BORDER}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        color: BODY_TEXT,
        fontSize: '13px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── ヘッダー ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px 8px',
          borderBottom: `1px solid ${PANEL_BORDER}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: '15px', fontWeight: 'bold', color: ACCENT_TEXT }}>
            📚 完了アーカイブ
          </span>
          <span style={{ fontSize: '22px', fontWeight: 900, color: ACCENT_TEXT, lineHeight: 1 }}>
            {records.length}
          </span>
          <span style={{ fontSize: '11px', color: MUTED_TEXT }}>件</span>
        </div>
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

      {/* ── 本文 (日付順の履歴ブラウザ) ── */}
      <div style={{ overflowY: 'auto', minHeight: 0, padding: '10px 14px' }}>
        {groups.length === 0 ? (
          <div style={{ color: MUTED_TEXT, padding: '8px 0' }}>
            完了したしごとの記録は まだありません
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.dayStart} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 6,
                  borderBottom: '1px solid rgba(228,195,110,0.25)',
                  paddingBottom: 3,
                }}
              >
                <span style={{ color: ACCENT_TEXT, fontWeight: 'bold', fontSize: '13px' }}>
                  {dayLabel(g.dayStart)}
                </span>
                <span style={{ color: MUTED_TEXT, fontSize: '11px' }}>{g.items.length}件</span>
              </div>
              {g.items.map((r) => (
                <div
                  key={`${r.memberId}|${r.task}|${r.completedAt}`}
                  style={{ display: 'flex', gap: 7, marginBottom: 4, alignItems: 'baseline' }}
                >
                  <span style={{ color: MUTED_TEXT, flexShrink: 0, fontSize: '11px' }}>
                    {timeLabel(r.completedAt)}
                  </span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      flexShrink: 0,
                      alignSelf: 'center',
                      background: DEPT_COLORS[deptOf.get(r.memberId) ?? ''] ?? '#888',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#EDE8DC',
                    }}
                    title={r.task}
                  >
                    {r.task || '(タスク名なし)'}
                  </span>
                  <span style={{ color: '#5FC2B4', flexShrink: 0, fontSize: '11px' }}>
                    {nameOf(r.memberId)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── フッター: 観測開始前は「記録なし」(0件と区別) ── */}
      <div
        style={{
          padding: '6px 14px 8px',
          borderTop: `1px solid rgba(228,195,110,0.25)`,
          color: MUTED_TEXT,
          fontSize: '10px',
          flexShrink: 0,
        }}
      >
        {earliestAt !== null
          ? `※ ${dayLabel(localDayStart(earliestAt))} より前は記録なし（イベント観測開始前）`
          : '※ イベントの観測記録がまだありません'}
      </div>
    </div>
  );
}
