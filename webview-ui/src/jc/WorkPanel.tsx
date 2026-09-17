import { useEffect, useState, useSyncExternalStore } from 'react';

import type { RequestKind, WorkRequest } from '../../../shared/workflow/types.js';
import { WORK_TOAST_MS } from '../constants.js';
import { getConnectionStatus, onConnectionStatusChange, vscode } from '../vscodeApi.js';
import { jcGetAllMembers, jcGetMemberNames } from './jc-state.js';
import { WORK_STATUS_LABEL, WORK_TERMINAL } from './workflow-state.js';
import {
  clearWorkToast,
  workSnapshot,
  workSubscribe,
  workSupported,
  workToast,
  workUnavailable,
} from './workflow-state.js';

const kindNames: Record<RequestKind, string> = {
  research: '調査',
  market: '市場調査',
  doc: '資料の下書き',
  impl: '実装の下書き',
};
function WorkDecision({ row, connected }: { row: WorkRequest; connected: boolean }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  return (
    <div data-work-decision>
      <p>Ownerの判断を待っています。回答すると、この内容で担当者が作業を始めます。</p>
      {row.questions?.map((q, i) => (
        <label key={i} className="work-question">
          <span>{q.understanding}</span>
          <strong>{q.question}</strong>
          <select
            aria-label={q.question}
            value={answers[i] ?? ''}
            onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
          >
            <option value="">回答を選ぶ</option>
            {q.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
            {q.field_ref !== 'plan' && <option value="__other">その他（内容を補正）</option>}
          </select>
          {answers[i] === '__other' && (
            <textarea
              aria-label={`${q.question}への補正`}
              value={corrections[i] ?? ''}
              onChange={(e) => setCorrections({ ...corrections, [i]: e.target.value })}
            />
          )}
        </label>
      ))}
      <button
        disabled={
          !connected ||
          !row.questions?.every(
            (_, i) => answers[i] && (answers[i] !== '__other' || corrections[i]?.trim()),
          )
        }
        onClick={() =>
          vscode.postMessage({
            type: 'jcRequestConfirmed',
            requestId: row.id,
            answers: row.questions!.map((q, i) => ({
              fieldRef: q.field_ref,
              answer: answers[i] === '__other' ? corrections[i] : answers[i],
              isOther: answers[i] === '__other',
            })),
          })
        }
      >
        回答して作業を始める
      </button>
    </div>
  );
}

export function WorkPanel({
  open,
  onOpen,
  onClose,
  onResult,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onResult: (id: string) => void;
}) {
  const rows = useSyncExternalStore(workSubscribe, workSnapshot);
  const supported = useSyncExternalStore(workSubscribe, workSupported);
  const unavailable = useSyncExternalStore(workSubscribe, workUnavailable);
  const [connection, setConnection] = useState(getConnectionStatus);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState<RequestKind>('research');
  const [memberId, setMemberId] = useState('res-01');
  const [fields, setFields] = useState({ purpose: '', wants: '', overview: '' });
  const [selected, setSelected] = useState<string | null>(null);
  const toast = useSyncExternalStore(workSubscribe, workToast);
  const names = jcGetMemberNames();
  const active = rows.filter((row) => !WORK_TERMINAL.has(row.status));
  const waiting = active.filter((row) => row.status === 'waiting').length;
  const connected = connection === 'connected';
  useEffect(() => onConnectionStatusChange(setConnection), []);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'jcWorkError') {
        setError(e.data.error);
        setSending(false);
      }
      if (e.data?.type === 'jcWorkUpdate' || e.data?.type === 'jcWorkSnapshot') setSending(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearWorkToast(toast.id), WORK_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <>
      <button className="work-entry" data-work-entry onClick={onOpen}>
        秘書に依頼 · 進行中 {active.length}件{waiting > 0 ? ` · Owner判断 ${waiting}件` : ''}
        {!connected && ' · 接続待ち'}
      </button>
      {toast && (
        <div role="status" className="work-toast" data-work-toast>
          完了しました：{toast.purpose}{' '}
          <button
            onClick={() => {
              clearWorkToast(toast.id);
              onResult(toast.id);
            }}
          >
            本棚で結果を見る
          </button>
        </div>
      )}
      {open && (
        <aside className="work-panel" data-work-panel aria-label="秘書への依頼と仕事の状況">
          <header>
            <strong>秘書への依頼・会社の動き</strong>
            <button aria-label="依頼パネルを閉じる" onClick={onClose}>
              ✕
            </button>
          </header>
          {!connected && (
            <p role="status">
              接続が切れています。最後に確認した状態を表示しています。完了は未確認です。
            </p>
          )}
          {!supported && <p role="status">{unavailable ?? '依頼機能を読み込んでいます。'}</p>}
          {error && <p role="alert">{error}</p>}
          <details
            open={formOpen}
            onToggle={(e) => setFormOpen(e.currentTarget.open)}
            data-work-form
          >
            <summary>新しい仕事を秘書に依頼</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const id = crypto.randomUUID();
                setFormOpen(false);
                setSending(true);
                setError('');
                setSelected(id);
                vscode.postMessage({
                  type: 'jcRequestSubmit',
                  requestId: id,
                  memberId,
                  kind,
                  ...fields,
                  priority: 'P3',
                });
              }}
            >
              <label>
                仕事の種類
                <select
                  aria-label="仕事の種類"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as RequestKind)}
                >
                  {Object.entries(kindNames).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                担当者
                <select
                  aria-label="担当者"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                >
                  {jcGetAllMembers()
                    .filter((m) => !m.vacant && m.id !== 'exec-sec')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              {(
                [
                  ['purpose', '目的・作りたいもの'],
                  ['wants', '知りたいこと・完成条件'],
                  ['overview', '対象・概要'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    aria-label={label}
                    required
                    value={fields[key]}
                    onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                  />
                </label>
              ))}
              <button type="submit" disabled={!connected || !supported || sending}>
                {sending ? '受付を確認中…' : '秘書に送信'}
              </button>
            </form>
          </details>
          <p>
            進行中 {active.length}件 · Owner判断 {waiting}件
          </p>
          {rows.map((row) => (
            <article
              key={row.id}
              data-work-id={row.id}
              data-work-status={row.status}
              className={row.status === 'waiting' ? 'work-waiting' : ''}
            >
              <button
                className="work-row"
                onClick={() => setSelected(selected === row.id ? null : row.id)}
                aria-expanded={selected === row.id}
              >
                <strong>{WORK_STATUS_LABEL[row.status]}</strong>
                <span>{row.purpose}</span>
                <small>秘書 → {names.get(row.memberId) ?? row.memberId}</small>
              </button>
              {selected === row.id && (
                <div>
                  <p>{row.summary}</p>
                  {row.status === 'waiting' && (
                    <WorkDecision key={row.id} row={row} connected={connected} />
                  )}
                  {row.status === 'done' && (
                    <button
                      onClick={() => {
                        clearWorkToast(row.id);
                        onResult(row.id);
                      }}
                    >
                      本棚で結果を見る
                    </button>
                  )}
                  {!WORK_TERMINAL.has(row.status) && row.status !== 'cancelling' && (
                    <button
                      disabled={!connected}
                      onClick={() =>
                        vscode.postMessage({ type: 'jcRequestCancel', requestId: row.id })
                      }
                    >
                      この依頼を中止
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </aside>
      )}
    </>
  );
}

export function WorkResults({ selectedId }: { selectedId?: string | null }) {
  const rows = useSyncExternalStore(workSubscribe, workSnapshot).filter((r) =>
    WORK_TERMINAL.has(r.status),
  );
  if (!rows.length) return null;
  return (
    <section data-work-results className="work-results">
      <h3>秘書に依頼した仕事</h3>
      {rows.map((row) => (
        <details key={row.id} open={selectedId === row.id || undefined} data-work-result={row.id}>
          <summary>
            {WORK_STATUS_LABEL[row.status]} · {row.purpose}
          </summary>
          <p>
            {row.wants} / {row.overview}
          </p>
          <pre>{row.summary}</pre>
          {row.answers && (
            <details>
              <summary>Ownerの回答</summary>
              {row.answers.map((answer, i) => (
                <p key={i}>
                  {answer.question}：{answer.answer}
                </p>
              ))}
            </details>
          )}
          {row.files?.map((file) => (
            <p key={file}>{row.stagingDir ? `${row.stagingDir}/${file}` : file}</p>
          ))}
          <small>
            {new Date(row.updatedAt).toLocaleString()} ·{' '}
            {jcGetMemberNames().get(row.memberId) ?? row.memberId}
          </small>
        </details>
      ))}
    </section>
  );
}
