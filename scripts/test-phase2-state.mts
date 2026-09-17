import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import workflowModule from '../src/jc/request-workflow.js';
import approvalModule from '../src/jc/approval-answer-validation.js';
import approvalStateModule from '../src/jc/approval-state.js';
import { applyWork, workSnapshot, workToast } from '../webview-ui/src/jc/workflow-state.js';
import type { WorkRequest } from '../shared/workflow/types.js';
const { RequestWorkflow } = workflowModule;
const { validateApprovalAnswer } = approvalModule;
const { ApprovalState } = approvalStateModule;
const question = {
  question: '確認',
  understanding: '保存した計画',
  options: ['はい'],
  field_ref: 'plan',
};
const tick = () => new Promise((r) => setImmediate(r));

test('request confirmation validates stored questions; replay never executes twice; cancel wins late callback', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-state-'));
  let executions = 0;
  let done: (r: any) => void = () => {};
  const recorded: any[] = [];
  try {
    const flow = new RequestWorkflow({
      file: path.join(tmp, 'requests.json'),
      members: [{ id: 'a', department: 'test' }],
      broadcast: () => {},
      staging: (id) => path.join(tmp, id),
      questions: async () => [question],
      execute: async (req, answers, signal, started) => {
        executions++;
        assert.equal(answers[0].understanding, '保存した計画');
        started();
        return new Promise((resolve) => {
          done = resolve;
        });
      },
      record: (row) => recorded.push({ ...row }),
    });
    const send = (m: any) => flow.handle(m, () => {});
    send({
      type: 'jcRequestSubmit',
      requestId: 'one',
      memberId: 'a',
      kind: 'doc',
      purpose: 'test',
      wants: 'test',
      overview: 'test',
    });
    await tick();
    send({ type: 'jcRequestConfirmed', requestId: 'one', answers: [] });
    assert.equal(executions, 0);
    send({
      type: 'jcRequestConfirmed',
      requestId: 'one',
      answers: [{ fieldRef: 'plan', answer: 'いいえ', isOther: true }],
    });
    assert.equal(executions, 0, 'free text cannot bypass write plan approval');
    send({
      type: 'jcRequestConfirmed',
      requestId: 'one',
      answers: [{ fieldRef: 'plan', answer: 'はい', understanding: 'forged' }],
    });
    send({
      type: 'jcRequestConfirmed',
      requestId: 'one',
      answers: [{ fieldRef: 'plan', answer: 'はい' }],
    });
    assert.equal(executions, 1);
    send({ type: 'jcRequestCancel', requestId: 'one' });
    done({ code: 0, output: 'late success' });
    await tick();
    assert.equal(flow.snapshot()[0].status, 'cancelled');
    assert.equal(recorded.length, 1);
    send({
      type: 'jcRequestSubmit',
      requestId: 'one',
      memberId: 'a',
      kind: 'doc',
      purpose: 'again',
      wants: 'test',
      overview: 'test',
    });
    assert.equal(executions, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('expired approvals and terminal-before-request replay cannot reopen; identical answer retry is acknowledged', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-approval-'));
  const file = path.join(tmp, 'events.json');
  const request = {
    event: 'approval_request' as const,
    timestamp: new Date().toISOString(),
    id: 'a',
    company_id: 'test',
    from: 'worker',
    title: 'test',
    body_md: 'test',
    irreversible: false,
    expires: new Date(Date.now() + 60000).toISOString(),
    options: [{ key: 'ok', label: 'approve', recommended: true }],
  };
  const resolved = {
    event: 'approval_resolved' as const,
    timestamp: new Date().toISOString(),
    at: new Date().toISOString(),
    request_id: 'a',
    answer: 'ok',
    via: 'office' as const,
  };
  try {
    fs.writeFileSync(file, JSON.stringify({ events: [request] }));
    validateApprovalAnswer(file, 'a', 'ok', 'test');
    assert.throws(() => validateApprovalAnswer(file, 'a', 'fake', 'test'));
    fs.writeFileSync(file, JSON.stringify({ events: [request, resolved, request] }));
    assert.equal(validateApprovalAnswer(file, 'a', 'ok', 'test')?.answer, 'ok');
    assert.throws(() => validateApprovalAnswer(file, 'a', 'ok', 'other-company'));
    const state = new ApprovalState();
    state.apply(resolved);
    state.apply(request);
    assert.equal(state.getPending().length, 0);
    fs.writeFileSync(
      file,
      JSON.stringify({ events: [{ ...request, expires: new Date(0).toISOString() }] }),
    );
    assert.throws(() => validateApprovalAnswer(file, 'a', 'ok', 'test'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('browser snapshot restores without celebration; old revisions and repeated completion cannot roll back or retrigger', () => {
  const row = {
    id: 'state-one',
    memberId: 'a',
    department: 'test',
    kind: 'research',
    purpose: 'test',
    wants: 'test',
    overview: 'test',
    priority: 3,
    status: 'running',
    revision: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expires: new Date().toISOString(),
  } as WorkRequest;
  applyWork(row, true);
  assert.equal(workToast(), null);
  applyWork({ ...row, status: 'done', revision: 3 });
  assert.equal(workToast()?.id, row.id);
  applyWork({ ...row, status: 'preparing', revision: 1 });
  assert.equal(workSnapshot().find((r) => r.id === row.id)?.status, 'done');
  applyWork({ ...row, id: 'historical', status: 'done', revision: 8 }, true);
  assert.equal(workToast()?.id, row.id);
});
