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
const expectedDisplayNames = {
  'exec-sec': 'Niyamoto',
  'eng-01': 'Mutou',
  'eng-04': 'Kaizen Akio',
  'codex-01': 'Rua (Tea Runner)',
  'mkt-01': 'Steve Job',
  'mkt-02': 'Got of turtle',
  'mkt-03': 'Nightin Gale',
  'mkt-04': 'Leo Vinci',
  'mkt-05': 'Sokura Tetsuo',
  'res-01': 'Kuramae',
  'res-02': 'Sen no Kyu',
  'res-07': 'Shibasen',
  'res-09': 'Hanya',
};
const config = JSON.parse(await readFile(new URL('../jc-config.json', import.meta.url), 'utf8'));
const deskRegistry = await readFile(new URL('../src/jc/desk-registry.ts', import.meta.url), 'utf8');
const appearanceMap = await readFile(
  new URL('../docs/character-appearance-map.md', import.meta.url),
  'utf8',
);
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
  const member = config.members.find((m) => m.id === id);
  const display = expectedDisplayNames[id];
  assert.equal(member.name, display, `${id} uses its public display name`);
  assert.equal(member.nameEn, display, `${id} uses the same display in both languages`);
  const desk = deskRegistry.match(new RegExp(`\\{[^{}]*memberId: '${id}'[^{}]*\\}`))?.[0];
  assert.ok(desk, `${id} retains its registered desk`);
  assert.ok(desk.includes(`deskId: '${member.deskId}'`), `${id} keeps its desk assignment`);
  assert.ok(desk.includes(`nameplate: '${display}'`), `${id} has a matching desk label`);
  assert.ok(desk.includes(`nameplateEn: '${display}'`), `${id} has a matching English desk label`);
  assert.ok(
    appearanceMap.includes(`| ${id} | ${display} |`),
    `${id} has a matching appearance entry`,
  );
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
assert.equal(config.exec.find((m) => m.id === 'exec-03').name, expectedDisplayNames['exec-sec']);
for (const id of ['res-03', 'res-04', 'res-05']) {
  const desk = deskRegistry.match(new RegExp(`\\{[^{}]*memberId: 'vacant:${id}'[^{}]*\\}`))?.[0];
  assert.ok(desk?.includes("nameplate: '空席'"), `${id} stays vacant`);
  assert.ok(desk?.includes("nameplateEn: 'Vacant'"), `${id} keeps its vacant English label`);
}

console.log(
  'PASS: 13 public displays, matching desks/docs/avatars, permanent IDs and vacant seats',
);
