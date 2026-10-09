import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBannedHue, particleAt, recipeFor, settledPrint, visualTempo } from './print-recipe.ts';
import type { SoundFeatures } from './sound.ts';

const s: SoundFeatures = {
  tempo: 148, key: 1, mode: 1, energy: 0.9, danceability: 0.4, acousticness: 0.01, instrumentalness: 0,
  speechiness: 0.07, liveness: 0.1, valence: 0.2, loudness: -4,
};
const hueOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

test('same input, same recipe and same still', () => {
  assert.deepEqual(recipeFor(42, s, null), recipeFor(42, s, null));
  const r = recipeFor(42, s, null);
  assert.deepEqual(settledPrint(r), settledPrint(r));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test('different songs differ', () => {
  assert.notDeepEqual(settledPrint(recipeFor(1, s, null)), settledPrint(recipeFor(2, s, null)));
});

test('major and minor make three triad rings, tonic largest', () => {
  for (const mode of [0, 1] as const) {
    const r = recipeFor(7, { ...s, mode }, null);
    assert.equal(r.rings.length, 3);
    assert.ok(r.rings[0].radius > r.rings[1].radius && r.rings[0].radius > r.rings[2].radius);
    assert.ok(Math.abs(r.rings.reduce((a, x) => a + x.weight, 0) - 1) < 1e-9);
  }
  assert.notDeepEqual(recipeFor(7, { ...s, mode: 0 }, null).rings, recipeFor(7, { ...s, mode: 1 }, null).rings);
});

test('dyad, neutral and cover fallback formations', () => {
  assert.equal(recipeFor(7, { ...s, mode: null }, null).rings.length, 2);
  const neutral = recipeFor(7, { ...s, key: null, mode: null }, { hue: 30, neutral: false });
  assert.equal(neutral.rings.length, 3);
  assert.equal(neutral.source, 'sound');
  const cover = recipeFor(7, null, { hue: 200, neutral: false });
  assert.equal(cover.rings.length, 1);
  assert.equal(cover.source, 'cover');
  assert.equal(cover.label, null);
  assert.equal(recipeFor(7, null, null).rings.length, 1);
});

test('labels only say what was measured', () => {
  assert.equal(recipeFor(7, s, null).label, '148 BPM · C♯ MAJOR');
  assert.equal(recipeFor(7, { ...s, mode: null }, null).label, '148 BPM · C♯');
  assert.equal(recipeFor(7, { ...s, key: null, mode: null }, null).label, '148 BPM');
});

test('no violet: every ring color avoids hues 260–320, even from a violet cover', () => {
  for (let key = 0; key < 12; key++)
    for (const mode of [0, 1] as const)
      for (const c of recipeFor(key + 100, { ...s, key, mode }, null).rings.map((x) => x.color))
        assert.ok(!isBannedHue(hueOf(c)), `${c} is violet`);
  const fromViolet = recipeFor(3, null, { hue: 290, neutral: false });
  assert.ok(!isBannedHue(hueOf(fromViolet.rings[0].color)));
});

test('visual tempo folds half and double time together', () => {
  assert.equal(visualTempo(70), 70);
  assert.equal(visualTempo(140), 70);
  assert.equal(visualTempo(148), 74);
  assert.equal(visualTempo(45), 90);
  assert.deepEqual(recipeFor(9, { ...s, tempo: 70 }, null).beat, recipeFor(9, { ...s, tempo: 140 }, null).beat);
});

test('energy sets density within 80–240', () => {
  assert.equal(recipeFor(1, { ...s, energy: 0 }, null).particles, 80);
  assert.equal(recipeFor(1, { ...s, energy: 1 }, null).particles, 240);
});

test('gathered particles sit near their ring', () => {
  const r = recipeFor(5, s, null);
  for (let i = 0; i < r.particles; i += 17) {
    const [x, y] = particleAt(r, i, 3.3, 1);
    assert.ok(x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05);
  }
});

test('mini detail is lighter than full', () => {
  const r = recipeFor(5, s, null);
  const count = (p: ReturnType<typeof settledPrint>) => p.rings.reduce((a, x) => a + x.lines.length, 0);
  assert.ok(count(settledPrint(r, 'mini')) < count(settledPrint(r, 'full')));
  assert.ok(count(settledPrint(r, 'mini')) <= 40);
});
