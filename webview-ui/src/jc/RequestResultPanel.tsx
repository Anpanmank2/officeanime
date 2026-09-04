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

import { vscode } from '../vscodeApi.js';
import { DEPT_COLORS, DEPT_LABELS } from './jc-constants.js';
import {
  type ApprovalRequest,
  jcApplyApprovalEvent,
  jcGetApprovalRequests,
  subscribeApprovals,
} from './jc-state.js';
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

function ApprovalList() {
  const [requests, setRequests] = useState<ApprovalRequest[]>(jcGetApprovalRequests);
  const [selected, setSelected] = useState<{ request: ApprovalRequest; answer: string } | null>(
    null,
  );

  useEffect(() => {
    const update = () => setRequests(jcGetApprovalRequests());
    update();
    return subscribeApprovals(update);
  }, []);

  const resolve = (request: ApprovalRequest, answer: string) => {
    const at = new Date().toISOString();
    // The extension owns filesystem access. It appends the answer and emits this
    // normalized event back through jc-events; apply locally for responsive UI.
    vscode.postMessage({
      type: 'jcApprovalAnswer',
      request_id: request.id,
      answer,
      at,
      via: 'office',
      company_id: request.company_id,
    });
    jcApplyApprovalEvent({
      event: 'approval_resolved',
      request_id: request.id,
      answer,
      at,
      via: 'office',
    });
    setSelected(null);
  };

  if (requests.length === 0) return null;

  return (
    <div
      data-approval-list
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 60,
        width: 'min(560px, 78%)',
        maxHeight: '72%',
        overflowY: 'auto',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        border: '2px solid #E4C36E',
        boxShadow: '2px 2px 0 #0a0a14',
        padding: 12,
      }}
    >
      <div style={{ color: '#E4C36E', fontWeight: 'bold', marginBottom: 10 }}>
        承認まち {requests.length}件
      </div>
      {requests.map((request) => {
        const confirmation = selected?.request.id === request.id;
        return (
          <div
            key={request.id}
            data-approval-request={request.id}
            style={{ borderTop: '1px solid var(--pixel-border)', padding: '10px 0' }}
          >
            <div style={{ color: '#fff', fontWeight: 'bold' }}>{request.title}</div>
            <div
              style={{
                color: 'var(--pixel-text-dim)',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                margin: '5px 0 8px',
              }}
            >
              {request.body_md}
            </div>
            {confirmation ? (
              <div
                data-approval-confirmation
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ color: '#ffcf5c', fontSize: 12 }}>
                  この操作は取り消せません。確定しますか？
                </span>
                <button onClick={() => resolve(request, selected?.answer ?? '')}>確定</button>
                <button onClick={() => setSelected(null)}>戻る</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {request.options.map((option) => (
                  <button
                    key={option.key}
                    data-approval-option={option.key}
                    onClick={() =>
                      request.irreversible
                        ? setSelected({ request, answer: option.key })
                        : resolve(request, option.key)
                    }
                    style={{
                      border: `1px solid ${option.recommended ? '#39ff14' : 'var(--pixel-border)'}`,
                      background: '#111',
                      color: '#fff',
                      padding: '4px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RequestResultPanel() {
  const [result, setResult] = useState<RequestResult | null>(getRequestResult);

  useEffect(() => {
    const update = () => setResult(getRequestResult());
    update();
    return subscribeRequestResult(update);
  }, []);

  // This existing panel is reused for approval requests when the queue is non-empty.
  // Keeping the former result panel intact preserves its existing behavior otherwise.
  if (!result) return <ApprovalList />;

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
        zIndex: 60, // same layer as ResearchResultPanel
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
          color: isGateNotice ? '#E4C36E' : '#e8e8f4',
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
