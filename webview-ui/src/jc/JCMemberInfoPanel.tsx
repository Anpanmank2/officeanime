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
          fontFamily: 'monospace',
          background: '#1a1a2e',
          color: '#fff',
          border: '1px solid #333',
          borderRadius: 2,
          padding: '4px 8px',
          fontSize: '11px',
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{memberInfo.config.name}</div>
        <div style={{ color: '#aaa' }}>{memberInfo.config.role}</div>
        <div style={{ color: '#888' }}>{memberInfo.config.department}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
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
          <span>{memberInfo.jcState}</span>
        </div>
      </div>
    </div>
  );
}
