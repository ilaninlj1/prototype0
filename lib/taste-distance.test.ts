import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_SAVES, restlessness, TIER_CUTS, tasteDistance, tierFor } from './taste-distance.ts';
import type { SoundFeatures } from './sound.ts';

const base: SoundFeatures = {
  tempo: 120, key: 0, mode: 1, energy: 0.6, danceability: 0.6, acousticness: 0.2, instrumentalness: 0.1,
  speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -7,
};
const saves = (n: number) => Array.from({ length: n }, (_, i) => ({ ...base, energy: 0.55 + i * 0.01 }));

test('needs enough saves with sound data', () => {
  assert.equal(tasteDistance(base, saves(MIN_SAVES - 1)), null);
  assert.notEqual(tasteDistance(base, saves(MIN_SAVES)), null);
});

test('a song like your saves is close; a very different one is far', () => {
  const near = tasteDistance(base, saves(8))!;
  const far = tasteDistance({ ...base, tempo: 75, energy: 0.05, danceability: 0.1, acousticness: 0.95, instrumentalness: 0.9, key: 6 }, saves(8))!;
  assert.ok(near < 0.05, `near ${near}`);
  assert.ok(far > near);
  assert.equal(tierFor(near), 'close');
  assert.equal(tierFor(far), 'deep');
});

test('distance is the mean of the 3 nearest saves, so one odd save does not make everything close', () => {
  const odd = { ...base, tempo: 75, energy: 0.05, acousticness: 0.95 };
  const list = [...saves(6), odd];
  const plain = tasteDistance(odd, saves(6))!;
  const withOne = tasteDistance(odd, list)!;
  assert.ok(withOne < plain); // one matching save pulls it closer
  assert.ok(withOne > 0); // but the mean of 3 keeps it from reading as identical
});

test('tiers split at the cuts', () => {
  assert.equal(tierFor(0), 'close');
  assert.equal(tierFor(TIER_CUTS[0]), 'new');
  assert.equal(tierFor(TIER_CUTS[1]), 'deep');
});

test('restlessness runs 0 to 1 across the tiers', () => {
  assert.equal(restlessness(0), 0);
  assert.equal(restlessness(10), 1);
  assert.ok(restlessness(TIER_CUTS[0]) > 0 && restlessness(TIER_CUTS[0]) < restlessness(TIER_CUTS[1]));
});
