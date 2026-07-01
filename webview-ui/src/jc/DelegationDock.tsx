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

const PRIORITY_COLOR: Record<number, string> = {
  0: '#ff3d3d',
  1: '#ff3d3d',
  2: '#f0ad4e',
  3: '#00b4ff',
  4: '#888899',
};

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
        background: 'rgba(8, 10, 25, 0.92)',
        border: '2px solid var(--pixel-border, #2a2a3a)',
        boxShadow: '2px 2px 0px #0a0a14',
        borderRadius: 0,
        padding: '6px 10px',
        fontFamily: '"Press Start 2P", monospace',
      }}
    >
      <span style={{ color: '#00f0ff', fontSize: 10, marginRight: 4 }}>
        委任ドック
        {pickedId && <span style={{ color: '#39ff14' }}> ▶ 担当をクリック</span>}
      </span>

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
