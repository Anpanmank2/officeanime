#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { appendAnswer } = await import('../src/jc/answers-writer.js');

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

const dir = mkdtempSync(join(tmpdir(), 'jc-answers-'));
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
  assert(answers.length === 2, 'appends without destroying existing contents');
  assert(answers[0]?.request_id === 'existing', 'existing row is preserved');
  assert(
    JSON.stringify(answers[1]) ===
      JSON.stringify({
        request_id: 'request-1',
        answer: 'approve',
        at: '2026-09-04T00:00:00.000Z',
        via: 'office',
        company_id: 'acme',
      }),
    'writes the required answer record shape',
  );
  assert(!existsSync(`${answersPath}.tmp`), 'atomic temporary file is renamed away');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
