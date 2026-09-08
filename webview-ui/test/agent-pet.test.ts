import assert from 'node:assert/strict';
import { test } from 'node:test';

import petContract from '../../shared/agent-pet.js';
import { jcGetPet, jcGetPetDayCount, jcGetPetNextStage, jcSetPet } from '../src/jc/pet-state.js';
import { claimPetVoice } from '../src/jc/pet-voice-state.js';

const { petAgeDays, petAppearance, petFirstVoice, petLocalDate, petStageDays } = petContract;

const now = new Date(2026, 8, 8, 12);
const voice = {
  schema: 'first-voice/1',
  id: 'test-voice-000001',
  date: '2026-09-08',
  kind: 'normal',
  text: 'おはよう。\n—— こむぎ',
} as const;

test('calendar thresholds are zero based, independent of work/bond/habits, and do not promote records', () => {
  for (const [stage, age] of [0, 3, 10, 25, 45, 70].entries()) {
    const birthday = new Date(Date.UTC(2026, 8, 8) - age * 86400000).toISOString().slice(0, 10);
    jcSetPet(
      {
        name: 'fixture',
        bornAt: birthday,
        stage,
        bond: 99999,
        traits: { code: 9999 },
        learnedCount: 9999,
      },
      now,
    );
    const pet = jcGetPet()!;
    assert.equal(jcGetPetDayCount(pet, now), age);
    assert.equal(pet.stage, stage);
    assert.deepEqual(
      jcGetPetNextStage(pet, now),
      stage === 5 ? null : { stage: stage + 1, met: false },
    );
    if (stage > 0) {
      const prior = { ...pet, stage: stage - 1 };
      assert.equal(jcGetPetNextStage(prior, now)?.met, true);
      assert.equal(jcGetPetNextStage(prior, new Date(2026, 8, 7, 12))?.met, false);
    }
  }
  jcSetPet({ name: 'ahead', bornAt: '2026-09-08', stage: 4 }, now);
  assert.equal(jcGetPet()!.stage, 4);
  assert.equal(jcGetPetNextStage(jcGetPet()!, now)?.met, false);
});

test('strict calendar validation, leap day, DST calendar math, and producer 04:00 boundary', () => {
  for (const birthday of [null, '', 'broken', '2026-02-30', '2026-13-01', '2027-01-01']) {
    assert.equal(petAgeDays(birthday, '2026-09-08'), 0);
  }
  assert.equal(petAgeDays('2024-02-29', '2024-03-03'), 3);
  assert.equal(petAgeDays('2026-03-07', '2026-03-10'), 3);
  assert.equal(petLocalDate(new Date(2026, 8, 9, 3, 59)), '2026-09-08');
  assert.equal(petLocalDate(new Date(2026, 8, 9, 4)), '2026-09-09');
  const days = [0, 1, 2, 3, 4, 5];
  assert.deepEqual(petStageDays({ schema: 'stage-days/1', days }), days);
  for (const invalid of [null, { days }, { schema: 'stage-days/1', days: [0, 3, 2, 25, 45, 70] }]) {
    assert.deepEqual(petStageDays(invalid), [0, 3, 10, 25, 45, 70]);
  }
});

test('voice is an allowlisted display record, stale/broken/oversized data disappears', () => {
  assert.deepEqual(
    petFirstVoice(
      { ...voice, additionalContext: 'PRIVATE', candidate_token: 'SECRET' },
      voice.date,
    ),
    voice,
  );
  for (const invalid of [
    null,
    { ...voice, date: '2026-09-07' },
    { ...voice, date: '2026-09-09' },
    { ...voice, text: 'a\nb\nc' },
    { ...voice, text: 'a' },
    { ...voice, kind: 'milestone', text: 'a\nb' },
    { ...voice, text: 'a\u0085\nb' },
    { ...voice, text: 'あ'.repeat(121) },
    { ...voice, text: 'bad\u0000' },
    { ...voice, text: '' },
    { ...voice, id: 'x' },
  ]) {
    assert.equal(petFirstVoice(invalid, voice.date), null);
  }
  assert.ok(petFirstVoice({ ...voice, kind: 'milestone', text: 'a\nb\nc' }, voice.date));
  jcSetPet({ name: 'fixture', firstVoice: voice }, now);
  assert.ok(jcGetPet()?.firstVoice);
  jcSetPet(null, now);
  assert.equal(jcGetPet(), null);
  jcSetPet({ name: 'fixture', firstVoice: voice }, new Date(2026, 8, 9, 4));
  assert.equal(jcGetPet()?.firstVoice, null);
});

test('appearance is a closed display record and preserves a recorded stage', () => {
  assert.deepEqual(
    petAppearance({ lineage: 'cat', direction: 'cool', score: 99, raw: { private: true } }),
    { lineage: 'cat', direction: 'cool' },
  );
  for (const invalid of [null, {}, { lineage: 'fox', direction: 'warm' }]) {
    assert.deepEqual(petAppearance(invalid), { lineage: null, direction: null });
  }
  assert.deepEqual(petAppearance({ lineage: ['cat'], direction: 'cute' }), {
    lineage: null,
    direction: 'cute',
  });
  jcSetPet(
    { name: 'fixture', stage: 2, appearance: { lineage: null, direction: 'cute', score: 7 } },
    now,
  );
  assert.equal(jcGetPet()!.stage, 2);
  assert.deepEqual(jcGetPet()!.appearance, { lineage: null, direction: 'cute' });
});

test('replay uses only opaque IDs; inaccessible storage suppresses automatic display', () => {
  let stored: string | null = JSON.stringify(['already-seen-000001']);
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, v: string) => {
      stored = v;
    },
  };
  assert.equal(claimPetVoice({ ...voice, id: 'already-seen-000001' }, storage), false);
  assert.equal(claimPetVoice(voice, storage), true);
  assert.equal(claimPetVoice(voice, storage), false);
  assert.doesNotMatch(stored!, /こむぎ|おはよう|2026-09-08/);
  assert.equal(claimPetVoice({ ...voice, id: 'no-storage-000001' }, null), false);
  assert.equal(
    claimPetVoice(
      { ...voice, id: 'bad-storage-00001' },
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('denied');
        },
      },
    ),
    false,
  );
});
