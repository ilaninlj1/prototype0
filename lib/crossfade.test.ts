import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIX_START_THRESHOLD, MIX_THROTTLE_STEP, mixForDrag, mixVolumes, shouldReportMix } from './crossfade.ts';

test('mix volumes clamp at silence and full volume', () => {
  assert.deepEqual(mixVolumes(-1), { current: 1, next: 0 });
  assert.deepEqual(mixVolumes(0), { current: 1, next: 0 });
  assert.deepEqual(mixVolumes(1), { current: 0, next: 1 });
  assert.deepEqual(mixVolumes(2), { current: 0, next: 1 });
});

test('the midpoint is equal power and every mix preserves total power', () => {
  const middle = mixVolumes(0.5);
  assert.ok(Math.abs(middle.current - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(middle.next - Math.SQRT1_2) < 1e-12);
  for (let i = 0; i <= 100; i++) {
    const { current, next } = mixVolumes(i / 100);
    assert.ok(Math.abs(current ** 2 + next ** 2 - 1) < 1e-12);
  }
});

test('only a left drag mixes, proportional to the swipe threshold', () => {
  assert.equal(mixForDrag(-60, 0, 120), 0.5);
  assert.equal(mixForDrag(-240, 0, 120), 1);
  assert.equal(mixForDrag(60, 0, 120), 0);
  assert.equal(mixForDrag(0, 0, 120), 0);
  assert.equal(mixForDrag(-30, 60, 120), 0);
  assert.equal(mixForDrag(-150, 200, 120), 0);
  assert.equal(mixForDrag(-60, -30, 120), 0.5);
});

test('mix reports require a change of at least 0.03 in either direction', () => {
  assert.equal(MIX_START_THRESHOLD, 0.1);
  assert.equal(MIX_THROTTLE_STEP, 0.03);
  assert.equal(shouldReportMix(0.029, 0), false);
  assert.equal(shouldReportMix(0.03, 0), true);
  assert.equal(shouldReportMix(0.12, 0.09), true);
  assert.equal(shouldReportMix(0.3, 0.32), false);
  assert.equal(shouldReportMix(0.3, 0.34), true);
  assert.equal(shouldReportMix(0.5, 0.5), false);
});
