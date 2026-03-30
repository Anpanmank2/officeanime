import { useEffect, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { TokenUsage } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';

/** Default max tokens per session (can be overridden via settings) */
const DEFAULT_MAX_TOKENS = 100_000;

interface TokenHPBarProps {
  officeState: OfficeState;
  agents: number[];
  agentTokenUsage: Record<number, TokenUsage>;
  maxTokens?: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return `${tokens}`;
}

function getBarColor(ratio: number): string {
  if (ratio >= 0.8) return '#e53935'; // red
  if (ratio >= 0.5) return '#fdd835'; // yellow
  return '#43a047'; // green
}

function getBarBgColor(ratio: number): string {
  if (ratio >= 0.8) return 'rgba(229, 57, 53, 0.2)';
  if (ratio >= 0.5) return 'rgba(253, 216, 53, 0.2)';
  return 'rgba(67, 160, 71, 0.2)';
}

export function TokenHPBar({
  officeState,
  agents,
  agentTokenUsage,
  maxTokens = DEFAULT_MAX_TOKENS,
  containerRef,
  zoom,
  panRef,
}: TokenHPBarProps) {
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

  return (
    <>
      {agents.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const usage = agentTokenUsage[id];
        if (!usage) return null;

        const totalTokens = usage.inputTokens + usage.outputTokens;
        if (totalTokens === 0) return null;

        const ratio = Math.min(totalTokens / maxTokens, 1);
        const barColor = getBarColor(ratio);
        const barBgColor = getBarBgColor(ratio);

        // Position above character (higher than ToolOverlay)
        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - 40) * zoom) / dpr;

        const barWidth = 48;
        const barHeight = 6;

        return (
          <div
            key={`hp-${id}`}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 39,
            }}
          >
            {/* HP bar container */}
            <div
              style={{
                width: barWidth,
                height: barHeight,
                background: barBgColor,
                border: `1px solid ${barColor}`,
                borderRadius: 1,
                overflow: 'hidden',
                imageRendering: 'pixelated',
              }}
            >
              {/* Filled portion (right to left: full = healthy, empty = depleted) */}
              <div
                style={{
                  width: `${(1 - ratio) * 100}%`,
                  height: '100%',
                  background: barColor,
                  transition: 'width 0.3s ease-out, background-color 0.3s ease-out',
                }}
              />
            </div>
            {/* Token count label */}
            <span
              style={{
                fontSize: '14px',
                color: barColor,
                marginTop: 1,
                whiteSpace: 'nowrap',
                textShadow: '0 0 2px rgba(0,0,0,0.8)',
                fontFamily: 'monospace',
                letterSpacing: '-0.5px',
              }}
            >
              {formatTokenCount(totalTokens)}
            </span>
          </div>
        );
      })}
    </>
  );
}
