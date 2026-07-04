// ── Slice1 T10: Delegation Dock (bottom bar of task cards) ─────────────
// Owner clicks a card to "pick it up", then clicks a member on the board to
// delegate. The picked card is highlighted; a hint tells the Owner what to do.

import { useEffect, useState } from 'react';

import {
  dockAddCard,
  type DockCard,
  dockGetCards,
  dockGetPickedId,
  dockPickCard,
  subscribeDock,
} from './dock-state.js';
import { DEPT_COLORS } from './jc-constants.js';
import { jcGetMemberRuntime } from './jc-state.js';
import { openRequestFlow, type RequestKind } from './request-flow-state.js';
import { pickBestMember, type RoutingScope } from './routing-target.js';

const PRIORITY_COLOR: Record<number, string> = {
  0: '#ff3d3d',
  1: '#ff3d3d',
  2: '#f0ad4e',
  3: '#00b4ff',
  4: '#888899',
};

/**
 * 依頼カード 4種 (2026-07-02 横展開)。research は現行 pilot の挙動そのまま
 * (kw/scope/priority 無改変・先頭のまま = 既存 e2e Test7 の .first() も不変)。
 * kw は pickBestMember の affinity 選定用、fallback は config 未ロード時の保険。
 */
const REQUEST_CARDS: Array<{
  kind: RequestKind;
  icon: string;
  label: string;
  scope: RoutingScope;
  kw: string;
  fallback: string;
  title: string;
}> = [
  {
    kind: 'research',
    icon: '📋',
    label: '調査を依頼',
    scope: 'research',
    kw: '調査 research 分析',
    fallback: 'res-01',
    title: '調査を依頼（テンプレを開く → はい/いいえで確認 → 実行）',
  },
  {
    kind: 'market',
    icon: '📊',
    label: '市場調査を依頼',
    scope: 'marketing',
    kw: '市場調査 競合 顧客 分析',
    fallback: 'mkt-01',
    title: '市場調査を依頼（テンプレ → マーケ視点の確認 → 調査実行）',
  },
  {
    kind: 'doc',
    icon: '📄',
    label: '資料を依頼',
    scope: 'marketing',
    kw: '資料 スライド ドキュメント 作成',
    fallback: 'mkt-01',
    title: '資料を依頼（テンプレ → 確認+計画OK → 下書き置き場にドラフト作成）',
  },
  {
    kind: 'impl',
    icon: '🔧',
    label: '実装を依頼',
    scope: 'engineering',
    kw: '実装 コード 修正 開発',
    fallback: 'eng-01',
    title: '実装を依頼（テンプレ → 確認+計画OK → コード一式+適用手順のドラフト）',
  },
];

/** Dept color for a routing scope (dock button accent). */
function scopeColor(scope: RoutingScope): string {
  return DEPT_COLORS[scope] ?? '#00e676';
}

export function DelegationDock() {
  const [cards, setCards] = useState<readonly DockCard[]>(dockGetCards());
  const [pickedId, setPickedId] = useState<string | null>(dockGetPickedId());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const update = () => {
      setCards(dockGetCards());
      setPickedId(dockGetPickedId());
    };
    update();
    return subscribeDock(update);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '70%',
        flexWrap: 'wrap',
        background: 'rgba(38, 43, 47, 0.94)',
        border: '2px solid var(--pixel-border, #2a2a3a)',
        boxShadow: '2px 2px 0px #0a0a14',
        borderRadius: 0,
        padding: '6px 10px',
        fontFamily: '"Press Start 2P", monospace',
      }}
    >
      <span style={{ color: '#5FC2B4', fontSize: 10, marginRight: 4 }}>
        委任ドック
        {pickedId && (
          <span style={{ color: '#39ff14' }}> ▶ 秘書か部署ゾーンへ (自動で最適担当)</span>
        )}
      </span>

      {/* 依頼(request) entries — 4 cards (2026-07-02 横展開): each opens the
          3-field template routed to the best-◎ member of its dept. read型
          (調査/市場調査) run the research active path; write型 (資料/実装) close
          with a plan-confirm and write ONLY to the staging 下書き置き場. */}
      {REQUEST_CARDS.map((card) => {
        const accent = scopeColor(card.scope);
        return (
          <button
            key={card.kind}
            data-request-open
            data-request-kind={card.kind}
            onClick={() => {
              const best = pickBestMember(card.kw, card.scope);
              const memberId = best?.memberId ?? card.fallback;
              const rt = jcGetMemberRuntime(memberId);
              openRequestFlow({
                memberId,
                memberName: rt?.config.name ?? memberId,
                department: rt?.config.department ?? card.scope,
                kind: card.kind,
                priority: 3,
              });
            }}
            title={card.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: `${accent}26`,
              border: `2px solid ${accent}`,
              boxShadow: '1px 1px 0px #0a0a14',
              borderRadius: 0,
              padding: '4px 10px',
              color: '#e8e8f4',
              fontFamily: 'inherit',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: accent }}>{card.icon}</span>
            <span>{card.label}</span>
          </button>
        );
      })}

      {cards.map((c) => {
        const picked = c.id === pickedId;
        const accent = PRIORITY_COLOR[c.priority] ?? '#00b4ff';
        return (
          <button
            key={c.id}
            onClick={() => dockPickCard(c.id)}
            title={c.task}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: picked ? 'rgba(57,255,20,0.18)' : 'rgba(20,24,45,0.9)',
              border: `2px solid ${picked ? '#39ff14' : accent}`,
              boxShadow: picked ? '0 0 0 1px #39ff14' : '1px 1px 0px #0a0a14',
              borderRadius: 0,
              padding: '4px 8px',
              color: '#eef',
              fontFamily: 'inherit',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: accent }}>P{c.priority}</span>
            <span>{c.short}</span>
          </button>
        );
      })}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              dockAddCard(draft);
              setDraft('');
              setAdding(false);
            } else if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder="タスク名 (Enter)"
          style={{
            background: '#14182d',
            border: '2px solid #00b4ff',
            borderRadius: 0,
            color: '#eef',
            fontFamily: 'inherit',
            fontSize: 10,
            padding: '3px 6px',
            width: 140,
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="タスクを追加"
          style={{
            background: 'rgba(20,24,45,0.9)',
            border: '2px dashed #556',
            borderRadius: 0,
            color: '#889',
            fontFamily: 'inherit',
            fontSize: 12,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      )}
    </div>
  );
}
