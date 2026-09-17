#!/usr/bin/env node
import type { ApprovalEvent } from '../src/jc/approval-state.js';

const { ApprovalState, isApprovalEvent, parseApprovalEvent } =
  await import('../src/jc/approval-state.js');

let passed = 0;
let failed = 0;
function assert(condition: unknown, message: string): void {
  if (condition) {
    console.log(`PASS: ${message}`);
    passed += 1;
  } else {
    console.error(`FAIL: ${message}`);
    failed += 1;
  }
}

const request = {
  event: 'approval_request',
  timestamp: '2026-09-04T00:00:00.000Z',
  id: 'request-1',
  company_id: 'acme',
  from: 'exec-sec',
  title: 'Deploy production',
  body_md: 'Ready to deploy.',
  options: [{ key: 'approve', label: 'Approve', recommended: true }],
  irreversible: false,
  expires: '2026-09-04T01:00:00.000Z',
};

const eventTypes = ['approval_request', 'approval_cancel', 'approval_expired', 'approval_resolved'];
for (const event of eventTypes) {
  const candidate =
    event === 'approval_request'
      ? request
      : event === 'approval_cancel'
        ? { event, timestamp: request.timestamp, request_id: request.id }
        : event === 'approval_expired'
          ? { event, timestamp: request.timestamp, request_id: request.id, at: request.timestamp }
          : {
              event,
              timestamp: request.timestamp,
              request_id: request.id,
              answer: 'approve',
              at: request.timestamp,
              via: 'office',
            };
  assert(isApprovalEvent(candidate), `${event} validates`);
  assert(parseApprovalEvent(candidate)?.event === event, `${event} parses`);
}

assert(parseApprovalEvent({ ...request, options: [] }) === null, 'empty options are rejected');
assert(parseApprovalEvent({ ...request, expires: 'not-a-date' }) === null, 'invalid expires is rejected');

const state = new ApprovalState();
state.apply(request as ApprovalEvent);
state.apply({ ...request, title: 'Deploy production safely' } as ApprovalEvent);
assert(state.getPending().length === 1, 'same request id is idempotently overwritten');
assert(state.getPending()[0]?.title === 'Deploy production safely', 'latest request payload wins');

const expired = state.expireDue('2026-09-04T02:00:00.000Z');
assert(expired.length === 1, 'expired request emits one approval_expired event');
assert(expired[0]?.event === 'approval_expired', 'expiration event is normalized');
assert(state.getPending().length === 0, 'expired request is removed from the list');

console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
