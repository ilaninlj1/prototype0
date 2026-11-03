import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DIVE_IN_AT, DIVE_OUT_AT, DROP_COUNT, GLASS_COUNT, RUSH_COUNT, SPLASH_IN_S, crownAt, dropAt, glassAt, kickAt, ringAt, rushAt, smoothSpeed, splashMix, splashOver, splashPower, wobbleAt } from './ocean-splash.ts';

const peakCrown = (power: number) => {
  let top = 0;
  for (let e = 0; e < 0.7; e += 0.01) for (let fx = 0; fx <= 1; fx += 0.02) top = Math.max(top, crownAt(fx, e, power));
  return top;
};

test('a slow slide is gentle, a hard flick is full, and nothing goes past the ends', () => {
  assert.equal(splashPower(0), 0);
  assert.equal(splashPower(0.2), 0);
  assert.equal(splashPower(50), 1);
  assert.equal(splashPower(-50), 1);
  assert.ok(splashPower(1.2) > 0 && splashPower(1.2) < 1);
});

test('the user’s mix: slow leads with the wobble, hard leads with the crown', () => {
  const slow = splashMix(0);
  const hard = splashMix(1);
  assert.ok(slow.wobble > slow.crown, 'slow: the wobble is the main thing');
  assert.ok(hard.crown > hard.wobble, 'hard: the crown is the main thing');
  assert.ok(hard.wobble > 0 && slow.crown > 0 && hard.rush > 0 && slow.rush > 0, 'all three are in both');
  assert.ok(peakCrown(1) > peakCrown(0) * 2.5);
  assert.ok(wobbleAt(0.1, 0) > wobbleAt(0.1, 1) * 1.5);
});

test('the wobble settles and is gone by a second and a half', () => {
  assert.ok(wobbleAt(0, 0) > wobbleAt(0.5, 0));
  assert.ok(wobbleAt(0.5, 0) > wobbleAt(1, 0));
  assert.equal(wobbleAt(1.6, 0), 0);
});

test('the crown jumps up and falls back, highest in the middle, and is gone', () => {
  assert.equal(crownAt(0.5, 0, 1), 0);
  assert.equal(crownAt(0.5, 0.7, 1), 0);
  assert.ok(crownAt(0.5, 0.31, 1) > crownAt(0.5, 0.1, 1));
  assert.ok(crownAt(0.5, 0.31, 1) > crownAt(0.02, 0.31, 1));
});

test('the surface heaves more on a hard flick and calms down', () => {
  const size = (e: number, power: number) => Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(kickAt(i * 5, e, power))));
  assert.ok(size(0.1, 1) > size(0.1, 0));
  assert.ok(size(2, 1) < size(0.1, 1) * 0.05);
});

test('thrown drops go up, come back down, and a hard flick throws more and higher', () => {
  const on = (power: number) => Array.from({ length: DROP_COUNT }, (_, i) => dropAt(i, 0.1, power)).filter((d) => d.on).length;
  assert.ok(on(1) > on(0) * 2);
  const high = (power: number) => {
    let top = 0;
    for (let i = 0; i < DROP_COUNT; i++) for (let e = 0; e < 1.2; e += 0.02) top = Math.min(top, dropAt(i, e, power).y);
    return top;
  };
  assert.ok(high(1) < high(0));
  assert.ok(dropAt(3, 0.1, 1).y < 0, 'going up');
  for (let i = 0; i < DROP_COUNT; i++) assert.equal(dropAt(i, 2, 1).on, false, 'all back in the water');
});

test('rushing bubbles only rise, fade out and finish before the splash does', () => {
  for (let i = 0; i < RUSH_COUNT * 0.5; i++) {
    const a = rushAt(i, 0.2, 1, 844);
    const b = rushAt(i, 0.4, 1, 844);
    if (a.on && b.on) assert.ok(b.y < a.y, 'rising');
  }
  for (let i = 0; i < RUSH_COUNT; i++) assert.equal(rushAt(i, SPLASH_IN_S, 1, 844).on, false);
});

test('rings spread and fade, one after another', () => {
  assert.equal(ringAt(1, 0.05, 1).alpha, 0);
  assert.ok(ringAt(0, 0.5, 1).radius > ringAt(0, 0.1, 1).radius);
  assert.equal(ringAt(0, 2, 1).alpha, 0);
});

test('drops on the glass only run down, inside the screen, and they finish', () => {
  for (let i = 0; i < GLASS_COUNT * 0.5; i++) {
    const g = glassAt(i, 0.3, 1);
    assert.ok(g.x > 0 && g.x < 1);
    assert.ok(glassAt(i, 0.5, 1).tail >= g.tail || glassAt(i, 0.5, 1).alpha === 0);
    assert.ok(glassAt(i, 0.5, 1).run > g.run, 'it only runs down');
    assert.equal(glassAt(i, 3, 1).alpha, 0);
  }
});

test('a splash ends, and going under starts sooner than coming up', () => {
  assert.equal(splashOver({ kind: 0, e: 0, power: 0, y0: 0 }), true);
  assert.equal(splashOver({ kind: 1, e: 1, power: 0, y0: 0 }), false);
  assert.equal(splashOver({ kind: 1, e: 3, power: 0, y0: 0 }), true);
  assert.equal(splashOver({ kind: 2, e: 2.4, power: 0, y0: 0 }), false);
  assert.ok(DIVE_IN_AT < DIVE_OUT_AT);
});

test('a slow drag stays slow: the one-frame jump as it starts barely moves the smoothed speed', () => {
  // 14 points in one 16 ms frame on a 740-point travel is about 1.2 screens a second, for that one frame only.
  let v = smoothSpeed(0, 1.18, 16);
  assert.ok(splashPower(v) < 0.05, `power ${splashPower(v)}`);
  for (let i = 0; i < 12; i++) v = smoothSpeed(v, 0.2, 16);
  assert.ok(splashPower(v) < 0.05, `power ${splashPower(v)}`);
});

test('a hard flick reaches full power within its first moments', () => {
  let v = 0;
  for (let i = 0; i < 9; i++) v = smoothSpeed(v, 5, 16); // nine frames is the first 0.144 seconds
  assert.ok(splashPower(v) > 0.9, `power ${splashPower(v)}`);
});
