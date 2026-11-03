import assert from 'node:assert/strict';
import { test } from 'node:test';

import { climbLevels, climbedRow, compactCount } from './ocean-climb.ts';

test('every fourfold rise is one level', () => {
  assert.equal(climbLevels(10_000, 40_000), 1);
  assert.equal(climbLevels(10_000, 160_000), 2);
  assert.ok(Math.abs(climbLevels(10_000, 20_000) - 0.5) < 1e-9);
});

test('no count, no growth, or a drop means it stays', () => {
  assert.equal(climbLevels(null, 50_000), 0);
  assert.equal(climbLevels(50_000, null), 0);
  assert.equal(climbLevels(0, 50_000), 0);
  assert.equal(climbLevels(50_000, 50_000), 0);
  assert.equal(climbLevels(50_000, 40_000), 0);
});

test('everyday noise in a count does not move a fish', () => {
  assert.equal(climbLevels(100_000, 110_000), 0);
  assert.ok(climbLevels(100_000, 130_000) > 0);
});

test('it climbs through the levels and stops at the top', () => {
  assert.deepEqual(climbedRow(3, 0), { row: 3, rise: 0 });
  assert.deepEqual(climbedRow(3, 0.5), { row: 3, rise: 0.5 });
  assert.deepEqual(climbedRow(3, 1.25), { row: 2, rise: 0.25 });
  assert.deepEqual(climbedRow(1, 1), { row: 0, rise: 1 });
  assert.equal(climbedRow(1, 5).row, 0);
  assert.equal(climbedRow(1, 5).rise, 1);
});

test('counts read the way people say them', () => {
  assert.equal(compactCount(950), '950');
  assert.equal(compactCount(12_300), '12K');
  assert.equal(compactCount(1_200_000), '1.2M');
  assert.equal(compactCount(1_000_000), '1M');
  assert.equal(compactCount(23_400_000), '23M');
});
