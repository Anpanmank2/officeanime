import assert from 'node:assert/strict';
import test from 'node:test';

import { PALETTE_COUNT } from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';

test('palette 6 is counted in six base slots and new agents receive valid palettes', () => {
  const office = new OfficeState();
  office.addAgent(1, 6);
  const min = Math.min;
  const counts: number[][] = [];
  Math.min = (...values: number[]) => {
    counts.push([...values]);
    return min(...values);
  };
  try {
    assert.doesNotThrow(() => office.addAgent(2));
  } finally {
    Math.min = min;
  }
  assert.deepEqual(counts[0], [1, 0, 0, 0, 0, 0]);
  assert.equal(counts[0].length, PALETTE_COUNT);
  const created = office.characters.get(2)!;
  assert.ok(Number.isInteger(created.palette));
  assert.ok(created.palette > 0 && created.palette < PALETTE_COUNT);
});
