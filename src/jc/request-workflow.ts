import * as fs from 'fs';
import * as path from 'path';

import type { WorkAnswer, WorkQuestion, WorkRequest } from '../../shared/workflow/types.js';
import { REQUEST_EXPIRY_MS, WORK_TERMINAL } from '../constants.js';

interface WorkflowOptions {
  file: string;
  members: Array<{ id: string; department: string; vacant?: boolean }>;
  broadcast: (message: unknown) => void;
  staging: (id: string) => string;
  questions: (request: WorkRequest, signal: AbortSignal) => Promise<WorkQuestion[]>;
  execute: (
    request: WorkRequest,
    answers: WorkAnswer[],
    signal: AbortSignal,
    started: () => void,
    progress: (text: string) => void,
  ) => Promise<{ output: string; code: number | null; files?: string[] }>;
  record: (request: WorkRequest) => void;
}

/** One durable identity per request; visual effects never advance this state. */
export class RequestWorkflow {
  private rows = new Map<string, WorkRequest>();
  private controllers = new Map<string, AbortController>();
  constructor(private options: WorkflowOptions) {
    let recovered = false;
    if (fs.existsSync(options.file)) {
      const rows = JSON.parse(fs.readFileSync(options.file, 'utf8')) as WorkRequest[];
      for (const row of rows) {
        if (!WORK_TERMINAL.has(row.status) && row.status !== 'waiting') {
          row.status = 'interrupted';
          row.summary = 'ホストが再起動しました。実行結果は未確認です。自動で再実行しません。';
          row.revision++;
          row.updatedAt = new Date().toISOString();
          recovered = true;
        }
        this.rows.set(row.id, row);
      }
    }
    if (recovered) {
      fs.writeFileSync(options.file + '.tmp', JSON.stringify([...this.rows.values()]));
      fs.renameSync(options.file + '.tmp', options.file);
    }
  }
  dispose() {
    for (const controller of this.controllers.values()) controller.abort();
  }
  snapshot() {
    this.expire();
    return [...this.rows.values()];
  }
  private save(row: WorkRequest, patch: Partial<WorkRequest>) {
    Object.assign(row, patch, { revision: row.revision + 1, updatedAt: new Date().toISOString() });
    fs.mkdirSync(path.dirname(this.options.file), { recursive: true });
    fs.writeFileSync(this.options.file + '.tmp', JSON.stringify([...this.rows.values()]));
    fs.renameSync(this.options.file + '.tmp', this.options.file);
    if (WORK_TERMINAL.has(row.status)) this.options.record(row);
    this.options.broadcast({ type: 'jcWorkUpdate', request: row });
  }
  expire(now = Date.now()) {
    for (const row of this.rows.values())
      if (row.status === 'waiting' && Date.parse(row.expires) <= now) {
        this.save(row, { status: 'expired', summary: '回答期限を過ぎたため実行していません。' });
      }
  }
  handle(data: unknown, respond: (message: unknown) => void): boolean {
    const m = data as Record<string, unknown>;
    if (
      !['jcRequestSubmit', 'jcRequestConfirmed', 'jcRequestCancel', 'jcWorkSync'].includes(
        String(m.type),
      )
    )
      return false;
    this.expire();
    const reject = (error: string) =>
      respond({ type: 'jcWorkError', requestId: m.requestId, error });
    if (m.type === 'jcWorkSync') {
      respond({ type: 'jcWorkSnapshot', requests: this.snapshot() });
      return true;
    }
    if (typeof m.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(m.requestId)) {
      reject('依頼IDが不正です。');
      return true;
    }
    const previous = this.rows.get(m.requestId);
    if (m.type === 'jcRequestSubmit') {
      if (previous) {
        respond({ type: 'jcWorkUpdate', request: previous, replay: true });
        return true;
      }
      const member = this.options.members.find((x) => x.id === m.memberId && !x.vacant);
      if (
        !member ||
        !['research', 'market', 'doc', 'impl'].includes(String(m.kind)) ||
        !['purpose', 'wants', 'overview'].every(
          (k) => typeof m[k] === 'string' && (m[k] as string).trim().length > 0,
        )
      ) {
        reject('担当者と依頼内容を確認してください。');
        return true;
      }
      const now = new Date().toISOString();
      const row: WorkRequest = {
        id: m.requestId,
        memberId: member.id,
        department: member.department,
        kind: m.kind as WorkRequest['kind'],
        purpose: String(m.purpose),
        wants: String(m.wants),
        overview: String(m.overview),
        priority: 3,
        status: 'received',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        expires: new Date(Date.now() + REQUEST_EXPIRY_MS).toISOString(),
      };
      if (row.kind === 'doc' || row.kind === 'impl') row.stagingDir = this.options.staging(row.id);
      this.rows.set(row.id, row);
      this.save(row, {});
      const controller = new AbortController();
      this.controllers.set(row.id, controller);
      this.save(row, { status: 'preparing' });
      void this.options
        .questions(row, controller.signal)
        .then((questions) => {
          if (!WORK_TERMINAL.has(row.status)) this.save(row, { status: 'waiting', questions });
        })
        .catch((error) => {
          if (!WORK_TERMINAL.has(row.status))
            this.save(row, { status: 'error', summary: String(error) });
        })
        .finally(() => this.controllers.delete(row.id));
      return true;
    }
    if (!previous) {
      reject('依頼が見つかりません。');
      return true;
    }
    if (m.type === 'jcRequestCancel') {
      if (!WORK_TERMINAL.has(previous.status)) {
        const running = previous.status === 'running' || previous.status === 'cancelling';
        this.save(previous, {
          status: running ? 'cancelling' : 'cancelled',
          summary: 'Ownerが中止しました。',
        });
        this.controllers.get(previous.id)?.abort();
      }
      return true;
    }
    if (previous.status !== 'waiting') {
      respond({ type: 'jcWorkUpdate', request: previous, replay: true });
      return true;
    }
    const questions = previous.questions ?? [];
    const raw = m.answers;
    if (
      !Array.isArray(raw) ||
      raw.length !== questions.length ||
      questions.length === 0 ||
      !questions.every((q, i) => {
        const a = raw[i];
        return (
          a &&
          a.fieldRef === q.field_ref &&
          typeof a.answer === 'string' &&
          a.answer.trim() &&
          (q.field_ref === 'plan' && (previous.kind === 'doc' || previous.kind === 'impl')
            ? a.isOther !== true && q.options.includes(a.answer)
            : a.isOther === true || q.options.includes(a.answer))
        );
      })
    ) {
      reject('すべての確認事項に回答してください。');
      return true;
    }
    // Use the stored questions/plan, never a client-supplied understanding.
    const answers: WorkAnswer[] = questions.map((q, i) => ({
      question: q.question,
      understanding: q.understanding,
      fieldRef: q.field_ref,
      answer: raw[i].answer,
      isOther: raw[i].isOther === true,
    }));
    const controller = new AbortController();
    this.controllers.set(previous.id, controller);
    this.save(previous, {
      status: 'preparing',
      summary: '回答を受け付けました。担当者へ渡しています。',
      answers,
    });
    void this.options
      .execute(
        previous,
        answers,
        controller.signal,
        () => {
          if (previous.status === 'preparing')
            this.save(previous, { status: 'running', summary: '秘書から担当者へ受け渡しました。' });
        },
        (text) => {
          if (previous.status === 'running') this.save(previous, { summary: text });
        },
      )
      .then((result) => {
        if (WORK_TERMINAL.has(previous.status)) return;
        const cancelled = controller.signal.aborted;
        this.save(previous, {
          status: cancelled ? 'cancelled' : result.code === 0 ? 'done' : 'error',
          summary: cancelled
            ? '実行を中止しました。'
            : result.output || `実行に失敗しました (${result.code})`,
          files: result.files,
        });
      })
      .catch((error) => {
        if (!WORK_TERMINAL.has(previous.status))
          this.save(previous, {
            status: controller.signal.aborted ? 'cancelled' : 'error',
            summary: String(error),
          });
      })
      .finally(() => this.controllers.delete(previous.id));
    return true;
  }
}
