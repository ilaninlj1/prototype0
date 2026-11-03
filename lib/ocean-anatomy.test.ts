import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anatomyKey, anatomyLines, anatomyOf } from './ocean-anatomy.ts';
import type { SoundFeatures } from './sound.ts';

const base: SoundFeatures = { tempo: 110, key: 2, mode: 1, energy: 0.6, danceability: 0.5, acousticness: 0.2, instrumentalness: 0, speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -8 };

test('one song always gets one body', () => {
  assert.deepEqual(anatomyOf(base), anatomyOf({ ...base }));
});

test('danceable songs are rounder, and others long and slender', () => {
  const round = anatomyOf({ ...base, danceability: 0.95 });
  const slim = anatomyOf({ ...base, danceability: 0.1 });
  assert.ok(round.depth > slim.depth && round.length < slim.length);
});

test('bright songs have bigger fins than dark ones', () => {
  assert.ok(anatomyOf({ ...base, valence: 0.95 }).fin > anatomyOf({ ...base, valence: 0.05 }).fin);
});

test('major forks, minor rounds, and no known key fans out', () => {
  assert.equal(anatomyOf({ ...base, mode: 1 }).tail, 'fork');
  assert.equal(anatomyOf({ ...base, mode: 0 }).tail, 'round');
  assert.equal(anatomyOf({ ...base, mode: null }).tail, 'fan');
});

test('the pattern comes from the texture of the sound', () => {
  assert.equal(anatomyOf({ ...base, acousticness: 0.7 }).pattern, 'spots');
  assert.equal(anatomyOf({ ...base, acousticness: 0.01 }).pattern, 'lines');
  assert.equal(anatomyOf({ ...base, instrumentalness: 0.8 }).pattern, 'band');
  assert.equal(anatomyOf(base).pattern, 'stripes');
});

test('louder songs have more spines, inside their range', () => {
  const quiet = anatomyOf({ ...base, loudness: -30 }).spines;
  const loud = anatomyOf({ ...base, loudness: 2 }).spines;
  assert.equal(quiet, 8);
  assert.equal(loud, 18);
});

test('a song with no sound data still gets a whole body', () => {
  const a = anatomyOf(null);
  assert.equal(a.pattern, 'plain');
  assert.equal(a.length, 1);
});

test('real variety: songs that differ in sound rarely share a body', () => {
  const keys = new Set<string>();
  for (const key of [0, 3, 7]) for (const mode of [0, 1] as const) for (const danceability of [0.2, 0.6, 0.9]) for (const valence of [0.1, 0.5, 0.9]) for (const acousticness of [0.01, 0.3, 0.8]) keys.add(anatomyKey(anatomyOf({ ...base, key, mode, danceability, valence, acousticness })));
  assert.ok(keys.size > 100, `${keys.size} bodies`);
});

test('the lines name the traits that stand out, and never more than three', () => {
  const lines = anatomyLines(anatomyOf({ ...base, danceability: 0.95, valence: 0.95, acousticness: 0.8, speechiness: 0.5 }));
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Round'));
  assert.ok(lines.some((l) => l.startsWith('Spots')));
  assert.deepEqual(anatomyLines(anatomyOf(null)), []);
});
