import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crossedMilestone, describeMilestone, grewALot } from './milestones.ts';

test('crossedMilestone returns the highest crossing, including the exact threshold', () => {
  for (const m of [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]) {
    assert.equal(crossedMilestone(m - 1, m), m);
    assert.equal(crossedMilestone(m, m), null);
  }
  assert.equal(crossedMilestone(4_800, 510_000), 500_000);
  assert.equal(crossedMilestone(50_000, 49_999), null);
  assert.equal(crossedMilestone(1_000_000, 2_000_000), null);
});

test('growth needs both 25 percent and 1,000 listeners', () => {
  assert.equal(grewALot(40, 50), false);
  assert.equal(grewALot(1_000, 1_999), false);
  assert.equal(grewALot(1_000, 2_000), true);
  assert.equal(grewALot(4_000, 5_000), true);
  assert.equal(grewALot(10_000, 12_499), false);
  assert.equal(grewALot(10_000, 12_500), true);
  assert.equal(grewALot(10_000, 9_000), false);
});

test('missing, zero and invalid counts never establish growth', () => {
  for (const before of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(crossedMilestone(before, 100_000), null);
    assert.equal(grewALot(before, 100_000), false);
  }
  for (const now of [undefined, null, NaN, Infinity, -1]) {
    assert.equal(crossedMilestone(4_800, now), null);
    assert.equal(grewALot(4_800, now), false);
  }
});

test('milestone descriptions prefer the highest milestone, then substantial growth', () => {
  assert.equal(describeMilestone('Mabe Fratti', 4_800, 54_000), 'Mabe Fratti passed 50K listeners. You found them at 4.8K.');
  assert.equal(describeMilestone('Mabe Fratti', 4_800, 6_000), 'Mabe Fratti grew to 6K listeners. You found them at 4.8K.');
  assert.equal(describeMilestone('Mabe Fratti', 4_800, 5_000), null);
  assert.equal(describeMilestone('Mabe Fratti', undefined, 50_000), null);
});

test('describeMilestone: names the count you found them at, not a later checkpoint', () => {
  assert.equal(
    describeMilestone('Mabe Fratti', 30_000, 52_000, 4_800),
    'Mabe Fratti passed 50K listeners. You found them at 4.8K.'
  );
});
