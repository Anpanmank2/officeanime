import { useEffect, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { isSittingState, TILE_SIZE } from '../office/types.js';
import { vscode } from '../vscodeApi.js';
import { ConfidenceBadge } from './ConfidenceBadge.js';
import { formatFreshness } from './freshness.js';
import { DEPT_COLORS, DEPT_LABELS, STATE_COLORS, STATE_LABELS } from './jc-constants.js';
import { jcGetActivitySummary, jcGetMemberInfo, jcGetMemberTaskStatus } from './jc-state.js';
import { addPin, isPinned, removePin, subscribe as subscribePins } from './pin-store.js';

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

interface JCMemberInfoPanelProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

export function JCMemberInfoPanel({
  officeState,
  containerRef,
  zoom,
  panRef,
}: JCMemberInfoPanelProps) {
  const [, setTick] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pinned, setPinned] = useState(() => {
    const id = officeState.selectedAgentId;
    return id !== null ? isPinned(String(id)) : false;
  });

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    return subscribePins(() => {
      const id = officeState.selectedAgentId;
      if (id !== null) setPinned(isPinned(String(id)));
    });
  }, [officeState]);

  const selectedId = officeState.selectedAgentId;
  if (selectedId === null) return null;

  const memberInfo = jcGetMemberInfo(selectedId);
  if (!memberInfo) return null;

  const ch = officeState.characters.get(selectedId);
  if (!ch) return null;

  const el = containerRef.current;
  if (!el) return null;

  // Position calculation (same as before)
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
  const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
  const screenY = (deviceOffsetY + (ch.y + sittingOffset + 16) * zoom) / dpr;

  const dotColor = STATE_COLORS[memberInfo.jcState] ?? '#9e9e9e';
  const stateLabel = STATE_LABELS[memberInfo.jcState] ?? memberInfo.jcState;
  const deptColor = DEPT_COLORS[memberInfo.config.department] ?? 'var(--pixel-text-dim)';
  const deptLabel = DEPT_LABELS[memberInfo.config.department] ?? memberInfo.config.department;
  const accentColor = memberInfo.config.accentColor ?? deptColor;

  // Get activity summary and task info
  const activitySummary = jcGetActivitySummary(memberInfo.memberId);
  const currentTask = jcGetMemberTaskStatus(memberInfo.memberId);

  const handleFocus = () => {
    vscode.postMessage({ type: 'focusAgent', id: selectedId });
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translateX(-50%)',
        zIndex: 60,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(8, 10, 25, 0.94)',
          color: '#fff',
          border: `2px solid ${accentColor}88`,
          borderRadius: 0,
          padding: 0,
          whiteSpace: 'nowrap',
          boxShadow: `0 0 10px ${accentColor}22, 2px 2px 0px #0a0a14`,
          minWidth: 160,
          maxWidth: 280,
          borderTop: `1px solid ${accentColor}aa`,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: `${accentColor}18`,
            borderBottom: `1px solid ${accentColor}33`,
            padding: '3px 6px',
            cursor: 'pointer',
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff' }}>
            {memberInfo.config.name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontSize: '16px',
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                const id = String(selectedId);
                if (pinned) {
                  removePin(id);
                } else {
                  addPin(id);
                }
              }}
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
            <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)' }}>
              {isExpanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '4px 6px 5px' }}>
          {/* Role */}
          <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', marginBottom: 3 }}>
            {memberInfo.config.role}
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
            <span style={{ fontSize: '18px', color: dotColor }}>{stateLabel}</span>
          </div>

          {/* Activity summary */}
          {activitySummary && (
            <div style={{ fontSize: '16px', color: '#a0a0c0', marginTop: 2, whiteSpace: 'normal' }}>
              {activitySummary}
            </div>
          )}

          {/* Current task */}
          {currentTask && (
            <div
              style={{
                marginTop: 4,
                padding: '3px 5px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '16px',
                whiteSpace: 'normal',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 1,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: 'var(--pixel-text-dim)' }}>Task: {currentTask.status}</span>
                {currentTask.confidence && <ConfidenceBadge level={currentTask.confidence} />}
                {currentTask.extractedAt &&
                  (() => {
                    const { label, warn } = formatFreshness(currentTask.extractedAt);
                    return (
                      <span style={{ fontSize: '9px', color: warn ? '#f59e0b' : '#888899' }}>
                        {label}
                      </span>
                    );
                  })()}
              </div>
              <ExpandablePrompt prompt={currentTask.prompt} />
            </div>
          )}
        </div>

        {/* Expanded section: Instruction input + actions */}
        {isExpanded && (
          <div
            style={{
              borderTop: `1px solid ${accentColor}55`,
              padding: '6px',
            }}
          >
            {/* Focus button */}
            <button
              onClick={handleFocus}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '16px',
                color: 'var(--pixel-text)',
                background: 'var(--pixel-btn-bg)',
                border: '2px solid var(--pixel-border)',
                borderRadius: 0,
                cursor: 'pointer',
                marginBottom: 6,
              }}
            >
              Focus Terminal
            </button>
            {/* DEFER: Instant/Directive instruction send removed — delegation is dock-only.
                Viewing (Focus Terminal + member info) is kept. */}
          </div>
        )}
      </div>
    </div>
  );
}
