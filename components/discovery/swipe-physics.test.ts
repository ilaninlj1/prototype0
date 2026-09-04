import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSwipeDirection, rotationForDrag } from './swipe-physics.ts';

test('resolveSwipeDirection returns right past the horizontal threshold', () => {
  assert.equal(resolveSwipeDirection(150, 0), 'right');
});

test('resolveSwipeDirection returns left past the negative horizontal threshold', () => {
  assert.equal(resolveSwipeDirection(-150, 0), 'left');
});

test('resolveSwipeDirection returns down when vertical drag dominates and passes its threshold', () => {
  assert.equal(resolveSwipeDirection(20, 150), 'down');
});

test('resolveSwipeDirection prefers down over right on a dominant diagonal drag', () => {
  assert.equal(resolveSwipeDirection(100, 150), 'down');
});

test('resolveSwipeDirection returns null under every threshold', () => {
  assert.equal(resolveSwipeDirection(10, 10), null);
});

test('rotationForDrag is proportional and clamped to +/-12 degrees', () => {
  assert.equal(rotationForDrag(0, 300), 0);
  assert.equal(rotationForDrag(300, 300), 12);
  assert.equal(rotationForDrag(-600, 300), -12);
});
