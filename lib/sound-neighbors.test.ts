import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keyGap, pickNeighbors, soundDistance, tempoGap } from './sound-neighbors.ts';
import type { SoundFeatures } from './sound.ts';

const base: SoundFeatures = {
  tempo: 120, key: 0, mode: 1, energy: 0.6, danceability: 0.6, acousticness: 0.2, instrumentalness: 0.1,
  speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -7,
};

test('tempo treats half and double time as the same pace', () => {
  assert.equal(tempoGap(120, 60), 0);
  assert.equal(tempoGap(70, 140), 0);
  assert.ok(Math.abs(tempoGap(120, 132) - 12 / 132) < 1e-9);
});

test('relative major and minor count as the same key; fifths are close', () => {
  assert.equal(keyGap(base, { ...base, key: 9, mode: 0 }), 0); // C major ~ A minor
  assert.ok(keyGap(base, { ...base, key: 7 })! < keyGap(base, { ...base, key: 6 })!); // G is closer than F♯
  assert.equal(keyGap(base, { ...base, key: 6 }), 1);
  assert.equal(keyGap(base, { ...base, key: null }), null);
});

test('distance is 0 for the same sound and grows with difference', () => {
  assert.equal(soundDistance(base, base), 0);
  const near = soundDistance(base, { ...base, energy: 0.65 });
  const far = soundDistance(base, { ...base, energy: 0.1, tempo: 85, acousticness: 0.9 });
  assert.ok(near < far);
});

test('unknown harmony is dropped and the rest rescaled, not counted as a match', () => {
  const unknown = { ...base, key: null };
  assert.equal(soundDistance(base, unknown), 0);
  const d = soundDistance(base, { ...unknown, energy: 0.1 });
  const dKnown = soundDistance(base, { ...base, energy: 0.1 });
  assert.ok(d > dKnown); // the same energy gap weighs more when harmony can't contribute
});

test('pickNeighbors: closest first, one per artist, never the target artist, skips missing sound', () => {
  const c = (item: string, artist: string, sound: SoundFeatures | null) => ({ item, artist, sound });
  const out = pickNeighbors(base, 'Target', [
    c('far', 'A', { ...base, energy: 0.05, tempo: 90 }),
    c('self', 'target', { ...base }),
    c('none', 'B', null),
    c('near1', 'C', { ...base, energy: 0.62 }),
    c('near1b', 'C', { ...base, energy: 0.61 }),
    c('near2', 'D', { ...base, danceability: 0.5 }),
  ]);
  assert.deepEqual(out, ['near1b', 'near2', 'far']);
});

test('pickNeighbors returns fewer when there are fewer', () => {
  assert.deepEqual(pickNeighbors(base, 'X', [], 3), []);
  assert.deepEqual(pickNeighbors(base, 'X', [{ item: 1, artist: 'Y', sound: base }], 3), [1]);
});
