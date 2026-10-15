import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBannedHue, recipeFor } from './print-recipe.ts';
import { agedRecipe, formatRelease, releaseDay, releaseLine, songAge } from './song-age.ts';
import type { SoundFeatures } from './sound.ts';

const s: SoundFeatures = {
  tempo: 148, key: 1, mode: 1, energy: 0.9, danceability: 0.4, acousticness: 0.01, instrumentalness: 0,
  speechiness: 0.07, liveness: 0.1, valence: 0.2, loudness: -4,
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const saturation = (hex: string) => {
  const c = rgb(hex).map((v) => v / 255);
  const max = Math.max(...c), min = Math.min(...c);
  return max === 0 ? 0 : (max - min) / max;
};
const hueOf = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const NOW = Date.UTC(2026, 9, 14);

test('the release day is the date iTunes wrote, with no time zone shift', () => {
  assert.equal(releaseDay('1978-03-23T08:00:00Z'), '1978-03-23');
  assert.equal(releaseDay('2024-11-01T00:00:00-07:00'), '2024-11-01');
  assert.equal(releaseDay('1978-03-23'), '1978-03-23');
  for (const bad of [undefined, null, '', 'soon', 1978, '78-03-23']) assert.equal(releaseDay(bad), null);
});

test('iTunes\'s 1900-01-01 means it doesn\'t know', () => {
  assert.equal(releaseDay('1900-01-01T08:00:00Z'), null);
  assert.equal(releaseDay('1926-11-26T08:00:00Z'), '1926-11-26');
});

test('a song ages from 0 when new to 1 at fifty years', () => {
  assert.equal(songAge('2026-10-14', NOW), 0);
  assert.ok(Math.abs(songAge('2001-10-14', NOW)! - 0.5) < 0.01);
  assert.equal(songAge('1976-01-01', NOW), 1);
  assert.equal(songAge('1958-06-01', NOW), 1);
  assert.equal(songAge('2027-02-01', NOW), 0, 'a date in the future counts as new');
  assert.equal(songAge(null, NOW), null);
  assert.equal(songAge(undefined, NOW), null);
  assert.equal(songAge('not a date', NOW), null);
});

test('the date reads like a person would say it; a bare year when the store only has the year', () => {
  assert.equal(formatRelease('1978-03-23'), 'Mar 23, 1978');
  assert.equal(formatRelease('2025-10-03'), 'Oct 3, 2025');
  assert.equal(formatRelease('1966-01-01'), '1966');
  assert.equal(formatRelease(null), null);
  assert.equal(formatRelease(undefined), null);
});

test('the reveal line gives the date and the release', () => {
  assert.equal(releaseLine('1978-03-23', 'Kaya (Deluxe Edition)'), 'Released Mar 23, 1978 · Kaya (Deluxe Edition)');
  assert.equal(releaseLine('2025-10-03', 'Night Drive - Single'), 'Released Oct 3, 2025 · Single');
  assert.equal(releaseLine('2019-05-10', 'Blue Hour - EP'), 'Released May 10, 2019 · Blue Hour EP');
  assert.equal(releaseLine('1966-01-01', null), 'Released 1966');
  assert.equal(releaseLine(undefined, 'Kaya'), 'Kaya');
  assert.equal(releaseLine(null, null), null);
  assert.equal(releaseLine(null, '  '), null);
});

test('a new song or one with no date keeps its print exactly', () => {
  const r = recipeFor(42, s, null);
  assert.equal(agedRecipe(r, null), r);
  assert.equal(agedRecipe(r, 0), r);
});

test('an old song warms the ground and fades its colors, keeping the shape', () => {
  const r = recipeFor(42, s, null);
  const old = agedRecipe(r, 1);
  const [gr, , gb] = rgb(old.ground);
  assert.ok(gr > gb, `old ground ${old.ground} is warm`);
  assert.ok(gb < rgb(r.ground)[2], 'the navy drains out');
  old.rings.forEach((ring, i) => {
    assert.ok(saturation(ring.color) < saturation(r.rings[i].color), `ring ${i} fades: ${r.rings[i].color} → ${ring.color}`);
    assert.deepEqual({ ...ring, color: '' }, { ...r.rings[i], color: '' }, 'rings stay where they were');
  });
  assert.deepEqual({ ...old, ground: '', ink: '', rings: [] }, { ...r, ground: '', ink: '', rings: [] }, 'motion and texture untouched');
});

test('aging is gradual: a 25-year-old song sits between new and old', () => {
  const r = recipeFor(42, s, null);
  const blue = (age: number) => rgb(agedRecipe(r, age).ground)[2];
  assert.ok(blue(0.5) < rgb(r.ground)[2] && blue(0.5) > blue(1));
});

test('fading keeps each color\'s hue, so the key still reads and nothing turns violet', () => {
  const prints = [];
  for (let key = 0; key < 12; key++) for (const mode of [0, 1] as const) prints.push(recipeFor(key, { ...s, key, mode }, null));
  for (let hue = 0; hue < 360; hue++) prints.push(recipeFor(hue, null, { hue, neutral: false }));
  for (const r of prints) {
    agedRecipe(r, 1).rings.forEach((ring, i) => {
      assert.ok(!isBannedHue(hueOf(ring.color)), `${r.rings[i].color} → ${ring.color}`);
      if (saturation(r.rings[i].color) > 0.3) {
        const drift = Math.abs(hueOf(ring.color) - hueOf(r.rings[i].color));
        assert.ok(Math.min(drift, 360 - drift) < 2, `${r.rings[i].color} → ${ring.color} keeps its hue`);
      }
    });
  }
});
