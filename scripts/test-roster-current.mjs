import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expectedIds = [
  'exec-sec',
  'eng-01',
  'eng-04',
  'codex-01',
  'mkt-01',
  'mkt-02',
  'mkt-03',
  'mkt-04',
  'mkt-05',
  'res-01',
  'res-02',
  'res-07',
  'res-09',
];
const config = JSON.parse(await readFile(new URL('../jc-config.json', import.meta.url), 'utf8'));
const avatars = JSON.parse(
  await readFile(
    new URL('../webview-ui/public/assets/default-avatars.json', import.meta.url),
    'utf8',
  ),
);
const ids = config.members.map((member) => member.id);
assert.deepEqual(
  [...ids].sort(),
  [...expectedIds].sort(),
  'current roster is 12 AI plus Codex, without invented/vacant members',
);
assert.equal(new Set(ids).size, ids.length);
assert.equal(config.members.filter((m) => m.vacant).length, 0);
for (const id of expectedIds) {
  assert.ok(Object.hasOwn(avatars.avatars, id), `${id} has retained avatar data`);
}
for (const id of ids) {
  const avatar = avatars.avatars[id];
  assert.ok(avatar.base.part && avatar.layers.length, `${id} retains a real persona avatar`);
}
assert.equal(config.members.find((m) => m.id === 'res-02').role, 'SNS担当');
// shared/jc-roster.ts (extension host, CJS) and webview jc-constants.ts (ESM mirror) must agree.
const rosterIds = (src) => ({
  secretary: /SECRETARY_MEMBER_ID = '([^']+)'/.exec(src)?.[1],
  pm: /PM_MEMBER_ID = '([^']+)'/.exec(src)?.[1],
});
const sharedRoster = rosterIds(
  await readFile(new URL('../shared/jc-roster.ts', import.meta.url), 'utf8'),
);
const webviewRoster = rosterIds(
  await readFile(new URL('../webview-ui/src/jc/jc-constants.ts', import.meta.url), 'utf8'),
);
assert.ok(
  sharedRoster.secretary && sharedRoster.pm,
  'shared/jc-roster.ts declares secretary/PM ids',
);
assert.deepEqual(
  webviewRoster,
  sharedRoster,
  'webview jc-constants.ts mirrors shared/jc-roster.ts ids',
);
for (const id of Object.values(sharedRoster)) {
  assert.ok(ids.includes(id), `permanent member ${id} exists in jc-config.json`);
}
assert.equal(config.members.find((m) => m.id === sharedRoster.secretary).role, '副社長');

console.log('PASS: 12 AI members + Codex, matching avatars and the consolidated SNS role');
