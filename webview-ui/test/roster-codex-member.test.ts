import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(path.join(repoRoot, 'jc-config.json'), 'utf8')) as {
  members: Array<Record<string, unknown>>;
};
const deskRegistry = readFileSync(path.join(repoRoot, 'src/jc/desk-registry.ts'), 'utf8');
const jcState = readFileSync(path.join(repoRoot, 'webview-ui/src/jc/jc-state.ts'), 'utf8');
const constants = readFileSync(path.join(repoRoot, 'webview-ui/src/jc/jc-constants.ts'), 'utf8');

test('Codex bot roster entry has a matching desk and idle emoji', () => {
  const codexMembers = config.members.filter((member) => member.id === 'codex-01');

  assert.equal(codexMembers.length, 1, 'codex-01 should be present exactly once');
  const codex = codexMembers[0];
  assert.equal(codex.department, 'engineering');
  assert.equal(codex.vacant, undefined);

  const deskId = String(codex.deskId);
  const deskPattern = new RegExp(`deskId: '${deskId}',[\\s\\S]*?memberId: 'codex-01'`);
  assert.match(deskRegistry, deskPattern);
  assert.match(constants, /'codex-01':\s*'🤖'/u);
  // webview 側の机座標表（DESK_POSITIONS）にも同じ deskId が必要。無いと出社時に座席へ行けず別ゾーンに置かれる（2026-09-07 実機で確認）
  assert.match(jcState, new RegExp(`'${deskId}':\\s*\\{\\s*col:`));
});

test('roster member IDs are unique', () => {
  const ids = config.members.map((member) => String(member.id));
  assert.equal(new Set(ids).size, ids.length);
});
