// ── Office Log — Right panel (280px), always visible ────────────
// Replaces AgentDashboard. Shows chronological agent speech/actions.

import { useEffect, useRef, useState } from 'react';
import { useCallback } from 'react';

import { ConfidenceBadge } from './ConfidenceBadge.js';
import { filterByDept } from './dept-filter.js';
import { DeptFilterChips } from './DeptFilterChips.js';
import { DEPT_COLORS, LOG_DEPT_FILTER_MAP, LOG_DEPT_FILTERS } from './jc-constants.js';
import type { OfficeLogEntry } from './jc-types.js';
import { getLogEntries, subscribeLog } from './office-log-state.js';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function LogEntryRow({ entry }: { entry: OfficeLogEntry }) {
  const dotColor = DEPT_COLORS[entry.department] ?? '#666';
  return (
    <div style={{ padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--pixel-text-dim)', minWidth: 36 }}>
          {formatTime(entry.timestamp)}
        </span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 0,
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '14px', color: dotColor, fontWeight: 'bold' }}>
          {entry.memberName}
        </span>
        {entry.confidence && <ConfidenceBadge level={entry.confidence} />}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--pixel-text)', paddingLeft: 48, marginTop: 1 }}>
        {entry.summary}
      </div>
    </div>
  );
}

export function OfficeLog({
  isOpen,
  onClose,
  expanded = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  expanded?: boolean;
}) {
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [entries, setEntries] = useState<OfficeLogEntry[]>([]);
  const [deptFilter, setDeptFilter] = useState<string[]>([
    'exec',
    'engineering',
    'marketing',
    'research',
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleDeptChange = useCallback((selected: string[]) => setDeptFilter(selected), []);

  // Subscribe to log changes
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const dept = LOG_DEPT_FILTER_MAP[activeFilter];
      setEntries([...getLogEntries(dept)].reverse());
    };
    update();
    return subscribeLog(update);
  }, [isOpen, activeFilter]);

  // Auto-scroll to top (newest) on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: expanded ? 400 : 280,
        height: '100%',
        background: 'rgba(8, 10, 25, 0.95)',
        borderLeft: '2px solid rgba(0, 180, 255, 0.3)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '2px solid rgba(0, 180, 255, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '18px', color: '#00f0ff', fontWeight: 'bold' }}>OFFICE LOG</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-close-text)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          X
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {LOG_DEPT_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: '13px',
              background: activeFilter === filter ? 'rgba(0, 180, 255, 0.15)' : 'transparent',
              color: activeFilter === filter ? '#00f0ff' : 'var(--pixel-text-dim)',
              border: 'none',
              borderBottom: activeFilter === filter ? '2px solid #00f0ff' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Dept filter chips */}
      <DeptFilterChips onChange={handleDeptChange} />

      {/* Log entries */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
              textAlign: 'center',
            }}
          >
            No activity yet
          </div>
        ) : (
          filterByDept(entries, deptFilter).map((entry) => (
            <LogEntryRow key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}
