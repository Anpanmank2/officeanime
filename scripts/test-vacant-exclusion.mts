// Retired/vacant rows retained in an older config cannot revive their characters.
// Run: node --import tsx scripts/test-vacant-exclusion.mts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { JCConfig, OfficeEvent } from '../src/jc/types.js';

const { EventWatcher } = await import('../src/jc/event-watcher.js');
const config = JSON.parse(
  fs.readFileSync(new URL('../jc-config.json', import.meta.url), 'utf8'),
) as JCConfig;
const active = config.members.find((member) => member.id === 'res-01')!;
const vacant = { ...active, id: 'legacy-vacant', vacant: true };
const watcher = new EventWatcher(
  { ...config, members: [...config.members, vacant] },
  process.cwd(),
);
const posted: unknown[] = [];
const internals = watcher as unknown as {
  webview: { postMessage(message: unknown): void };
  handleEvent(event: OfficeEvent): void;
};
internals.webview = {
  postMessage: (message) => {
    posted.push(message);
  },
};
const staleEvents = [
  { event: 'work_started', agent: vacant.id, task: 'stale task', department: 'research' },
  { event: 'delegate', from: vacant.id, to: [active.id], task: 'stale task', message: 'stale' },
  { event: 'delegate', from: 'exec-sec', to: [vacant.id], task: 'stale task', message: 'stale' },
  { event: 'cross_dept_message', from: active.id, to: vacant.id, message: 'stale' },
];
try {
  for (const event of staleEvents) {
    internals.handleEvent(event as OfficeEvent);
    assert.equal(posted.length, 0, `${event.event} must not revive a vacant seat or enter history`);
  }
  internals.handleEvent({
    event: 'work_started',
    agent: active.id,
    task: 'current task',
    department: 'research',
  } as OfficeEvent);
  assert.ok(
    posted.some((message) => (message as { type?: string }).type === 'jcHistoryEvent'),
    'current member work still reaches history',
  );
  assert.ok(
    posted.some((message) => (message as { type?: string }).type === 'jcMemberStateChange'),
    'current member work still animates',
  );
  console.log('PASS: stale vacant events are ignored while current members still work');
} finally {
  watcher.dispose();
}
