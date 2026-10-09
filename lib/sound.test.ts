import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeSound, fromIndexRow, keyLabel, moreLikeLabel, parseReccoRow, toIndexRow, toSongFeel, type SoundFeatures } from './sound.ts';

const row = {
  id: 'x', isrc: 'GBFFP0300052', acousticness: 0.00119, danceability: 0.355, energy: 0.918, instrumentalness: 0,
  key: 1, liveness: 0.0971, loudness: -4.36, mode: 1, speechiness: 0.0746, tempo: 148.114, valence: 0.24,
};
const f: SoundFeatures = parseReccoRow(row)!;

test('parses a ReccoBeats row', () => {
  assert.equal(f.tempo, 148.114);
  assert.equal(f.key, 1);
  assert.equal(f.mode, 1);
  assert.equal(f.energy, 0.918);
});

test('key -1 and an odd mode become null', () => {
  const g = parseReccoRow({ ...row, key: -1, mode: 3 })!;
  assert.equal(g.key, null);
  assert.equal(g.mode, null);
});

test('a row missing a measure is rejected', () => {
  const { energy: _e, ...rest } = row;
  assert.equal(parseReccoRow(rest), null);
  assert.equal(parseReccoRow(null), null);
  assert.equal(parseReccoRow({ ...row, tempo: 'fast' }), null);
});

test('index rows round-trip with 3-place rounding and -1 for null', () => {
  const packed = toIndexRow({ ...f, key: null });
  assert.equal(packed.length, 11);
  assert.equal(packed[1], -1);
  const back = fromIndexRow(packed)!;
  assert.equal(back.key, null);
  assert.equal(back.tempo, 148.114);
  assert.equal(back.acousticness, 0.001);
  assert.equal(fromIndexRow([1, 2]), null);
  assert.equal(fromIndexRow('nope'), null);
});

test('maps onto SongFeel for the Tasteform and Taste Decoded', () => {
  const feel = toSongFeel(f);
  assert.equal(feel.energy, 0.918);
  assert.equal(feel.valence, 0.24);
  assert.equal(feel.tempo, 148.114);
  assert.equal(feel.loudness, -4.36);
});

test('key labels', () => {
  assert.equal(keyLabel(1, 1), 'C♯ major');
  assert.equal(keyLabel(9, 0), 'A minor');
  assert.equal(keyLabel(3, null), 'E♭');
  assert.equal(keyLabel(null, 1), null);
});

test('plain words for Details', () => {
  const lines = describeSound(f);
  assert.equal(lines[0], 'Fast · 148 BPM');
  assert.ok(lines.includes('C♯ major'));
  assert.ok(lines.includes('Loud and dense'));
  const calm = describeSound({ ...f, tempo: 72, energy: 0.2, loudness: -20, instrumentalness: 0.9, key: null });
  assert.equal(calm[0], 'Slow · 72 BPM');
  assert.ok(calm.includes('Quiet and sparse'));
  assert.ok(calm.includes('Mostly instrumental'));
  assert.ok(!calm.some((l) => l.includes('major') || l.includes('minor')));
});

test('the more-like-this note', () => {
  assert.equal(moreLikeLabel(f), 'fast, loud, C♯ major');
  assert.equal(moreLikeLabel({ ...f, tempo: 100, energy: 0.5, loudness: -9, key: null }), 'mid-tempo');
});
