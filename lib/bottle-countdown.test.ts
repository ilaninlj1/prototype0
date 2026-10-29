import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOTTLE_LEAD, COUNT_MIN_LISTEN_MS, queueBottleNow, seaPosition, stepAfterExit } from './bottle-countdown.ts';

test('a bottle shows up 4 songs early', () => {
  assert.equal(BOTTLE_LEAD, 4);
});

test('a song you listened to moves it one step closer', () => {
  assert.equal(stepAfterExit(4, 5000, true), 3);
  assert.equal(stepAfterExit(1, 2000, true), 0);
  assert.equal(stepAfterExit(0, 9000, true), 0);
});

test('a fast skip under 2 seconds does not move it', () => {
  assert.equal(COUNT_MIN_LISTEN_MS, 2000);
  assert.equal(stepAfterExit(3, 1999, true), 3);
});

test('while steering, in a deck or on the Dark Map it waits', () => {
  assert.equal(stepAfterExit(3, 9000, false), 3);
});

test('it joins the queue when it is the next song', () => {
  assert.equal(queueBottleNow(2), false);
  assert.equal(queueBottleNow(1), true);
  assert.equal(queueBottleNow(0), true);
});

test('its place on the sea runs from the far right (4 to go) to the left edge (next)', () => {
  assert.equal(seaPosition(4), 1);
  assert.equal(seaPosition(1), 0);
  assert.ok(seaPosition(3) > seaPosition(2));
  assert.equal(seaPosition(9), 1);
});
