// ── Just Curious Virtual Office — Absent Status Popup ────────────
// Shows absence info when clicking on an absent member's desk.
// Pixel-art styled popup with member details and launch button.

import { useEffect, useState } from 'react';

import type { AbsenceInfo } from './jc-types.js';

const DEPT_COLORS: Record<string, string> = {
  engineering: '#5a8cff',
  marketing: '#ff6b8a',
  research: '#8cdd6a',
  exec: '#f0ad4e',
};

const DEPT_LABELS: Record<string, string> = {
  engineering: 'ENG',
  marketing: 'MKT',
  research: 'RES',
  exec: 'EXEC',
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  return '...' + p.slice(p.length - maxLen + 3);
}

interface AbsentStatusPopupProps {
  info: AbsenceInfo;
  position: { x: number; y: number };
  onClose: () => void;
  onLaunch: (memberId: string) => void;
}

export function AbsentStatusPopup({ info, position, onClose, onLaunch }: AbsentStatusPopupProps) {
  // Use state for current time to avoid impure Date.now() in render
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const absentDuration = info.absentSince ? formatDuration(now - info.absentSince) : '—';
  const lastActiveTime =
    info.lastActivity > 0
      ? new Date(info.lastActivity).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  const deptColor = DEPT_COLORS[info.department] ?? '#8b949e';
  const deptLabel = DEPT_LABELS[info.department] ?? info.department;
  const statusLabel = info.status === 'absent' ? '不在' : 'アイドル';
  const dotColor = info.status === 'absent' ? '#ff4444' : '#f0ad4e';

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)',
        zIndex: 100,
        minWidth: 200,
        maxWidth: 260,
        background: 'var(--pixel-bg, #0d1117)',
        border: '2px solid var(--pixel-border, #30363d)',
        borderRadius: 0,
        boxShadow: '4px 4px 0 rgba(0, 0, 0, 0.5), inset 1px 1px 0 rgba(255, 255, 255, 0.05)',
        fontSize: '18px',
        color: 'var(--pixel-text, #c9d1d9)',
        animation: 'absent-popup-appear 150ms ease-out',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes absent-popup-appear {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes absent-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--pixel-border, #30363d)',
          background: `${deptColor}15`,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            background: dotColor,
            boxShadow: `0 0 4px ${dotColor}80`,
            animation: info.status === 'absent' ? 'absent-dot-blink 2s infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontWeight: 'bold',
            fontSize: '20px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {info.memberName}
        </span>
        <span
          style={{
            fontSize: '16px',
            color: deptColor,
            background: `${deptColor}22`,
            border: `1px solid ${deptColor}55`,
            padding: '0 4px',
          }}
        >
          {deptLabel}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--pixel-text-dim, #8b949e)',
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: '16px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '6px 8px' }}>
        {/* Role */}
        <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim, #8b949e)', marginBottom: 4 }}>
          {info.role}
        </div>

        <Row label="状態" value={statusLabel} valueColor={dotColor} />
        <Row label="不在時間" value={absentDuration} />
        <Row label="最終アクティビティ" value={lastActiveTime} />
        {info.lastTool && <Row label="最後のツール" value={info.lastTool} mono />}
        {info.lastFile && (
          <Row label="最後のファイル" value={truncatePath(info.lastFile, 25)} mono />
        )}
        {info.sessionDuration != null && info.sessionDuration > 0 && (
          <Row label="本日の稼働" value={formatDuration(info.sessionDuration * 1000)} />
        )}
      </div>

      {/* Action button */}
      <div
        style={{
          padding: '6px 8px',
          borderTop: '1px solid var(--pixel-border, #30363d)',
        }}
      >
        <button
          onClick={() => onLaunch(info.memberId)}
          style={{
            width: '100%',
            padding: '5px 0',
            border: '2px solid var(--pixel-accent, #3fb950)',
            background: 'rgba(63, 185, 80, 0.1)',
            color: 'var(--pixel-accent, #3fb950)',
            fontSize: '18px',
            cursor: 'pointer',
            borderRadius: 0,
            textAlign: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--pixel-accent, #3fb950)';
            e.currentTarget.style.color = 'var(--pixel-bg, #0d1117)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(63, 185, 80, 0.1)';
            e.currentTarget.style.color = 'var(--pixel-accent, #3fb950)';
          }}
        >
          ▶ 起動する
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'var(--pixel-text-dim, #8b949e)', fontSize: '16px' }}>{label}</span>
      <span
        style={{
          color: valueColor ?? (mono ? '#58a6ff' : 'var(--pixel-text, #c9d1d9)'),
          textAlign: 'right',
          fontSize: mono ? '15px' : '16px',
        }}
      >
        {value}
      </span>
    </div>
  );
}
