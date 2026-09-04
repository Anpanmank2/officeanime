// vacant members must never be selected for automatic office activity.
// Run: npx tsx scripts/test-vacant-exclusion.mts

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'jc-config.json'), 'utf8')) as {
  members: Array<{ id: string; vacant?: boolean }>;
};
const source = fs.readFileSync(path.join(root, 'src/jc/standalone-launcher.ts'), 'utf8');
const watcherSource = fs.readFileSync(path.join(root, 'src/jc/event-watcher.ts'), 'utf8');
const vacantIds = config.members.filter((member) => member.vacant).map((member) => member.id);

assert.ok(vacantIds.length > 0, 'fixture must include vacant member IDs');
assert.match(
  source,
  /permanentRoles\.includes\(m\.role\)\s*&&\s*!m\.vacant/,
  'permanent residents must exclude vacant members',
);
assert.match(
  source,
  /cfg\.members\.filter\(\(m\)\s*=>\s*!m\.vacant\)\.map/,
  'jcMembers initialization must exclude vacant members',
);
assert.match(
  source,
  /jcMembers\.find\(\(m\)\s*=>\s*!assignedMembers\.has\(m\.id\)\)/,
  'JSONL automatic assignment must consume the already vacancy-filtered jcMembers list',
);
assert.match(
  watcherSource,
  /console\.warn\(`\[JC-Events\] Ignoring \$\{event\.event\} for vacant member:/,
  'stale vacant-member events must warn instead of throwing',
);

console.log(`PASS: ${vacantIds.length} vacant IDs are excluded from auto-arrival and assignment`);
