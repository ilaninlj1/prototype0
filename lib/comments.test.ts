import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanComment, cleanVibe, mergeVibes, timeAgo } from './comments.ts';

test('cleanComment trims, rejects empty and over-long text', () => {
  assert.equal(cleanComment('  love the bassline  '), 'love the bassline');
  assert.equal(cleanComment('   '), null);
  assert.equal(cleanComment('x'.repeat(281)), null);
  assert.equal(cleanComment('x'.repeat(280))?.length, 280);
});

test('cleanVibe makes one short lowercase word or phrase', () => {
  assert.equal(cleanVibe('  Late-Night Drive '), 'late-night drive');
  assert.equal(cleanVibe(''), null);
  assert.equal(cleanVibe('a'.repeat(25)), null);
});

test('mergeVibes puts listener votes first, then Last.fm tags, without duplicates', () => {
  const merged = mergeVibes(['indie rock', 'California', 'american'], [
    { word: 'sunny', count: 3 },
    { word: 'california', count: 1 },
  ]);
  assert.deepEqual(merged, [
    { word: 'sunny', count: 3 },
    { word: 'california', count: 1 },
    { word: 'indie rock', count: 0 },
    { word: 'american', count: 0 },
  ]);
});

test('timeAgo speaks like a person', () => {
  const now = 1_000_000_000;
  assert.equal(timeAgo(now - 20_000, now), 'just now');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5m');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3h');
  assert.equal(timeAgo(now - 2 * 86_400_000, now), '2d');
});
