import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCardSize,
  MAX_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  resolveSwipeDirection,
  rotationForDrag,
} from './swipe-physics.ts';

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

test('computeCardSize returns the max size when there is ample room', () => {
  assert.deepEqual(computeCardSize({ width: 500, height: 800 }), {
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });
});

test('computeCardSize shrinks to fit a short available height, preserving aspect ratio', () => {
  const size = computeCardSize({ width: 400, height: 300 });
  assert.equal(size.height, 300);
  assert.ok(size.width < MAX_CARD_WIDTH);
  assert.ok(Math.abs(size.width / size.height - MAX_CARD_WIDTH / MAX_CARD_HEIGHT) < 1e-9);
});

test('computeCardSize shrinks to fit a narrow available width, preserving aspect ratio', () => {
  const size = computeCardSize({ width: 200, height: 800 });
  assert.equal(size.width, 200);
  assert.ok(size.height < MAX_CARD_HEIGHT);
  assert.ok(Math.abs(size.width / size.height - MAX_CARD_WIDTH / MAX_CARD_HEIGHT) < 1e-9);
});

test('computeCardSize falls back to the max size for zero or negative available space', () => {
  assert.deepEqual(computeCardSize({ width: 0, height: 0 }), {
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });
  assert.deepEqual(computeCardSize({ width: -10, height: 500 }), {
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });
});
