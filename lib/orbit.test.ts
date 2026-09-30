import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orbitPose } from './orbit.ts';

test('the focused item sits full size at the top of the orbit', () => {
  assert.deepEqual(orbitPose(0), { scale: 1, translateY: 0, rotate: 0, opacity: 1 });
});

test('neighbours shrink, drop along the arc and tilt away, symmetrically', () => {
  const right = orbitPose(1);
  const left = orbitPose(-1);
  assert.ok(right.scale < 1 && right.scale > 0.5);
  assert.ok(right.translateY > 0);
  assert.equal(left.translateY, right.translateY);
  assert.equal(left.rotate, -right.rotate);
  assert.ok(right.rotate > 0);
  assert.ok(right.opacity < 1 && right.opacity > 0.3);
});

test('further items keep getting smaller but never vanish', () => {
  const two = orbitPose(2);
  const far = orbitPose(4);
  assert.ok(two.scale < orbitPose(1).scale);
  assert.ok(far.scale >= 0.45 && far.opacity >= 0.3);
});
