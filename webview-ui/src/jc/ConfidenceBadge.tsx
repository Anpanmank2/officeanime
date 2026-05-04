// ── Confidence Badge — inline badge for confirmed/likely/unverified ──
// eng-05 spec: height 14px, font 9px, borderRadius 0

import { CONFIDENCE_BADGE_STYLES } from './jc-constants.js';
import type { ConfidenceLevel } from './jc-types.js';

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const style = CONFIDENCE_BADGE_STYLES[level];
  if (!style) return null;

  return (
    <span
      aria-label={`confidence: ${level}`}
      title={`確度: ${level}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '14px',
        padding: '2px 5px',
        fontSize: '9px',
        fontFamily: 'inherit',
        textTransform: 'lowercase',
        borderRadius: 0,
        boxShadow: '1px 1px 0px #0a0a14',
        letterSpacing: 0,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        background: style.background,
        color: style.color,
        border: style.border,
        flexShrink: 0,
      }}
    >
      {level}
    </span>
  );
}
