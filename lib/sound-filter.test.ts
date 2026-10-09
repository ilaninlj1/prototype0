import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANY_FILTER, describeFilter, isActive, matches, pickSorted, relax, type SoundFilter } from './sound-filter.ts';
import type { SoundFeatures } from './sound.ts';

const song = (o: Partial<SoundFeatures>): SoundFeatures => ({
  tempo: 115, key: 0, mode: 1, energy: 0.6, danceability: 0.6, acousticness: 0.2, instrumentalness: 0.1,
  speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -7, ...o,
});
const f = (o: Partial<SoundFilter>): SoundFilter => ({ ...ANY_FILTER, ...o });

test('Any lets every song through, even ones without data', () => {
  assert.equal(isActive(ANY_FILTER), false);
  assert.equal(matches(null, ANY_FILTER), true);
  assert.equal(matches(song({}), ANY_FILTER), true);
});

test('an active switch needs sound data', () => {
  assert.equal(matches(null, f({ pace: 'high' })), false);
});

test('each switch picks its side and leaves the middle out', () => {
  assert.equal(matches(song({ tempo: 140 }), f({ pace: 'high' })), true);
  assert.equal(matches(song({ tempo: 115 }), f({ pace: 'high' })), false);
  assert.equal(matches(song({ tempo: 90 }), f({ pace: 'low' })), true);
  assert.equal(matches(song({ energy: 0.9 }), f({ energy: 'high' })), true);
  assert.equal(matches(song({ energy: 0.3 }), f({ energy: 'low' })), true);
  assert.equal(matches(song({ acousticness: 0.8 }), f({ texture: 'low' })), true); // low = acoustic
  assert.equal(matches(song({ acousticness: 0.01 }), f({ texture: 'high' })), true); // high = electronic
  assert.equal(matches(song({ mode: 1 }), f({ mood: 'low' })), true); // low = major
  assert.equal(matches(song({ mode: 0 }), f({ mood: 'high' })), true); // high = minor
  assert.equal(matches(song({ mode: null }), f({ mood: 'high' })), false);
  assert.equal(matches(song({ danceability: 0.3 }), f({ groove: 'low' })), true);
  assert.equal(matches(song({ danceability: 0.85 }), f({ groove: 'high' })), true);
});

test('switches combine', () => {
  const fastLoud = f({ pace: 'high', energy: 'high' });
  assert.equal(matches(song({ tempo: 140, energy: 0.9 }), fastLoud), true);
  assert.equal(matches(song({ tempo: 140, energy: 0.3 }), fastLoud), false);
});

test('describe says what is on, in plain words', () => {
  assert.equal(describeFilter(ANY_FILTER), '');
  assert.equal(describeFilter(f({ pace: 'high', energy: 'high' })), 'fast · loud');
  assert.equal(describeFilter(f({ texture: 'low', mood: 'high' })), 'acoustic · minor');
});

test('relax drops the least important switch first and names it', () => {
  const out = relax(f({ pace: 'high', groove: 'high', mood: 'low' }))!;
  assert.equal(out.dropped, 'groove');
  assert.equal(out.filter.groove, 'any');
  assert.equal(out.filter.pace, 'high');
  assert.equal(relax(ANY_FILTER), null);
});

test('pickSorted: matching songs only, one per artist, n at most, repeatable with the same rng', () => {
  const items = [
    { item: 'a1', artist: 'A', sound: song({ tempo: 140 }) },
    { item: 'a2', artist: 'A', sound: song({ tempo: 150 }) },
    { item: 'b1', artist: 'B', sound: song({ tempo: 90 }) },
    { item: 'c1', artist: 'C', sound: song({ tempo: 135 }) },
    { item: 'd1', artist: 'D', sound: null },
  ];
  const rng = () => 0.3;
  const out = pickSorted(items, f({ pace: 'high' }), 3, rng);
  assert.equal(out.length, 2);
  assert.ok(out.every((x) => ['a1', 'a2', 'c1'].includes(x)));
  assert.ok(!(out.includes('a1') && out.includes('a2')));
  assert.deepEqual(out, pickSorted(items, f({ pace: 'high' }), 3, () => 0.3));
});
