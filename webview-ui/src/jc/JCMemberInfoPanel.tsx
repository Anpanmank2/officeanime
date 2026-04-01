import { useEffect, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import { jcGetMemberInfo } from './jc-state.js';

const STATE_DOT_COLORS: Record<string, string> = {
  coding: '#4caf50',
  thinking: '#ff9800',
  reading: '#2196f3',
  reviewing: '#00bcd4',
  error: '#f44336',
  idle: '#9e9e9e',
  break: '#ff5722',
  meeting: '#9c27b0',
  arriving: '#66bb6a',
  leaving: '#bdbdbd',
  presenting: '#ab47bc',
  handoff: '#7e57c2',
  absent: '#616161',
};

const STATE_LABELS: Record<string, string> = {
  coding: 'Coding',
  thinking: 'Thinking',
  reading: 'Reading',
  reviewing: 'Reviewing',
  error: 'Error',
  idle: 'Idle',
  break: 'On Break',
  meeting: 'In Meeting',
  arriving: 'Arriving',
  leaving: 'Leaving',
  presenting: 'Presenting',
  handoff: 'Handoff',
  absent: 'Absent',
};

const DEPT_COLORS: Record<string, string> = {
  engineering: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
};

const DEPT_LABELS: Record<string, string> = {
  engineering: 'ENG',
  marketing: 'MKT',
  research: 'RES',
};

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

  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
  const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
  const screenY = (deviceOffsetY + (ch.y + sittingOffset + 16) * zoom) / dpr;

  const dotColor = STATE_DOT_COLORS[memberInfo.jcState] ?? '#9e9e9e';
  const stateLabel = STATE_LABELS[memberInfo.jcState] ?? memberInfo.jcState;
  const deptColor = DEPT_COLORS[memberInfo.config.department] ?? 'var(--pixel-text-dim)';
  const deptLabel = DEPT_LABELS[memberInfo.config.department] ?? memberInfo.config.department;
  const accentColor = memberInfo.config.accentColor ?? deptColor;

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translateX(-50%)',
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'var(--pixel-bg)',
          color: '#fff',
          border: `2px solid ${accentColor}`,
          borderRadius: 0,
          padding: 0,
          whiteSpace: 'nowrap',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 120,
        }}
      >
        {/* Header bar with department badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: `${accentColor}33`,
            borderBottom: `1px solid ${accentColor}55`,
            padding: '3px 6px',
          }}
        >
          <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff' }}>
            {memberInfo.config.name}
          </span>
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
        </div>
      </div>
    </div>
  );
}
