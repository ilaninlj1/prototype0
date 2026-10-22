import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AWAKE_MS, gateAwake, seekJump } from './run-gate.ts';

test('a tap without a hold stays asleep', () => {
  assert.equal(gateAwake(null, 1000, 0), false);
  assert.equal(gateAwake(500, 800, 0), false);
});

test('a 500 ms hold wakes for 5 s', () => {
  assert.equal(gateAwake(1000, 1500, 0), true);
  const until = 1500 + AWAKE_MS;
  assert.equal(gateAwake(null, 6000, until), true);
  assert.equal(gateAwake(null, 7000, until), false);
});

test('a 10 s forward jump is a skip', () => {
  assert.equal(seekJump(5, 15.5, 500), 'skip');
});

test('a jump after 4 s wall is not', () => {
  assert.equal(seekJump(5, 15, 4000), null);
});

test('a jump back is back', () => {
  assert.equal(seekJump(20, 10, 500), 'back');
  assert.equal(seekJump(6, 0, 500), 'back');
});

test('normal play is null', () => {
  assert.equal(seekJump(5, 5.5, 500), null);
  assert.equal(seekJump(5, 5, 500), null);
});
