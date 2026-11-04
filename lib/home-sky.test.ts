import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CALM_WEATHER, contrast, luminance, matchedWater, moonAt, skyAt, sunAt, textBand, weatherOf, wordsAreDark, wordsVeil } from './home-sky.ts';
import { glitterPath, gullsPath, mixVector, rainPath, signFace, sockPaths, stepSign } from './home-sky-motion.ts';
import { hexToRgb, mixRgb } from './ocean-scene.ts';
import { DEPTHS, WATERS } from './ocean-map.ts';
import type { SoundFeatures } from './sound.ts';

const sound = (energy: number, acousticness: number, valence: number): SoundFeatures => ({ tempo: 100, key: 0, mode: 1, energy, danceability: 0.5, acousticness, instrumentalness: 0, speechiness: 0, liveness: 0, valence, loudness: -8 });
const SOFT = weatherOf(sound(0.22, 0.85, 0.72));
const BRIGHT = weatherOf(sound(0.86, 0.05, 0.85));
const SAD = weatherOf(sound(0.2, 0.75, 0.14));
const HEAVY = weatherOf(sound(0.95, 0.02, 0.12));
const ALL_WEATHER = [SOFT, BRIGHT, SAD, HEAVY, CALM_WEATHER];
const HOURS = Array.from({ length: 96 }, (_, i) => i / 4);

test('the song sets the weather', () => {
  assert.equal(SOFT.label, 'clear');
  assert.equal(BRIGHT.label, 'windy');
  assert.equal(SAD.label, 'rain');
  assert.equal(HEAVY.label, 'storm');
  assert.equal(HEAVY.storm, true);
  assert.equal(BRIGHT.storm, false);
  assert.ok(HEAVY.wind > SOFT.wind);
  assert.deepEqual(weatherOf(null), CALM_WEATHER);
});

test('the sky never jumps from one quarter hour to the next, and midnight joins up', () => {
  for (const w of ALL_WEATHER) {
    for (let h = 0; h < 24; h += 0.25) {
      const a = skyAt(h, w).hor;
      const b = skyAt(h + 0.25, w).hor;
      const gap = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      assert.ok(gap < 75, `horizon jumped ${gap.toFixed(0)} at ${h}`);
    }
  }
  assert.deepEqual(skyAt(0, SOFT).zen.map(Math.round), skyAt(24, SOFT).zen.map(Math.round));
});

test('the sun is on the horizon at 6:30 and 7:00, high at midday, and gone at night; the moon is up at night', () => {
  const H = 700;
  assert.ok(Math.abs(sunAt(6.5, 390, H).y - H) < 1);
  assert.ok(Math.abs(sunAt(19, 390, H).y - H) < 1);
  assert.ok(sunAt(12.75, 390, H).y < 60);
  assert.equal(sunAt(23, 390, H).up, false);
  assert.equal(moonAt(23, 390, H).up, true);
  assert.equal(moonAt(13, 390, H).up, false);
});

test('the water never outshines the sky it meets, in any water, depth, hour or weather', () => {
  for (const water of WATERS) for (const depth of DEPTHS) for (const w of ALL_WEATHER) for (const h of HOURS) {
    const look = skyAt(h, w);
    const m = matchedWater(water, depth, look);
    assert.ok(luminance(hexToRgb(m.top)) <= luminance(look.hor) * 0.98, `${water} ${depth} ${h}`);
    assert.ok(luminance(hexToRgb(m.low)) <= luminance(hexToRgb(m.top)) * 1.02, `near water brighter than far at ${water} ${depth} ${h}`);
  }
});

test('the tab bar stays readable on the water everywhere', () => {
  let worst = 99;
  let where = '';
  let below45 = 0;
  let total = 0;
  for (const water of WATERS) for (const depth of DEPTHS) for (const w of ALL_WEATHER) for (const h of HOURS) {
    const c = matchedWater(water, depth, skyAt(h, w)).inkContrast;
    total += 1;
    if (c < 4.5) below45 += 1;
    if (c < worst) {
      worst = c;
      where = `${water} ${depth} ${w.label} ${h}`;
    }
  }
  console.log(`tab ink: lowest ${worst.toFixed(2)} at ${where}; under 4.5 in ${below45} of ${total}`);
  assert.ok(worst >= 3.5, `${worst} at ${where}`);
});

test('Home\'s words pick the ink that reads on the sky, at every hour and weather', () => {
  const BLACK: [number, number, number] = [17, 17, 17];
  const CREAM: [number, number, number] = [243, 234, 216];
  let worst = 99;
  for (const w of ALL_WEATHER) {
    for (const h of HOURS) {
      const look = skyAt(h, w);
      const dark = wordsAreDark(look, true);
      const veil = wordsVeil(look, dark);
      worst = Math.min(worst, contrast(dark ? BLACK : CREAM, mixRgb(textBand(look), veil.color, veil.opacity)));
    }
  }
  assert.ok(worst >= 4.5, `lowest ${worst}`);
  assert.equal(wordsAreDark(skyAt(12.5, SOFT), true), true);
  assert.equal(wordsAreDark(skyAt(23, SOFT), true), false);
});

test('the haze behind the words stays away on a clear pale sky', () => {
  assert.equal(wordsVeil(skyAt(12.5, SOFT), true).opacity, 0);
  assert.ok(wordsVeil(skyAt(15, HEAVY), wordsAreDark(skyAt(15, HEAVY), true)).opacity > 0);
});

test('the windsock follows the wind: limp hangs, full stands straight out', () => {
  const y = (d: string) => Number(d.split('L')[1].split(' ')[1]);
  const limp = sockPaths(0, 0, 0, 0).red;
  const full = sockPaths(0, 0, 1, 0).red;
  assert.ok(y(limp) > y(full), 'a limp sock hangs lower');
});

test('the sign settles, and a flip shows the other side', () => {
  let s = { theta: 0, vel: 0, n: 0, next: 1e9 };
  for (let i = 0; i < 300; i++) s = stepSign(s, 1 / 30, i / 30, 0);
  assert.ok(Math.abs(s.theta) < 0.2);
  assert.equal(signFace(s.theta) % 2, 0);
  s = { ...s, n: 1 };
  for (let i = 0; i < 300; i++) s = stepSign(s, 1 / 30, i / 30, 0);
  assert.equal(signFace(s.theta) % 2, 1);
});

test('frame paths are well formed', () => {
  for (const d of [glitterPath(100, 700, 140, 3), gullsPath(390, 3, 690, 120), rainPath(390, 700, 3, 0.5, 0.5)]) {
    assert.match(d, /^M/);
    assert.doesNotMatch(d, /NaN|undefined/);
  }
  assert.deepEqual(mixVector([0, 10], [10, 20], 0.5), [5, 15]);
});

test('every function a frame calls is marked as a worklet', () => {
  // On a phone these run on the UI thread, where calling a function that isn't a worklet crashes the app.
  for (const file of ['lib/home-sky-motion.ts']) {
    const source = readFileSync(file, 'utf8');
    const named = [...source.matchAll(/^(export )?function (\w+)\([^]*?\{\n(.*)$/gm)];
    assert.ok(named.length > 0);
    for (const match of named) assert.match(match[3], /^\s*'worklet';/, `${match[2]} is not a worklet`);
  }
});

test('nothing loaded up front brings Skia with it', () => {
  // On the web Skia binds when its module is first evaluated, so one stray import blanks the screen.
  for (const file of ['components/sky/home-sky.tsx', 'components/sky/sky-island.tsx', 'components/sky/sea-life-layer.tsx', 'components/home/sky-ink.tsx', 'hooks/use-sea-life.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /@shopify\/react-native-skia/, `${file} imports Skia`);
    for (const line of source.split('\n')) if (/^import (?!type ).*sky-canvas'/.test(line)) assert.fail(`${file}: ${line}`);
  }
});
