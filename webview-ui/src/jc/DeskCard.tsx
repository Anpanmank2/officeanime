import { useEffect, useMemo, useState } from 'react';

import { DEPT_COLORS, DEPT_LABELS, STATE_COLORS, STATE_LABELS } from './jc-constants.js';
import { jcGetActivityMetrics, jcGetActivitySummary, jcGetMemberRuntime } from './jc-state.js';
import type { JCState } from './jc-types.js';
import { addPin, isPinned, removePin, subscribe as subscribePins } from './pin-store.js';

// ── Expandable prompt (same pattern as JCMemberInfoPanel) ──────────
const PROMPT_PREVIEW_LEN = 200;

function ExpandablePrompt({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = useState(false);
  if (prompt.length <= PROMPT_PREVIEW_LEN) {
    return <div style={{ color: '#c0c0e0' }}>{prompt}</div>;
  }
  if (expanded) {
    return (
      <div>
        <textarea
          readOnly
          value={prompt}
          style={{
            width: '100%',
            minHeight: 80,
            background: 'rgba(0,0,0,0.3)',
            color: '#c0c0e0',
            border: '1px solid var(--pixel-border)',
            borderRadius: 0,
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            padding: '3px',
          }}
        />
        <button
          onClick={() => setExpanded(false)}
          style={{
            fontSize: '12px',
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
    <div style={{ color: '#c0c0e0' }}>
      {prompt.slice(0, PROMPT_PREVIEW_LEN)}...{' '}
      <button
        onClick={() => setExpanded(true)}
        style={{
          fontSize: '12px',
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

// ── State breakdown formatter ────────────────────────────────────────
const STATE_ABBREV: Partial<Record<JCState, string>> = {
  coding: 'coding',
  reading: 'reading',
  thinking: 'thinking',
  reviewing: 'reviewing',
  meeting: 'meeting',
  break: 'break',
  idle: 'idle',
};

function formatStateBreakdown(breakdown: Record<JCState, number>): string {
  const parts: string[] = [];
  for (const [state, ms] of Object.entries(breakdown) as [JCState, number][]) {
    if (ms <= 0) continue;
    const label = STATE_ABBREV[state] ?? state;
    const mins = Math.round(ms / 60000);
    if (mins > 0) parts.push(`${label} ${mins}min`);
  }
  return parts.slice(0, 3).join(' / ');
}

// ── DeskCard component ───────────────────────────────────────────────

export interface DeskCardProps {
  memberId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function DeskCard({ memberId, position, onClose }: DeskCardProps) {
  const [tick, setTick] = useState(0);
  const [pinned, setPinned] = useState(() => isPinned(memberId));

  // Refresh every second for live metrics
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // React to pin store changes
  useEffect(() => {
    return subscribePins(() => {
      setPinned(isPinned(memberId));
    });
  }, [memberId]);

  // Click-outside to close (unless pinned)
  useEffect(() => {
    if (pinned) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target && !target.closest('[data-deskcard]')) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pinned, onClose]);

  const runtime = jcGetMemberRuntime(memberId);

  const metrics = jcGetActivityMetrics(memberId);

  // Working total: include in-progress session if currently working.
  // useMemo with tick dependency ensures Date.now() is called in a stable context,
  // not as a direct impure call during render.
  // Must be before any early return to satisfy rules-of-hooks.
  const workingTotalMs = useMemo(() => {
    if (!metrics) return 0;
    return metrics.workingTotal + (metrics.workingSince ? Date.now() - metrics.workingSince : 0);
    // tick is intentional: forces recalculation each second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, tick]);

  if (!runtime) return null;

  const activitySummary = jcGetActivitySummary(memberId);

  const { config, jcState } = runtime;
  const dotColor = STATE_COLORS[jcState] ?? '#9e9e9e';
  const stateLabel = STATE_LABELS[jcState] ?? jcState;
  const deptColor = DEPT_COLORS[config.department] ?? 'var(--pixel-text-dim)';
  const deptLabel = DEPT_LABELS[config.department] ?? config.department;
  const accentColor = config.accentColor ?? deptColor;
  const workingMins = Math.round(workingTotalMs / 60000);

  const breakdownStr = metrics ? formatStateBreakdown(metrics.stateBreakdown) : '';

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinned) {
      removePin(memberId);
    } else {
      addPin(memberId);
    }
  };

  // Prompt to show: activitySummary is the most recent task prompt
  const promptText = activitySummary ?? '';

  return (
    <div
      data-deskcard
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)',
        zIndex: 65,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(8, 10, 25, 0.96)',
          color: '#fff',
          border: `2px solid ${accentColor}88`,
          borderTop: `1px solid ${accentColor}aa`,
          borderRadius: 0,
          boxShadow: `0 0 10px ${accentColor}22, 2px 2px 0px #0a0a14`,
          minWidth: 180,
          maxWidth: 260,
          whiteSpace: 'nowrap',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: `${accentColor}18`,
            borderBottom: `1px solid ${accentColor}33`,
            padding: '3px 6px',
          }}
        >
          <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{config.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontSize: '14px',
                color: deptColor,
                background: `${deptColor}22`,
                border: `1px solid ${deptColor}55`,
                padding: '0px 4px',
                borderRadius: 0,
                letterSpacing: '1px',
              }}
            >
              {deptLabel}
            </span>
            {/* Pin button */}
            <button
              onClick={handlePinToggle}
              title={pinned ? 'ピン留め解除' : 'ピン留め'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 2px',
                color: pinned ? '#f59e0b' : 'var(--pixel-text-dim)',
                lineHeight: 1,
              }}
            >
              {pinned ? '📌' : '📍'}
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              title="閉じる"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 2px',
                color: 'var(--pixel-text-dim)',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '4px 6px 6px', whiteSpace: 'normal' }}>
          {/* Role */}
          <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', marginBottom: 3 }}>
            {config.role}
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '16px', color: dotColor }}>{stateLabel}</span>
          </div>

          {/* Latest task prompt */}
          {promptText && (
            <div
              style={{
                marginBottom: 6,
                padding: '3px 5px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '14px',
              }}
            >
              <ExpandablePrompt prompt={promptText} />
            </div>
          )}

          {/* Working time counter */}
          <div
            style={{
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              paddingTop: 4,
            }}
          >
            <span style={{ color: '#a0e0a0' }}>{workingMins}min worked today</span>
            {breakdownStr && (
              <div style={{ fontSize: '12px', color: '#888899', marginTop: 2 }}>{breakdownStr}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
