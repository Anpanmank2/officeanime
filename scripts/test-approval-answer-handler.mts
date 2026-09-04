#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendAnswer } from '../src/jc/answers-writer.ts';

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

const standaloneSource = readFileSync(join(import.meta.dirname, '../src/jc/standalone-launcher.ts'), 'utf8');
const extensionSource = readFileSync(join(import.meta.dirname, '../src/PixelAgentsViewProvider.ts'), 'utf8');
const writerSource = readFileSync(join(import.meta.dirname, '../src/jc/answers-writer.ts'), 'utf8');

assert(
  standaloneSource.includes("msg.type === 'jcApprovalAnswer'") &&
    standaloneSource.includes('appendAnswer(workspaceRoot,'),
  'standalone receives approval answers and records them through appendAnswer',
);
assert(
  extensionSource.includes("message.type === 'jcApprovalAnswer'") &&
    extensionSource.includes('appendAnswer(workspaceRoot,'),
  'extension receives approval answers and records them through appendAnswer',
);
assert(
  standaloneSource.includes("event: 'approval_resolved'") &&
    standaloneSource.includes('server.broadcast({'),
  'standalone appends and broadcasts approval_resolved',
);
assert(
  extensionSource.includes("event: 'approval_resolved'") &&
    extensionSource.includes('this.browserServer?.broadcast('),
  'extension appends and broadcasts approval_resolved',
);
assert(
  writerSource.includes('writeFileSync(tmpPath,') && writerSource.includes('renameSync(tmpPath, answersPath)'),
  'answers writer uses tmp then rename for atomic writes',
);

const dir = mkdtempSync(join(tmpdir(), 'jc-approval-answer-handler-'));
const answersPath = join(dir, 'jc-answers.json');
try {
  writeFileSync(answersPath, JSON.stringify([{ request_id: 'existing', answer: 'keep' }]), 'utf8');
  appendAnswer(dir, {
    request_id: 'request-1',
    answer: 'approve',
    at: '2026-09-04T00:00:00.000Z',
    via: 'office',
    company_id: 'acme',
  });

  const answers = JSON.parse(readFileSync(answersPath, 'utf8')) as Array<Record<string, unknown>>;
  assert(answers.length === 2 && answers[0]?.request_id === 'existing', 'preserves existing answer rows');
  assert(
    JSON.stringify(answers[1]) ===
      JSON.stringify({
        request_id: 'request-1',
        answer: 'approve',
        at: '2026-09-04T00:00:00.000Z',
        via: 'office',
        company_id: 'acme',
      }),
    'appends the required office answer record',
  );
  assert(!existsSync(`${answersPath}.tmp`), 'atomic temporary file is renamed away');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
