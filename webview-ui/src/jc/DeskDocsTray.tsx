import { useEffect, useState } from 'react';

import { vscode } from '../vscodeApi.js';
import {
  type ApprovalRequest,
  jcApplyApprovalEvent,
  jcGetApprovalRequests,
  jcGetMemberRuntime,
  subscribeApprovals,
} from './jc-state.js';

function remaining(expires: string): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 60000));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function DeskDocsTray() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<ApprovalRequest[]>(jcGetApprovalRequests);
  const [selected, setSelected] = useState<{ request: ApprovalRequest; answer: string } | null>(
    null,
  );

  useEffect(() => {
    const update = () => setRequests(jcGetApprovalRequests());
    update();
    const unsubscribe = subscribeApprovals(update);
    const timer = setInterval(update, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
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

  return (
    <div
      data-desk-docs
      style={{
        position: 'absolute',
        top: 200, // 会社ボード（top 45〜185）と重ならない位置（QA側修正 2026-09-07 実機で重なりを確認）
        left: 16,
        zIndex: 60,
        width: open ? 'min(560px, 78%)' : 'auto',
        maxHeight: '72%',
        overflowY: 'auto',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        border: '2px solid #E4C36E',
        boxShadow: '2px 2px 0 #0a0a14',
        padding: 12,
      }}
    >
      <button
        data-desk-docs-label
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          color: requests.length ? '#E4C36E' : '#b8b8c8',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
        }}
      >
        UNO の机 ─ 未決裁 <span data-desk-docs-count>{requests.length}</span> 枚
      </button>
      {requests.length === 0 && <div style={{ color: '#b8b8c8', fontSize: 12 }}>未決裁なし</div>}
      {open && (
        <div data-approval-list>
          {requests.map((request) => {
            const confirmation = selected?.request.id === request.id;
            return (
              <div
                key={request.id}
                data-approval-request={request.id}
                style={{ borderTop: '1px solid var(--pixel-border)', padding: '10px 0' }}
              >
                <div style={{ color: '#fff', fontWeight: 'bold' }}>
                  {request.title}
                  {request.project && (
                    <span
                      data-desk-doc-project
                      style={{ marginLeft: 8, fontSize: 12, color: '#E4C36E' }}
                    >
                      {request.project}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {jcGetMemberRuntime(request.from)?.config.name ?? request.from} · 残り{' '}
                  {remaining(request.expires)}
                </div>
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
                      「{request.title}」— この操作は取り消せません。確定しますか？
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
                        data-approval-recommended={option.recommended ? true : undefined}
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
                        {option.recommended ? '（推奨）' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
