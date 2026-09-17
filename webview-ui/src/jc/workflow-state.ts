import type { WorkRequest, WorkStatus } from '../../../shared/workflow/types.js';

const rows = new Map<string, WorkRequest>();
let snapshot: WorkRequest[] = [];
const listeners = new Set<() => void>();
let toast: WorkRequest | null = null;
let supported = false;
let unavailable: string | null = null;
export const workSubscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const workSnapshot = () => snapshot;
export const workSupported = () => supported;
export const workUnavailable = () => unavailable;
export const workToast = () => toast;
function notify() {
  snapshot = [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const listener of listeners) listener();
}
export function clearWorkToast(id: string) {
  if (toast?.id === id) {
    toast = null;
    notify();
  }
}
export function applyWork(row: WorkRequest, replay = false) {
  const old = rows.get(row.id);
  if (old && old.revision >= row.revision) return;
  rows.set(row.id, row);
  if (!replay && old && old.status !== 'done' && row.status === 'done') toast = row;
  notify();
}
if (typeof window !== 'undefined')
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'jcWorkSnapshot') {
      supported = true;
      unavailable = null;
      for (const row of e.data.requests ?? []) applyWork(row, true);
      notify();
    } else if (e.data?.type === 'jcWorkUnavailable') {
      supported = false;
      unavailable = e.data.reason;
      notify();
    } else if (e.data?.type === 'jcWorkUpdate') applyWork(e.data.request, e.data.replay === true);
  });

export const WORK_TERMINAL: ReadonlySet<WorkStatus> = new Set([
  'done',
  'error',
  'cancelled',
  'expired',
  'interrupted',
]);
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  received: '受付済み',
  preparing: '依頼内容を確認中',
  waiting: 'Ownerの判断待ち',
  running: '作業中',
  cancelling: '中止処理中',
  done: '完了',
  error: '実行失敗',
  cancelled: '中止',
  expired: '判断期限切れ',
  interrupted: '実行の接続が切れました（結果未確認）',
};
