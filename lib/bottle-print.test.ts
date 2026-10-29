import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bottleRings, ringSeedOf } from './bottle-print.ts';
import type { Hop, RingSeed } from './bottle-rows.ts';
import { hslToHex, keyHue, recipeFor } from './print-recipe.ts';
import type { SoundFeatures } from './sound.ts';

const features = (key: number, mode: 0 | 1): SoundFeatures => ({
  tempo: 120,
  key,
  mode,
  energy: 0.5,
  danceability: 0.5,
  acousticness: 0.2,
  instrumentalness: 0,
  speechiness: 0.05,
  liveness: 0.1,
  valence: 0.5,
  loudness: -8,
});

// recipeFor's ring colors for keys 0–11 in minor then major, captured before keyHue was pulled out of it.
const BEFORE = [
  '#3bd1bd,#94dbd2,#f3ead8', '#d1403b,#db9694,#f3ead8', '#3b9fd1,#94c3db,#f3ead8', '#d1973b,#dbc094,#f3ead8',
  '#3bd1d1,#94dbdb,#f3ead8', '#d1593b,#dba294,#f3ead8', '#3b8bd1,#94badb,#f3ead8', '#d1b03b,#dbcc94,#f3ead8',
  '#3bbdd1,#94d2db,#f3ead8', '#d1723b,#dbae94,#f3ead8', '#3b77d1,#94b0db,#f3ead8', '#d1ca3b,#dbd894,#f3ead8',
  '#3ba9d1,#94c8db,#f3ead8', '#d18b3b,#dbba94,#f3ead8', '#3bd1c7,#94dbd7,#f3ead8', '#d14c3b,#db9c94,#f3ead8',
  '#3b95d1,#94bfdb,#f3ead8', '#d1a43b,#dbc694,#f3ead8', '#3bc7d1,#94d7db,#f3ead8', '#d1653b,#dba894,#f3ead8',
  '#3b81d1,#94b5db,#f3ead8', '#d1bd3b,#dbd294,#f3ead8', '#3bb3d1,#94cddb,#f3ead8', '#d17e3b,#dbb494,#f3ead8',
];

test('recipeFor ring colors are unchanged by the keyHue refactor', () => {
  const now: string[] = [];
  for (let key = 0; key < 12; key++)
    for (const mode of [0, 1] as const) now.push(recipeFor(1000 + key, features(key, mode), null).rings.map((r) => r.color).join(','));
  assert.deepEqual(now, BEFORE);
});

test('keyHue is the hue recipeFor gives a key', () => {
  assert.equal(keyHue(0, 1), 2);
  assert.equal(keyHue(7, 1), 7); // G is one fifth up from C
  assert.equal(keyHue(9, 0), 184); // A minor: three fifths up, minor side
  assert.equal(hslToHex(keyHue(0, 1), 0.62, 0.62).length, 7);
});

test('ringSeedOf keeps key, mode, energy and tempo, or null', () => {
  assert.deepEqual(ringSeedOf(features(4, 0)), { key: 4, mode: 0, energy: 0.5, tempo: 120 });
  assert.equal(ringSeedOf(null), null);
  assert.deepEqual(ringSeedOf({ ...features(4, 0), tempo: 400, energy: 1.2 }), { key: 4, mode: 0, energy: 1, tempo: 250 });
});

const keep = (ring: RingSeed | null, tier: Hop['tier'] = null): Hop => ({
  kind: 'keep',
  city: 'X',
  country: '',
  lat: 0,
  lng: 0,
  exact: true,
  tier,
  ring,
  at: '',
});
const seed: RingSeed = { key: 2, mode: 1, energy: 0.8, tempo: 128 };

test('one ring per keep, none for the launch, spaced from 0.36 to 0.49', () => {
  const launch: Hop = { ...keep(null), kind: 'launch' };
  const rings = bottleRings([launch, keep(seed), keep(seed), keep(seed)]);
  assert.equal(rings.length, 3);
  assert.deepEqual(
    rings.map((r) => Number(r.radius.toFixed(3))),
    [0.36, 0.425, 0.49]
  );
  assert.equal(bottleRings([keep(seed)])[0].radius, 0.36);
});

test('at most the last 12 rings', () => {
  const hops = Array.from({ length: 20 }, (_, i) => keep({ ...seed, tempo: 60 + i }));
  const rings = bottleRings(hops);
  assert.equal(rings.length, 12);
  assert.equal(rings[11].beat, bottleRings([keep({ ...seed, tempo: 79 })])[0].beat);
});

test('a keeper with no sound data leaves a cream hairline', () => {
  const [r] = bottleRings([keep(null)]);
  assert.equal(r.color, '#f3ead8');
  assert.equal(r.weight, 0.12);
  assert.equal(r.beat, 1);
});

test('a seed colors the ring by key and weights it by energy', () => {
  const [r] = bottleRings([keep(seed)]);
  assert.equal(r.color, hslToHex(keyHue(2, 1), 0.62, 0.62));
  assert.equal(Number(r.weight.toFixed(2)), 0.55);
});

test('deep in a blind spot wobbles more than close to home', () => {
  const [close] = bottleRings([keep(seed, 'close')]);
  const [deep] = bottleRings([keep(seed, 'deep')]);
  assert.ok(deep.wobble > close.wobble);
});
