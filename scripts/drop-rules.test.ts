// scripts/drop-rules.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, canRedo, daysBetween, distinctGenres, inRankWindow, seedWindow, slotFor } from './drop-rules.ts';

test('slotFor uses the spec thresholds', () => {
  assert.equal(slotFor(4_999), 'buried');
  assert.equal(slotFor(5_000), 'tiny');
  assert.equal(slotFor(19_999), 'tiny');
  assert.equal(slotFor(20_000), 'radar');
  assert.equal(slotFor(100_000), 'known');
  assert.equal(slotFor(999_999), 'known');
  assert.equal(slotFor(1_000_000), 'famous');
});

test('inRankWindow: famous takes ranks 11-50, others 1-3', () => {
  assert.equal(inRankWindow('famous', 10), false);
  assert.equal(inRankWindow('famous', 11), true);
  assert.equal(inRankWindow('famous', 50), true);
  assert.equal(inRankWindow('famous', 51), false);
  assert.equal(inRankWindow('tiny', 3), true);
  assert.equal(inRankWindow('tiny', 4), false);
});

test('date helpers cross month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-09-29', '2026-10-02'), 3);
});

test('canRedo refuses today and the past', () => {
  assert.equal(canRedo('2026-10-01', '2026-10-01'), false);
  assert.equal(canRedo('2026-09-30', '2026-10-01'), false);
  assert.equal(canRedo('2026-10-02', '2026-10-01'), true);
});

test('seedWindow widens each slot so a seed count that drifted still gets checked', () => {
  assert.equal(seedWindow('known').min <= 60_000, true);
  assert.equal(seedWindow('known').max >= 1_500_000, true);
  assert.equal(seedWindow('buried').min, 0);
  assert.equal(seedWindow('famous').max, Infinity);
});

test('distinctGenres rejects a day whose picks share a genre', () => {
  const s = (genre: string) => ({ genre }) as { genre: string };
  assert.equal(distinctGenres([s('Jazz'), s('Rock')]), true);
  assert.equal(distinctGenres([s('Jazz'), s('Jazz')]), false);
});
