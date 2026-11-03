import assert from 'node:assert/strict';
import { test } from 'node:test';

import { floorY, restPose, schoolOffset, scatter, swimPose } from './ocean-motion.ts';

const W = 390;
const H = 844;
const fish = { seed: 7, speed: 20, scale: 1, band: 0.4, x: 0.3, look: 'clown' };

test('one moment gives one pose', () => {
  assert.deepEqual(swimPose(fish, 12.5, W, H), swimPose(fish, 12.5, W, H));
});

test('swimmers stay inside the screen plus their wrap margin, in their water column, over a long time', () => {
  for (const look of ['clown', 'neon', 'turtle', 'jelly', 'whale', 'puffer', 'silver']) {
    for (let t = 0; t < 900; t += 7.3) {
      const p = swimPose({ ...fish, look, band: 0.9 }, t, W, H);
      assert.ok(p.x > -91 && p.x < W + 91, `${look} x ${p.x}`);
      assert.ok(p.y > H * 0.1 && p.y < floorY(H), `${look} y ${p.y}`);
    }
  }
});

test('a fish swims the way it faces', () => {
  assert.equal(swimPose({ ...fish, speed: 20 }, 3, W, H).dir, 1);
  assert.equal(swimPose({ ...fish, speed: -20 }, 3, W, H).dir, -1);
  const a = swimPose({ ...fish, speed: 20, x: 0.2 }, 1, W, H).x;
  const b = swimPose({ ...fish, speed: 20, x: 0.2 }, 2, W, H).x;
  assert.ok(b > a);
});

test('a starfish stays put on the seabed, and a crab keeps to the floor', () => {
  const s = swimPose({ ...fish, look: 'starfish' }, 0, W, H);
  assert.deepEqual(s, swimPose({ ...fish, look: 'starfish' }, 40, W, H));
  assert.ok(Math.abs(s.y - floorY(H)) < 4);
  const c = swimPose({ ...fish, look: 'crab' }, 5, W, H);
  assert.ok(Math.abs(c.y - floorY(H)) < 4);
});

test('sleepers spread across the seabed, never in a pile', () => {
  const xs = Array.from({ length: 40 }, (_, i) => restPose(i * 31 + 1, i, 40, W, 700).x);
  assert.ok(Math.min(...xs) < W * 0.1 && Math.max(...xs) > W * 0.9);
  const sorted = [...xs].sort((a, b) => a - b);
  let widest = 0;
  for (let i = 1; i < sorted.length; i++) widest = Math.max(widest, sorted[i] - sorted[i - 1]);
  assert.ok(widest < W * 0.1, 'no big gaps');
  assert.equal(new Set(xs.map((x) => Math.round(x))).size, 40);
});

test('a school spreads out, and each offset is its own', () => {
  const seen = new Set(Array.from({ length: 16 }, (_, i) => schoolOffset(i).join()));
  assert.equal(seen.size, 16);
  assert.deepEqual(schoolOffset(0), [0, 0]);
});

test('scatter pushes away inside its reach and is nothing outside it', () => {
  assert.deepEqual(scatter(200, 200, 100, 200, 90), [0, 0]);
  const [dx, dy] = scatter(120, 200, 100, 200, 90);
  assert.ok(dx > 0);
  assert.equal(dy, 0);
  const [nearer] = scatter(110, 200, 100, 200, 90);
  assert.ok(nearer > dx);
  const [atCenter] = scatter(100, 200, 100, 200, 90);
  assert.ok(atCenter > 0);
});
