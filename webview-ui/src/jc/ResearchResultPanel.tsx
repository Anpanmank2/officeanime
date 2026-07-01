// ── Research Result panel (screen-space DOM) ───────────────────────────
// Surfaces a completed RESEARCH finding prominently in the office so the Owner
// can "click a 調査 card → read the answer" WITHOUT opening the Tasks panel.
//
// Data source: the EXISTING return path (jcTaskUpdate task.result), mirrored
// into research-result-state.ts by useExtensionMessages. Display-layer only —
// this component never touches spawn/permission/backend logic.
//
// Pixel-art style (mirrors CompletionToast / DeskCard): sharp corners
// (borderRadius: 0), solid dark background, 2px solid border, hard offset
// shadow (2px 2px 0px #0a0a14, no blur), FS Pixel Sans (global). Findings can
// be multi-line/bulleted → the body is readable-size and scrolls when long.
// Dismissible via ✕.

import { useEffect, useState } from 'react';

import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import {
  clearResearchResult,
  getResearchResult,
  type ResearchResult,
  subscribeResearchResult,
} from './research-result-state.js';

export function ResearchResultPanel() {
  const [result, setResult] = useState<ResearchResult | null>(getResearchResult);

  useEffect(() => {
    const update = () => setResult(getResearchResult());
    update();
    return subscribeResearchResult(update);
  }, []);

  if (!result) return null;

  const accent = DEPT_COLORS[result.department] ?? '#00e676';
  const deptLabel = DEPT_LABELS[result.department] ?? result.department.toUpperCase();

  // The stored prompt is the wrapped research prompt; extract the actual subject
  // after the "調査対象:" marker if present (pure display cleanup, up to newline).
  const marker = '調査対象:';
  const markerIdx = result.subject.indexOf(marker);
  const subjectText =
    markerIdx >= 0
      ? (result.subject
          .slice(markerIdx + marker.length)
          .split('\n')[0]
          ?.trim() ?? result.subject)
      : result.subject;

  return (
    <div
      data-research-result
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60, // above CommandBoard/OfficeLog, below DialogBox(65+)
        width: 'min(560px, 78%)',
        maxHeight: '72%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        border: `2px solid ${accent}`,
        borderRadius: 0,
        boxShadow: '2px 2px 0px #0a0a14',
        pointerEvents: 'auto',
      }}
    >
      {/* ── Header: dept tag + 調査結果 title + member name + close ✕ ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: `${accent}22`,
          borderBottom: `2px solid ${accent}`,
          padding: '8px 12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              color: accent,
              border: `1px solid ${accent}`,
              padding: '1px 6px',
              borderRadius: 0,
              letterSpacing: '1px',
              flexShrink: 0,
            }}
          >
            {deptLabel}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: accent,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            調査結果
          </span>
          <span
            style={{
              fontSize: 14,
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`${result.memberName} (${result.memberId})`}
          >
            {result.memberName}
          </span>
        </div>
        <button
          onClick={clearResearchResult}
          title="閉じる"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 2px',
            color: 'var(--pixel-close-text)',
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--pixel-close-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--pixel-close-text)')}
        >
          ✕
        </button>
      </div>

      {/* ── Subject: what was investigated ── */}
      <div
        style={{
          padding: '8px 12px 4px',
          fontSize: 13,
          color: 'var(--pixel-text-dim)',
          borderBottom: '1px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: accent, marginRight: 6 }}>調査対象:</span>
        <span style={{ color: '#fff' }}>{subjectText}</span>
      </div>

      {/* ── Findings body: readable size, scrolls when long, preserves line breaks ── */}
      <div
        style={{
          padding: '10px 12px 12px',
          fontSize: 14,
          lineHeight: 1.7,
          color: '#e8e8f4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        {result.findings}
      </div>
    </div>
  );
}
