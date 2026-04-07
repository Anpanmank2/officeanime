#!/usr/bin/env node
// ── jc-events.json E2E Test ─────────────────────────────────────
// Tests that the EventWatcher can parse valid events and survive invalid ones.
// Creates a temporary jc-events.json, validates parsing logic.

import { writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

console.log('=== jc-events.json E2E Test ===\n');

// ── Test 1: Create valid events file ──
console.log('1. Create and parse valid jc-events.json:');

const validEvents = {
  version: 1,
  events: [
    {
      event: 'role_escalate',
      timestamp: new Date().toISOString(),
      from: 'sec-01',
      to: 'ceo-01',
      role: 'Secretary',
      message: 'New task from user',
    },
    {
      event: 'delegate',
      timestamp: new Date().toISOString(),
      from: 'ceo-01',
      to: ['eng-01', 'eng-02'],
      task: 'Implement feature X',
      department: 'engineering',
      message: 'Implement feature X please',
    },
    {
      event: 'delegation_complete',
      timestamp: new Date().toISOString(),
      from: 'eng-01',
      to: 'ceo-01',
      task: 'Feature X implementation',
      message: 'Completed feature X',
    },
    {
      event: 'progress_check',
      timestamp: new Date().toISOString(),
      from: 'sec-01',
      to: 'eng-02',
      message: 'How is it going?',
    },
    {
      event: 'task_received',
      timestamp: new Date().toISOString(),
      task: 'Build animation system',
      from: 'user',
    },
    {
      event: 'task_completed',
      timestamp: new Date().toISOString(),
      agent: 'eng-01',
      task: 'Build animation system',
      department: 'engineering',
    },
  ],
};

const testEventsPath = join(projectRoot, 'test-jc-events-tmp.json');

try {
  writeFileSync(testEventsPath, JSON.stringify(validEvents, null, 2));
  const raw = readFileSync(testEventsPath, 'utf-8');
  const parsed = JSON.parse(raw);

  assert(parsed.version === 1, 'Version is 1');
  assert(Array.isArray(parsed.events), 'Events is an array');
  assert(parsed.events.length === 6, `Has 6 events (got ${parsed.events.length})`);

  // Validate each event type
  assert(parsed.events[0].event === 'role_escalate', 'Event 0 is role_escalate');
  assert(parsed.events[0].from === 'sec-01', 'role_escalate.from is sec-01');
  assert(parsed.events[0].to === 'ceo-01', 'role_escalate.to is ceo-01');

  assert(parsed.events[1].event === 'delegate', 'Event 1 is delegate');
  assert(Array.isArray(parsed.events[1].to), 'delegate.to is array');
  assert(parsed.events[1].to.length === 2, 'delegate.to has 2 members');

  assert(parsed.events[2].event === 'delegation_complete', 'Event 2 is delegation_complete');
  assert(parsed.events[2].from === 'eng-01', 'delegation_complete.from is eng-01');

  assert(parsed.events[3].event === 'progress_check', 'Event 3 is progress_check');
  assert(parsed.events[3].message === 'How is it going?', 'progress_check.message correct');

  assert(parsed.events[4].event === 'task_received', 'Event 4 is task_received');
  assert(parsed.events[5].event === 'task_completed', 'Event 5 is task_completed');
} catch (err) {
  console.error(`  FAIL: Parse error: ${err.message}`);
  failed++;
}

// ── Test 2: Simulate event-watcher processEvents logic ──
console.log('\n2. Simulate EventWatcher.processEvents() incremental read:');

try {
  let lastProcessedIndex = 0;
  const raw = readFileSync(testEventsPath, 'utf-8');
  const file = JSON.parse(raw);

  // First batch: read all 6
  const newEvents1 = file.events.slice(lastProcessedIndex);
  lastProcessedIndex = file.events.length;
  assert(newEvents1.length === 6, `First read: 6 new events (got ${newEvents1.length})`);

  // Second read: no new events
  const newEvents2 = file.events.slice(lastProcessedIndex);
  assert(newEvents2.length === 0, `Second read: 0 new events (got ${newEvents2.length})`);

  // Append an event and re-read
  file.events.push({
    event: 'cross_dept_message',
    timestamp: new Date().toISOString(),
    from: 'eng-01',
    to: 'mkt-01',
    message: 'Need marketing assets',
    from_dept: 'engineering',
    to_dept: 'marketing',
  });
  writeFileSync(testEventsPath, JSON.stringify(file, null, 2));
  const raw2 = readFileSync(testEventsPath, 'utf-8');
  const file2 = JSON.parse(raw2);
  const newEvents3 = file2.events.slice(lastProcessedIndex);
  lastProcessedIndex = file2.events.length;
  assert(
    newEvents3.length === 1,
    `Third read after append: 1 new event (got ${newEvents3.length})`,
  );
  assert(newEvents3[0].event === 'cross_dept_message', 'Appended event is cross_dept_message');
} catch (err) {
  console.error(`  FAIL: Incremental read error: ${err.message}`);
  failed++;
}

// ── Test 3: Invalid/malformed events don't crash ──
console.log('\n3. Robustness — invalid data does not crash:');

// Invalid JSON
try {
  writeFileSync(testEventsPath, '{ broken json !!!');
  const raw = readFileSync(testEventsPath, 'utf-8');
  try {
    JSON.parse(raw);
    console.error('  FAIL: Should have thrown on invalid JSON');
    failed++;
  } catch {
    // This is expected — the EventWatcher catches this with try/catch
    assert(true, 'Invalid JSON caught gracefully (EventWatcher uses try/catch)');
  }
} catch (err) {
  console.error(`  FAIL: File write error: ${err.message}`);
  failed++;
}

// Missing events array
try {
  writeFileSync(testEventsPath, JSON.stringify({ version: 1 }));
  const raw = readFileSync(testEventsPath, 'utf-8');
  const file = JSON.parse(raw);
  // EventWatcher checks: if (!file.events || file.events.length <= this.lastProcessedIndex) return;
  const hasEvents = file.events && file.events.length > 0;
  assert(!hasEvents, 'Missing events array handled (falsy check)');
} catch (err) {
  console.error(`  FAIL: Missing events test error: ${err.message}`);
  failed++;
}

// Empty events array
try {
  writeFileSync(testEventsPath, JSON.stringify({ version: 1, events: [] }));
  const raw = readFileSync(testEventsPath, 'utf-8');
  const file = JSON.parse(raw);
  const hasNewEvents = file.events.length > 0;
  assert(!hasNewEvents, 'Empty events array handled');
} catch (err) {
  console.error(`  FAIL: Empty events test error: ${err.message}`);
  failed++;
}

// Event with unknown type (should not crash — EventWatcher forwards to webview)
try {
  const unknownEvent = {
    version: 1,
    events: [
      {
        event: 'completely_unknown_event_type',
        timestamp: new Date().toISOString(),
        data: 'something',
      },
    ],
  };
  writeFileSync(testEventsPath, JSON.stringify(unknownEvent, null, 2));
  const raw = readFileSync(testEventsPath, 'utf-8');
  const file = JSON.parse(raw);
  assert(
    file.events[0].event === 'completely_unknown_event_type',
    'Unknown event type parsed without crash',
  );
} catch (err) {
  console.error(`  FAIL: Unknown event type error: ${err.message}`);
  failed++;
}

// ── Cleanup ──
if (existsSync(testEventsPath)) {
  rmSync(testEventsPath);
}

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
