// ── Task History Panel — Left slide-in (320px) ─────────────────

import { useCallback, useEffect, useState } from 'react';

import { vscode } from '../vscodeApi.js';
import { DelegationChain } from './DelegationChain.js';
import { DeptFilterChips } from './DeptFilterChips.js';
import { TASK_LABEL_COLORS } from './jc-constants.js';
import { PriorityBadge } from './PriorityBadge.js';

/** Derive department string from member ID prefix (eng-* → engineering, etc.) */
function deptFromMemberId(id?: string): string {
  if (!id) return 'exec';
  if (id.startsWith('eng-')) return 'engineering';
  if (id.startsWith('mkt-')) return 'marketing';
  if (id.startsWith('res-')) return 'research';
  return 'exec';
}

interface TaskLogEntry {
  taskId: string;
  title: string;
  label: string;
  labelOverride?: string;
  priority: number;
  status: string;
  createdAt: number;
  startedAt?: number;
  completedAt: number;
  durationMs?: number;
  delegationChain: string[];
  assignedTo?: string;
  department?: string;
  pmReview?: { reviewer: string; result: string; timestamp: number };
  outputs?: string[];
  summary?: string;
  prompt: string;
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const PROMPT_PREVIEW_LEN = 200;

function ExpandablePrompt({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  if (prompt.length <= PROMPT_PREVIEW_LEN) {
    return <div style={{ color: '#a0a0c0', marginBottom: 4 }}>{prompt}</div>;
  }
  if (open) {
    return (
      <div style={{ marginBottom: 4 }}>
        <textarea
          readOnly
          value={prompt}
          style={{
            width: '100%',
            minHeight: 72,
            background: 'rgba(0,0,0,0.3)',
            color: '#a0a0c0',
            border: '1px solid var(--pixel-border)',
            borderRadius: 0,
            fontSize: '11px',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            padding: '3px',
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          style={{
            fontSize: '11px',
            color: 'var(--pixel-text-dim)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          折りたたむ
        </button>
      </div>
    );
  }
  return (
    <div style={{ color: '#a0a0c0', marginBottom: 4 }}>
      {prompt.slice(0, PROMPT_PREVIEW_LEN)}...{' '}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          fontSize: '11px',
          color: 'var(--pixel-accent)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        展開
      </button>
    </div>
  );
}

function HistoryEntry({ entry }: { entry: TaskLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const label = entry.labelOverride ?? entry.label;
  const labelColor = TASK_LABEL_COLORS[label] ?? '#8b949e';
  const isIncident = entry.status === 'incident' || entry.status === 'failed';

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        padding: '6px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        background: isIncident ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <PriorityBadge priority={entry.priority} />
        <span
          style={{
            padding: '0 4px',
            fontSize: '11px',
            color: labelColor,
            border: `1px solid ${labelColor}`,
            borderRadius: 0,
          }}
        >
          {label}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            color: 'var(--pixel-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.title}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
          {formatDuration(entry.durationMs)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, paddingLeft: 4 }}>
        <span
          style={{
            fontSize: '11px',
            color:
              entry.status === 'done'
                ? '#39ff14'
                : entry.status === 'failed'
                  ? '#ff3d3d'
                  : '#f0ad4e',
          }}
        >
          {entry.status}
        </span>
        {entry.assignedTo && (
          <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)' }}>
            → {entry.assignedTo}
          </span>
        )}
        {entry.pmReview && (
          <span
            style={{
              fontSize: '11px',
              color: entry.pmReview.result === 'approved' ? '#39ff14' : '#ff3d3d',
            }}
          >
            {entry.pmReview.result === 'approved' ? '✓' : '✗'} PM
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--pixel-text-dim)', marginLeft: 'auto' }}>
          {formatTime(entry.completedAt)}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 4, fontSize: '12px' }}>
          {entry.delegationChain.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <DelegationChain chain={entry.delegationChain} />
            </div>
          )}
          {entry.prompt && <ExpandablePrompt prompt={entry.prompt} />}
          {entry.summary && (
            <div style={{ color: 'var(--pixel-text)', marginBottom: 4 }}>{entry.summary}</div>
          )}
          {entry.outputs && entry.outputs.length > 0 && (
            <div style={{ color: 'var(--pixel-text-dim)' }}>Files: {entry.outputs.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskHistoryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<TaskLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string[]>([
    'exec',
    'engineering',
    'marketing',
    'research',
  ]);
  const handleDeptChange = useCallback((selected: string[]) => setDeptFilter(selected), []);

  // Request history from server on open
  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'jcTaskHistoryLog' && msg.entries) {
        setEntries(msg.entries);
      }
    };
    window.addEventListener('message', handler);

    vscode.postMessage({
      type: 'task:requestHistory',
      limit: 100,
      status: statusFilter !== 'all' ? [statusFilter] : undefined,
      search: search || undefined,
    });

    return () => window.removeEventListener('message', handler);
  }, [isOpen, statusFilter, search]);

  if (!isOpen) return null;

  // Group by date (apply dept filter)
  const grouped = new Map<string, TaskLogEntry[]>();
  for (const entry of entries) {
    const dept = entry.department ?? deptFromMemberId(entry.assignedTo);
    if (!deptFilter.includes(dept)) continue;
    const dateKey = formatDate(entry.completedAt);
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(entry);
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 320,
        height: '100%',
        background: 'rgba(8, 10, 25, 0.95)',
        borderRight: '2px solid rgba(90, 140, 255, 0.3)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '2px solid rgba(90, 140, 255, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '18px', color: 'var(--pixel-accent)', fontWeight: 'bold' }}>
          TASK HISTORY
        </span>
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

      {/* Search */}
      <div style={{ padding: '6px 10px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--pixel-border)',
            borderRadius: 0,
            color: 'var(--pixel-text)',
            fontSize: '13px',
            padding: '4px 8px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', padding: '0 10px 6px', gap: 4 }}>
        {['all', 'done', 'failed', 'cancelled'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '2px 8px',
              fontSize: '12px',
              background: statusFilter === s ? 'rgba(90, 140, 255, 0.2)' : 'transparent',
              color: statusFilter === s ? 'var(--pixel-accent)' : 'var(--pixel-text-dim)',
              border:
                statusFilter === s ? '1px solid var(--pixel-accent)' : '1px solid transparent',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Dept filter chips */}
      <DeptFilterChips onChange={handleDeptChange} />

      {/* Entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div
            style={{
              padding: 16,
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
              textAlign: 'center',
            }}
          >
            No completed tasks
          </div>
        ) : (
          [...grouped.entries()].map(([date, items]) => (
            <div key={date}>
              <div
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  color: 'var(--pixel-accent)',
                  fontWeight: 'bold',
                  background: 'rgba(90, 140, 255, 0.05)',
                }}
              >
                {date}
              </div>
              {items.map((entry) => (
                <HistoryEntry key={entry.taskId} entry={entry} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
