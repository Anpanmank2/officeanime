import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// Read first so the red baseline identifies the missing component explicitly.
const source = readFileSync(new URL('../webview-ui/src/jc/DeskDocsTray.tsx', import.meta.url), 'utf8');
const { parseApprovalEvent } = await import('../src/jc/approval-state.ts');
const state = await import('../webview-ui/src/jc/jc-state.ts');
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS: ${name}`); }
const request = {
  event: 'approval_request' as const, timestamp: new Date().toISOString(),
  id: 'desk-test', company_id: 'acme', from: 'eng-01', title: 'Ship?', body_md: 'Review',
  options: [{key: 'yes', label: 'Yes', recommended: true}, {key: 'no', label: 'No', recommended: false}],
  irreversible: false, expires: new Date(Date.now() + 3600000).toISOString(),
};
check('request adds one document', () => {state.jcApplyApprovalEvent(request); assert.equal(state.jcGetApprovalRequests().length, 1);});
check('duplicate ID does not duplicate', () => {state.jcApplyApprovalEvent(request); assert.equal(state.jcGetApprovalRequests().length, 1);});
for (const event of ['approval_resolved', 'approval_cancel', 'approval_expired'] as const) {
  check(`${event} removes document`, () => {
    state.jcApplyApprovalEvent(request);
    state.jcApplyApprovalEvent({event, request_id: request.id, answer: 'yes', at: request.timestamp, via: 'chat'});
    assert.equal(state.jcGetApprovalRequests().length, 0);
  });
}
check('expiry removes document', () => {state.jcApplyApprovalEvent(request); assert.equal(state.jcGetApprovalRequests(Date.now() + 7200000).length, 0);});
check('project is optional in parser', () => {assert.ok(parseApprovalEvent(request)); assert.ok(parseApprovalEvent({...request, project: 'pixel-office'}));});
check('required DOM and protocol attributes', () => {
  for (const word of ['data-desk-docs', 'data-desk-docs-count', 'data-approval-confirmation', 'jcApprovalAnswer']) assert.ok(source.includes(word), word);
});
// Execute the component's actual resolve body with only its I/O dependencies replaced.
check('resolve posts the complete answer payload and waits for host acknowledgement', () => {
  const body = source.match(/const resolve = \(request: ApprovalRequest, answer: string\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(body, 'resolve implementation found');
  const sent: unknown[] = [];
  request.id = 'desk-host-ack';
  state.jcApplyApprovalEvent(request);
  vm.runInNewContext('(() => {' + body! + '})()', {request, answer: 'yes', Date, connected: true, sending: null, setSending: () => {}, setError: () => {}, vscode: {postMessage: (msg: unknown) => sent.push(msg)}, jcApplyApprovalEvent: state.jcApplyApprovalEvent, setSelected: () => {}});
  assert.equal(sent.length, 1);
  const payload = sent[0] as Record<string, unknown>;
  assert.deepEqual({...payload, at: 'time'}, {type: 'jcApprovalAnswer', request_id: request.id, answer: 'yes', at: 'time', via: 'office', company_id: request.company_id});
  assert.ok(Number.isFinite(Date.parse(payload.at as string)));
  assert.equal(state.jcGetApprovalRequests().length, 1, 'request remains until persisted resolution');
  state.jcApplyApprovalEvent({event:'approval_resolved',request_id:request.id,answer:'yes',at:request.timestamp,via:'office'});
  assert.equal(state.jcGetApprovalRequests().length, 0);
  assert.equal(state.jcGetApprovalDetails(request.id)?.title, request.title);
});
const hookSource = readFileSync(new URL('../webview-ui/src/hooks/useExtensionMessages.ts', import.meta.url), 'utf8');
const handlerSource = hookSource.slice(hookSource.indexOf('    const handler ='), hookSource.indexOf("    window.addEventListener('message', handler)"));
const logSource = hookSource.slice(hookSource.indexOf('const loggedApprovalEvents'), hookSource.indexOf('export interface SubagentCharacter'));
const logs: Array<{type: string; summary: string}> = [];
const warnings: unknown[] = [];
const context = vm.createContext({
  getOfficeState: () => ({}),
  jcGetApprovalDetails: state.jcGetApprovalDetails,
  jcGetMemberRuntime: () => ({config: {name: 'Engineer', department: 'engineering'}}),
  addLogEntry: (entry: {type: string; summary: string}) => logs.push(entry),
  bulkSetKarteEvents: () => {}, appendKarteEvent: () => {}, reconcileWorkloadPresence: () => {},
  console: {warn: (...args: unknown[]) => warnings.push(args), error: (...args: unknown[]) => warnings.push(args)},
});
vm.runInContext(stripTypeScriptTypes(logSource + handlerSource), context);
check('orphan messages do not warn or error in the actual message handler', () => {
  for (const type of ['jcPlanReady', 'jcRequestQuestions', 'jcRequestResult', 'jcResearchResult', 'jcAbsenceUpdate', 'jcAbsenceBulkSync']) {
    context.input = {type}; vm.runInContext('handler({data: input})', context);
  }
  assert.equal(warnings.length, 0);
});
check('approval logs retain title/label after host resolution and dedupe all replay paths', () => {
  const resolved = {event: 'approval_resolved' as const, request_id: request.id, answer: 'yes', at: request.timestamp, via: 'office' as const};
  state.jcApplyApprovalEvent(request);
  state.jcApplyApprovalEvent(resolved);
  for (const type of ['jcOfficeEvent', 'jcHistoryEvent', 'jcEventHistory']) {
    for (const event of [request, resolved]) {
      context.input = {type, event, events: [request, resolved]};
      vm.runInContext('handler({data: input})', context);
    }
  }
  assert.equal(logs.length, 2);
  assert.equal(logs[0].summary, 'Engineer から決裁の依頼: Ship?');
  assert.equal(logs[1].summary, '決裁: Ship? → Yes');
  assert.ok(logs.every(entry => entry.type === 'approval'));
});
check('only error/handoff transitions produce state warnings; speech stays out of the log', () => {
  logs.length = 0;
  let jcState = 'idle';
  context.getOfficeState = () => ({characters: new Map()});
  context.jcGetMemberRuntime = () => ({jcState, config: {name: 'Engineer', department: 'engineering'}});
  context.jcMemberStateChange = (_id: string, next: string) => { jcState = next; };
  context.jcRecordActivity = () => {};
  context.findMemberCharacter = () => undefined;
  context.jcAddSpeechBubble = () => {};
  context.jcActivitySummaryUpdate = () => {};
  for (const next of ['coding', 'error', 'error', 'handoff', 'idle']) {
    context.input = {type: 'jcMemberStateChange', memberId: 'eng-01', agentId: 1, jcState: next};
    vm.runInContext('handler({data: input})', context);
  }
  for (const type of ['jcSpeechBubble', 'jcActivitySummary']) {
    context.input = {type, memberId: 'eng-01', summary: 'Working', bubble: {memberId: 'eng-01', text: 'Working'}};
    vm.runInContext('handler({data: input})', context);
  }
  assert.equal(logs.length, 2);
  assert.ok(logs.every(entry => entry.type === 'warning'));
  assert.ok(logs[0].summary.endsWith('error'));
  assert.ok(logs[1].summary.endsWith('handoff'));
});
check('done maps to result and failed/cancelled tasks map to warning', () => {
  logs.length = 0;
  context.jcTaskUpdate = () => {};
  for (const status of ['pending', 'running', 'done', 'error', 'cancelled']) {
    context.input = {type: 'jcTaskUpdate', task: {status, assignee: 'eng-01', prompt: 'Draft'}};
    vm.runInContext('handler({data: input})', context);
  }
  assert.deepEqual(logs.map(entry => entry.type), ['result', 'warning', 'warning']);
});
check('resolved detail cache is bounded at fifty', () => {
  for (let i = 0; i < 51; i++) {
    const id = `cache-${i}`;
    state.jcApplyApprovalEvent({...request, id});
    state.jcApplyApprovalEvent({event: 'approval_resolved', request_id: id, answer: 'yes', at: request.timestamp, via: 'chat'});
  }
  assert.equal(state.jcGetApprovalDetails('cache-0'), undefined);
  assert.equal(state.jcGetApprovalDetails('cache-1')?.title, request.title);
  assert.equal(state.jcGetApprovalDetails('cache-50')?.title, request.title);
});
console.log(`Results: ${checks} passed, 0 failed`);
