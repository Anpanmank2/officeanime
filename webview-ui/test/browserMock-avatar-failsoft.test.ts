import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadAvailableAvatarParts, withAvatarFallback } from '../src/browserAvatarFailsoft.ts';

test('avatar enhancement failure resolves to legacy fallback without rejecting init', async () => {
  const failure = new Error('corrupt optional avatar PNG');
  const fallback = { catalog: [], sprites: {}, source: 'unavailable' as const };
  let reported: unknown;

  const result = await withAvatarFallback(
    async () => Promise.reject(failure),
    fallback,
    (error) => {
      reported = error;
    },
  );

  assert.equal(result, fallback);
  assert.equal(reported, failure);
});

test('one failed avatar part is skipped without discarding successful siblings', async () => {
  const failures: string[] = [];
  const loaded = await loadAvailableAvatarParts(
    [{ id: 'base' }, { id: 'broken-hair' }, { id: 'shirt' }],
    async ({ id }) => {
      if (id === 'broken-hair') throw new Error('bad PNG');
      return `${id}-sprites`;
    },
    (entry) => failures.push(entry.id),
  );

  assert.deepEqual(loaded, { base: 'base-sprites', shirt: 'shirt-sprites' });
  assert.deepEqual(failures, ['broken-hair']);
});
