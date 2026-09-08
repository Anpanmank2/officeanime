import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { agentPetMessage, readAgentPet } from '../src/jc/agent-pet.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pet-reader-'));
const petDir = path.join(home, '.agent-pet', 'fixture');
const now = new Date(2026, 8, 8, 12);
const voice = {
  schema: 'first-voice/1',
  id: 'test-voice-000001',
  date: '2026-09-08',
  kind: 'normal',
  text: 'おはよう。\n—— fixture',
};
const write = (name: string, value: unknown) =>
  fs.writeFileSync(path.join(petDir, name), JSON.stringify(value));
try {
  assert.equal(readAgentPet(home, now), null);
  fs.mkdirSync(petDir, { recursive: true });
  write('growth.json', { stage: 4, born_at: '2026-09-08', bond: 99 });
  fs.writeFileSync(path.join(petDir, 'timeline.jsonl'), '{"event":"hatch","date":"2020-01-01"}\n');
  write('first-voice.json', { ...voice, additionalContext: 'SECRET', candidate_token: 'TOKEN' });
  const before = fs
    .readdirSync(petDir)
    .map((file) => [file, fs.readFileSync(path.join(petDir, file), 'utf8')]);
  const pet = readAgentPet(home, now)!;
  assert.equal(pet.bornAt, '2026-09-08');
  assert.equal(pet.stage, 4);
  assert.deepEqual(pet.firstVoice, voice);
  assert.deepEqual(agentPetMessage(home, now), { type: 'jcPetUpdated', pet });
  assert.deepEqual(
    fs.readdirSync(petDir).map((file) => [file, fs.readFileSync(path.join(petDir, file), 'utf8')]),
    before,
  );
  write('stage-days.json', { schema: 'stage-days/1', days: [0, 1, 2, 3, 4, 5] });
  assert.deepEqual(readAgentPet(home, now)!.stageDays, [0, 1, 2, 3, 4, 5]);
  write('stage-days.json', { schema: 'broken' });
  assert.deepEqual(readAgentPet(home, now)!.stageDays, [0, 3, 10, 25, 45, 70]);
  assert.equal(readAgentPet(home, new Date(2026, 8, 9, 3))!.firstVoice?.id, voice.id);
  assert.equal(readAgentPet(home, new Date(2026, 8, 9, 4))!.firstVoice, null);
  fs.writeFileSync(path.join(petDir, 'first-voice.json'), 'x'.repeat(4097));
  assert.equal(readAgentPet(home, now)!.firstVoice, null);
  fs.unlinkSync(path.join(petDir, 'first-voice.json'));
  fs.symlinkSync(path.join(petDir, 'growth.json'), path.join(petDir, 'first-voice.json'));
  assert.equal(readAgentPet(home, now)!.firstVoice, null);
  fs.writeFileSync(path.join(petDir, 'growth.json'), 'broken');
  assert.equal(readAgentPet(home, now), null);
  console.log(
    'PASS: reader/VS Code payload, birthday precedence, override/fallback, 04:00 expiry, malformed/oversized/symlink records, and no pet writes',
  );
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
