// ── Office Library — one compact home for the company's saved work ──────────
// The bookcase is only an entrance to records. It never limits access to the
// actual history; BottomToolbar offers the same panel as a menu fallback.

import { useState } from 'react';

import { CompletedArchivePanel } from './CompletedArchivePanel.js';
import { TaskHistoryPanel } from './TaskHistoryPanel.js';
import { WorkResults } from './WorkPanel.js';

type LibraryTab = 'results' | 'records' | 'research';

const tabs: Array<{ id: LibraryTab; label: string }> = [
  { id: 'results', label: '成果' },
  { id: 'records', label: '記録' },
  { id: 'research', label: '調査' },
];
const RESEARCH_LABELS = ['research'];

export function OfficeLibraryPanel({
  onClose,
  selectedId,
}: {
  onClose: () => void;
  selectedId?: string | null;
}) {
  const [tab, setTab] = useState<LibraryTab>('results');

  return (
    <aside
      data-office-library
      aria-label="会社の本棚"
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        bottom: 8,
        width: 'min(380px, calc(100vw - 16px))',
        zIndex: 62,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(38, 43, 47, 0.96)',
        border: '2px solid rgba(228, 195, 110, 0.5)',
        boxShadow: '2px 2px 0 #0a0a14',
        color: '#D8D2C4',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px 8px',
          borderBottom: '1px solid rgba(228, 195, 110, 0.35)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#E4C36E', fontSize: 15, fontWeight: 'bold' }}>📚 本棚</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="本棚を閉じる"
          style={{
            color: 'var(--pixel-close-text)',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </header>

      <nav
        aria-label="本棚の分類"
        style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            style={{
              flex: 1,
              padding: '7px 0',
              color: tab === item.id ? '#E4C36E' : 'var(--pixel-text-dim)',
              background: tab === item.id ? 'rgba(228, 195, 110, 0.12)' : 'transparent',
              border: 0,
              borderBottom: tab === item.id ? '2px solid #E4C36E' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
        {tab === 'results' && (
          <>
            <WorkResults selectedId={selectedId} />
            <CompletedArchivePanel embedded />
          </>
        )}
        {tab === 'records' && <TaskHistoryPanel embedded />}
        {tab === 'research' && (
          <TaskHistoryPanel
            embedded
            labels={RESEARCH_LABELS}
            emptyMessage="調査の記録は まだありません"
          />
        )}
      </div>
    </aside>
  );
}
