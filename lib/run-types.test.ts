import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_PROFILE, withKnockDefault } from './run-types.ts';

test('tap to like starts on', () => {
  assert.equal(EMPTY_PROFILE.knockOn, true);
});

test('a profile saved before the default changed turns tap to like on', () => {
  assert.equal(withKnockDefault({ ...EMPTY_PROFILE, knockCalibrated: false, knockOn: false }).knockOn, true);
});

test('someone who turned it off keeps it off', () => {
  assert.equal(withKnockDefault({ ...EMPTY_PROFILE, knockCalibrated: true, knockOn: false }).knockOn, false);
});
