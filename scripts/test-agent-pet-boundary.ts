import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readAgentPet } from '../src/jc/agent-pet.js';

function fixture(t: { after(fn: () => void): void }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-boundary-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, '.agent-pet');
  const pet = path.join(root, 'fixture');
  fs.mkdirSync(pet, { recursive: true });
  const growth = path.join(pet, 'growth.json');
  fs.writeFileSync(growth, JSON.stringify({ stage: 2 }));
  return { home, root, pet, growth };
}

test('a symlinked or oversized growth record is skipped for the next real pet', (t) => {
  const f = fixture(t);
  const target = path.join(f.home, 'external.json');
  fs.writeFileSync(target, JSON.stringify({ stage: 5, schema: 'outside' }));
  fs.unlinkSync(f.growth);
  fs.symlinkSync(target, f.growth);
  assert.equal(readAgentPet(f.home), null);
  const next = path.join(f.root, 'next');
  fs.mkdirSync(next);
  fs.writeFileSync(path.join(next, 'growth.json'), '{"stage":1}');
  assert.equal(readAgentPet(f.home)?.name, 'next');
  fs.unlinkSync(f.growth);
  fs.writeFileSync(f.growth, JSON.stringify({ stage: 5, padding: 'x'.repeat(65536) }));
  assert.equal(readAgentPet(f.home)?.name, 'next');
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).schema, 'outside');
});

test('symlinked companion root, companion directory and ancillary directories are ignored', (t) => {
  const f = fixture(t);
  const outside = path.join(f.home, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, '2026-09-09.md'), '- 12:00 [code] outside note');
  fs.writeFileSync(path.join(outside, 'private-title.md'), 'outside');
  for (const dir of ['memory', 'learned']) fs.symlinkSync(outside, path.join(f.pet, dir), 'dir');
  const pet = readAgentPet(f.home)!;
  assert.equal(pet.lastNote, null);
  assert.equal(pet.memoryDays, 0);
  assert.equal(pet.learnedCount, 0);
  fs.renameSync(f.pet, path.join(f.home, 'moved-pet'));
  fs.symlinkSync(path.join(f.home, 'moved-pet'), f.pet, 'dir');
  assert.equal(readAgentPet(f.home), null);
  fs.renameSync(f.root, path.join(f.home, 'moved-root'));
  fs.symlinkSync(path.join(f.home, 'moved-root'), f.root, 'dir');
  assert.equal(readAgentPet(f.home), null);
});

test('legacy birthday and notes reject symlinks and oversized files without changing growth', (t) => {
  const f = fixture(t);
  const timeline = path.join(f.pet, 'timeline.jsonl');
  const memory = path.join(f.pet, 'memory');
  fs.mkdirSync(memory);
  const note = path.join(memory, '2026-09-09.md');
  const external = path.join(f.home, 'external.txt');
  fs.writeFileSync(external, '{"event":"hatch","date":"2020-01-01"}\n- 12:00 [code] outside');
  fs.symlinkSync(external, timeline);
  fs.symlinkSync(external, note);
  assert.equal(readAgentPet(f.home)?.bornAt, null);
  assert.equal(readAgentPet(f.home)?.lastNote, null);
  fs.unlinkSync(timeline);
  fs.unlinkSync(note);
  fs.writeFileSync(timeline, '{"event":"hatch","date":"2020-01-01"}\n' + ' '.repeat(512 * 1024));
  fs.writeFileSync(note, '- 12:00 [code] ' + 'x'.repeat(64 * 1024));
  assert.equal(readAgentPet(f.home)?.bornAt, null);
  assert.equal(readAgentPet(f.home)?.lastNote, null);
  fs.writeFileSync(timeline, '{"event":"hatch","date":"2020-01-01"}\n');
  fs.writeFileSync(note, '- 12:00 [code] valid note');
  assert.equal(readAgentPet(f.home)?.bornAt, '2020-01-01');
  assert.equal(readAgentPet(f.home)?.lastNote?.text, 'valid note');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.growth, 'utf8')), { stage: 2 });
});
