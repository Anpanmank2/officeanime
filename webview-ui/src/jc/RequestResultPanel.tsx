// ── Request(write型) Result panel (screen-space DOM) ────────────────────
// Surfaces a finished WRITE-kind (資料 doc / 実装 impl) 依頼 prominently:
//   下書きのパス (書き先) + 作成ファイル一覧 + 要約  (2026-07-02 横展開 AC-E)
// Also renders the explicit gate notices:
//   - status 'disabled': --jc-live-spawn OFF → 実行していない旨を明示
//   - status 'blocked' : plan確認なし → execute 不発火の明示
//
// Data source: backend broadcast `jcRequestResult`, mirrored into
// request-result-state.ts by useExtensionMessages. Display-layer only — this
// component never touches spawn/permission/backend logic.
// (ResearchResultPanel / research-result-state are 触るな — this is a separate
// parallel panel that mirrors their pixel-art style.)

import { useEffect, useState } from 'react';

import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import {
  clearRequestResult,
  getRequestResult,
  type RequestResult,
  subscribeRequestResult,
} from './request-result-state.js';

const STATUS_TITLE: Record<string, string> = {
  done: '下書きができました',
  error: '実行エラー',
  disabled: '実行していません',
  blocked: '実行していません',
};

export function RequestResultPanel() {
  const [result, setResult] = useState<RequestResult | null>(getRequestResult);

  useEffect(() => {
    const update = () => setResult(getRequestResult());
    update();
    return subscribeRequestResult(update);
  }, []);

  if (!result) return null;

  const accent = DEPT_COLORS[result.department] ?? '#00e676';
  const deptLabel = DEPT_LABELS[result.department] ?? result.department.toUpperCase();
  const title = STATUS_TITLE[result.status] ?? '結果';
  const isGateNotice = result.status === 'disabled' || result.status === 'blocked';

  return (
    <div
      data-request-result
      data-request-result-status={result.status}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60, // same layer as ResearchResultPanel (below DialogBox 65+)
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
      {/* ── Header: dept tag + title + member name + close ✕ ── */}
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
            {title}
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
          onClick={clearRequestResult}
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

      {/* ── 書き先: the staging dir (下書き置き場) — gate notices show it too ── */}
      <div
        style={{
          padding: '8px 12px 6px',
          fontSize: 13,
          color: 'var(--pixel-text-dim)',
          borderBottom: '1px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: accent, marginRight: 6 }}>書き先:</span>
        <span data-request-result-path style={{ color: '#fff', wordBreak: 'break-all' }}>
          {result.stagingDir}
        </span>
        {!isGateNotice && result.files.length > 0 && (
          <div style={{ marginTop: 6, color: '#e8e8f4' }}>
            {result.files.map((f) => (
              <div key={f} style={{ fontSize: 12, lineHeight: 1.6, wordBreak: 'break-all' }}>
                ・{f}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 要約 body (or the explicit gate notice), scrolls when long ── */}
      <div
        style={{
          padding: '10px 12px 12px',
          fontSize: 14,
          lineHeight: 1.7,
          color: isGateNotice ? '#f0d840' : '#e8e8f4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        {result.summary}
      </div>
    </div>
  );
}
