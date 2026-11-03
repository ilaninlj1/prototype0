import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allPlaces, DEPTHS, depthOfBands, depthOfLiveTrack, driftWater, placeKey, placeLabel, SPECIES_INFO, speciesOf, WATER_INFO, WATERS, waterOf } from './ocean-map.ts';
import type { SoundFeatures } from './sound.ts';

const sound = (over: Partial<SoundFeatures> = {}): SoundFeatures => ({
  tempo: 110, key: 0, mode: 1, energy: 0.5, danceability: 0.5,
  acousticness: 0.2, instrumentalness: 0, speechiness: 0.05,
  liveness: 0.1, valence: 0.5, loudness: -10, ...over,
});

const waters: { name: string; sound: Partial<SoundFeatures>; want: string }[] = [
  { name: 'instrumental beats acoustic and moody', sound: { instrumentalness: 0.51, acousticness: 0.9, valence: 0.1 }, want: 'blue' },
  { name: 'exactly 0.5 instrumental is not blue', sound: { instrumentalness: 0.5 }, want: 'reef' },
  { name: 'acoustic beats moody', sound: { acousticness: 0.61, valence: 0.1 }, want: 'kelp' },
  { name: 'exactly 0.6 acoustic is not kelp', sound: { acousticness: 0.6 }, want: 'reef' },
  { name: 'low valence is midnight even with high energy', sound: { valence: 0.29, energy: 0.9 }, want: 'midnight' },
  { name: 'exactly 0.3 valence needs low energy', sound: { valence: 0.3, energy: 0.9 }, want: 'reef' },
  { name: 'low valence with low energy is midnight', sound: { valence: 0.44, energy: 0.44 }, want: 'midnight' },
  { name: 'exactly 0.45 energy is reef', sound: { valence: 0.44, energy: 0.45 }, want: 'reef' },
  { name: 'exactly 0.45 valence is reef', sound: { valence: 0.45, energy: 0.44 }, want: 'reef' },
  { name: 'everything else is reef', sound: {}, want: 'reef' },
];
for (const c of waters) test(`water: ${c.name}`, () => assert.equal(waterOf(sound(c.sound)), c.want));

const species: { name: string; sound: Partial<SoundFeatures>; want: string }[] = [
  { name: 'quiet beats slow', sound: { energy: 0.39, tempo: 94 }, want: 'jelly' },
  { name: 'quiet also beats fast', sound: { energy: 0.39, tempo: 125 }, want: 'jelly' },
  { name: 'exactly 0.4 energy is not jelly', sound: { energy: 0.4 }, want: 'clown' },
  { name: 'slow beats loud', sound: { tempo: 94, energy: 0.88 }, want: 'turtle' },
  { name: 'exactly 95 BPM is not turtle', sound: { tempo: 95 }, want: 'clown' },
  { name: 'loud beats fast at exactly 0.88 energy', sound: { energy: 0.88, tempo: 125 }, want: 'puffer' },
  { name: 'below 0.88 energy is not puffer', sound: { energy: 0.879 }, want: 'clown' },
  { name: 'exactly 125 BPM is fast', sound: { tempo: 125 }, want: 'darter' },
  { name: 'below 125 BPM is not fast', sound: { tempo: 124 }, want: 'clown' },
  { name: 'everything else is clown', sound: {}, want: 'clown' },
];
for (const c of species) test(`species: ${c.name}`, () => assert.equal(speciesOf(sound(c.sound)), c.want));

test('depth uses all four artist and song band pairs', () => {
  assert.equal(depthOfBands('popular', 'hit'), 'popular');
  assert.equal(depthOfBands('popular', 'deepcut'), 'deepcuts');
  assert.equal(depthOfBands('obscure', 'hit'), 'gems');
  assert.equal(depthOfBands('obscure', 'deepcut'), 'buried');
});

test('live depth includes the small-artist and hit-rank boundaries', () => {
  assert.equal(depthOfLiveTrack({ artistListeners: 100_000, trackRank: 3 }), 'gems');
  assert.equal(depthOfLiveTrack({ artistListeners: 100_001, trackRank: 4 }), 'deepcuts');
  assert.equal(depthOfLiveTrack({ artistListeners: 100_001, trackRank: 3 }), 'popular');
  assert.equal(depthOfLiveTrack({ artistListeners: 100_000, trackRank: 4 }), 'buried');
});

test('unknown live popularity goes to Popular', () => {
  assert.equal(depthOfLiveTrack({}), 'popular');
  assert.equal(depthOfLiveTrack({ artistListeners: 100_000 }), 'popular');
  assert.equal(depthOfLiveTrack({ trackRank: 4 }), 'popular');
});

test('drifters stay in the same water and populate all four waters', () => {
  const first = driftWater(1_234_567_890);
  for (let i = 0; i < 10; i++) assert.equal(driftWater(1_234_567_890), first);
  assert.ok(WATERS.includes(first));
  const reached = new Set(Array.from({ length: 1000 }, (_, i) => driftWater(i + 1)));
  assert.deepEqual(reached, new Set(['reef', 'kelp', 'blue', 'midnight']));
});

test('all 16 places have distinct keys and labels, in screen order', () => {
  assert.deepEqual(WATERS, ['reef', 'kelp', 'blue', 'midnight']);
  assert.deepEqual(DEPTHS, ['popular', 'deepcuts', 'gems', 'buried']);
  const places = allPlaces();
  assert.equal(places.length, 16);
  assert.deepEqual(places.slice(0, 4), [
    { water: 'reef', depth: 'popular' }, { water: 'reef', depth: 'deepcuts' },
    { water: 'reef', depth: 'gems' }, { water: 'reef', depth: 'buried' },
  ]);
  assert.equal(new Set(places.map(placeKey)).size, 16);
  assert.equal(new Set(places.map(placeLabel)).size, 16);
  assert.equal(placeLabel({ water: 'midnight', depth: 'buried' }), 'Midnight · Buried');
  assert.equal(placeLabel({ water: 'kelp', depth: 'gems' }), 'Kelp forest · Hidden gems');
});

test('water and creature descriptions use the map table wording', () => {
  assert.deepEqual(WATER_INFO, {
    reef: { name: 'Sunny reef', caption: 'Upbeat, with a full sound' },
    kelp: { name: 'Kelp forest', caption: 'Acoustic' },
    blue: { name: 'Open blue', caption: 'Mostly instrumental' },
    midnight: { name: 'Midnight', caption: 'Dark and moody' },
  });
  assert.deepEqual(SPECIES_INFO, {
    jelly: { name: 'Jellyfish', means: 'Quiet' },
    manta: { name: 'Manta ray', means: 'Instrumental and unhurried' },
    eel: { name: 'Eel', means: 'Talking or rapping' },
    seahorse: { name: 'Seahorse', means: 'Danceable and unhurried' }, turtle: { name: 'Turtle', means: 'Slow' },
    puffer: { name: 'Puffer', means: 'Loud' }, darter: { name: 'Darting fish', means: 'Fast' },
    clown: { name: 'Clownfish', means: 'In between' },
  });
});
