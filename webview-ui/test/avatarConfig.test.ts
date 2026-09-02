import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAvatarConfigFile } from '../src/office/sprites/avatarTypes.ts';

const validConfig = {
  version: 1,
  avatarRevision: 1,
  avatars: {
    'member-01': {
      base: { part: 'body_01', color: null },
      layers: [
        {
          slot: 'top',
          part: 'shirt_button',
          color: { h: 210, s: 10, b: -5, c: 0, colorize: true },
        },
        { slot: 'accessory', part: 'glasses', color: null },
      ],
    },
  },
};

test('avatar config validators accept a versioned, finite, well-formed file', () => {
  assert.deepEqual(parseAvatarConfigFile(validConfig), validConfig);
});

test('avatar config validators reject container arrays and malformed nested values', () => {
  const cases: unknown[] = [
    [],
    { version: 1, avatars: [] },
    { version: 1, avatars: { broken: 'not-an-avatar' } },
    {
      version: 1,
      avatars: { broken: { base: { part: '', color: null }, layers: [] } },
    },
    {
      version: 1,
      avatars: {
        broken: {
          base: { part: 'body_01', color: null },
          layers: [{ slot: 'top', part: 'shirt', color: { h: Infinity, s: 0, b: 0, c: 0 } }],
        },
      },
    },
  ];

  for (const value of cases) {
    assert.equal(parseAvatarConfigFile(value), null);
  }
});

test('avatar config validators enforce singular slots and the accessory limit', () => {
  const duplicateTop = structuredClone(validConfig);
  duplicateTop.avatars['member-01'].layers.push({
    slot: 'top',
    part: 'shirt_other',
    color: null,
  });
  const tooManyAccessories = structuredClone(validConfig);
  tooManyAccessories.avatars['member-01'].layers.push(
    { slot: 'accessory', part: 'badge', color: null },
    { slot: 'accessory', part: 'cup', color: null },
  );

  for (const value of [duplicateTop, tooManyAccessories]) {
    assert.equal(parseAvatarConfigFile(value), null);
  }
});
