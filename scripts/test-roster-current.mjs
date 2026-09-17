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
  'mkt-12',
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
  'current roster is 13 AI plus Codex, without invented/vacant members',
);
assert.equal(new Set(ids).size, ids.length);
assert.equal(config.members.filter((m) => m.vacant).length, 0);
assert.deepEqual(Object.keys(avatars.avatars).sort(), [...expectedIds].sort());
for (const id of ids) {
  const avatar = avatars.avatars[id];
  assert.ok(avatar.base.part && avatar.layers.length, `${id} retains a real persona avatar`);
}
assert.equal(
  config.members.find((m) => m.id === 'res-02').role,
  'SNS Specialist (X/IG/TikTok/YouTube)',
);
console.log('PASS: 13 AI members + Codex, matching avatars and the consolidated SNS role');
