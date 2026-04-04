import { useEffect, useRef, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { isSittingState, TILE_SIZE } from '../office/types.js';
import { vscode } from '../vscodeApi.js';
import { DEPT_COLORS, DEPT_LABELS, STATE_COLORS, STATE_LABELS } from './jc-constants.js';
import { jcGetActivitySummary, jcGetMemberInfo, jcGetMemberTaskStatus } from './jc-state.js';
import type { InstructionMode } from './jc-types.js';

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
  const [instructionText, setInstructionText] = useState('');
  const [instructionMode, setInstructionMode] = useState<InstructionMode>('instant');
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

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

  const handleSendInstruction = () => {
    if (!instructionText.trim()) return;
    if (instructionMode === 'directive') {
      vscode.postMessage({
        type: 'agent:directive',
        text: instructionText.trim(),
      });
    } else {
      vscode.postMessage({
        type: 'agent:instruct',
        agentId: selectedId,
        text: instructionText.trim(),
      });
    }
    setInstructionText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
  };

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
              <div style={{ color: 'var(--pixel-text-dim)', marginBottom: 1 }}>
                Task: {currentTask.status}
              </div>
              <div style={{ color: '#c0c0e0' }}>
                {currentTask.prompt.length > 60
                  ? currentTask.prompt.slice(0, 60) + '...'
                  : currentTask.prompt}
              </div>
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

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <button
                onClick={() => setInstructionMode('instant')}
                style={{
                  flex: 1,
                  padding: '2px 4px',
                  fontSize: '14px',
                  color: instructionMode === 'instant' ? '#fff' : 'var(--pixel-text-dim)',
                  background: instructionMode === 'instant' ? `${accentColor}44` : 'transparent',
                  border: `1px solid ${instructionMode === 'instant' ? accentColor : 'var(--pixel-border)'}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                Instant
              </button>
              <button
                onClick={() => setInstructionMode('directive')}
                style={{
                  flex: 1,
                  padding: '2px 4px',
                  fontSize: '14px',
                  color: instructionMode === 'directive' ? '#fff' : 'var(--pixel-text-dim)',
                  background: instructionMode === 'directive' ? `${accentColor}44` : 'transparent',
                  border: `1px solid ${instructionMode === 'directive' ? accentColor : 'var(--pixel-border)'}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                Directive
              </button>
            </div>

            {/* Instruction textarea */}
            <textarea
              ref={textareaRef}
              value={instructionText}
              onChange={(e) => setInstructionText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                instructionMode === 'instant' ? 'Send instruction...' : 'Set directive...'
              }
              style={{
                width: '100%',
                height: 48,
                padding: '4px',
                fontSize: '16px',
                color: 'var(--pixel-text)',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--pixel-border)',
                borderRadius: 0,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />

            {/* Send button */}
            <button
              onClick={handleSendInstruction}
              disabled={!instructionText.trim()}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '4px 8px',
                fontSize: '16px',
                color: instructionText.trim() ? '#fff' : 'var(--pixel-text-dim)',
                background: instructionText.trim() ? `${accentColor}66` : 'var(--pixel-btn-bg)',
                border: `2px solid ${instructionText.trim() ? accentColor : 'var(--pixel-border)'}`,
                borderRadius: 0,
                cursor: instructionText.trim() ? 'pointer' : 'default',
              }}
            >
              {instructionMode === 'instant' ? 'Send' : 'Set Directive'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
