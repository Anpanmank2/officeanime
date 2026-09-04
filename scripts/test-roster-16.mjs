import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const expectedActiveIds = [
  'exec-sec',
  'eng-01',
  'eng-04',
  'mkt-01',
  'mkt-02',
  'mkt-03',
  'mkt-04',
  'mkt-05',
  'mkt-12',
  'res-01',
  'res-02',
  'res-03',
  'res-04',
  'res-05',
  'res-07',
  'res-09',
];
const vacantIds = [
  'eng-02',
  'eng-03',
  'eng-05',
  'eng-06',
  'mkt-07',
  'mkt-09',
  'mkt-10',
  'mkt-11',
  'res-06',
  'res-08',
];

const config = JSON.parse(await readFile(new URL('../jc-config.json', import.meta.url)));
const activeIds = config.members
  .filter((member) => !member.vacant)
  .map((member) => member.id)
  .sort();
assert.deepEqual(
  activeIds,
  [...expectedActiveIds].sort(),
  'active member IDs must exactly match the 16-person roster',
);
for (const id of vacantIds) {
  const member = config.members.find((candidate) => candidate.id === id);
  assert.ok(member, `vacant member ${id} must remain in jc-config.json`);
  assert.equal(member.vacant, true, `${id} must be marked vacant`);
}

const root = new URL('../', import.meta.url);
const [avatars, constants, desks, voices] = await Promise.all([
  readFile(new URL('webview-ui/public/assets/default-avatars.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('webview-ui/src/jc/jc-constants.ts', root), 'utf8'),
  readFile(new URL('src/jc/desk-registry.ts', root), 'utf8'),
  readFile(new URL('src/jc/persona-lines.ts', root), 'utf8'),
]);
for (const id of ['mkt-02', 'mkt-03', 'mkt-05']) {
  const avatar = avatars.avatars[id];
  assert.ok(
    avatar?.base?.part && Array.isArray(avatar.layers) && avatar.layers.length > 0,
    `${id} must have a valid default avatar`,
  );
}
for (const id of expectedActiveIds) {
  assert.match(constants, new RegExp(`'${id}'\\s*:`), `${id} must have an idle emoji`);
  assert.match(desks, new RegExp(`memberId: '${id}'`), `${id} must have an assigned desk`);
  assert.match(voices, new RegExp(`'${id}'\\s*:`), `${id} must have persona lines`);
}
for (const id of vacantIds) {
  assert.doesNotMatch(constants, new RegExp(`'${id}'\\s*:`), `${id} must not have an idle emoji`);
  assert.match(
    desks,
    new RegExp(`memberId: 'vacant:${id}'`),
    `${id} desk must remain visibly vacant`,
  );
}

console.log('PASS: roster, avatars, emojis, desks, and persona lines match the 16-person roster');
