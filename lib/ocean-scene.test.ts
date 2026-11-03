import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allPlaces, DEPTHS, WATERS } from './ocean-map.ts';
import { dayMixAt, gradientAt, hexToRgb, seabedAt, surfaceWater, waterStops, wildRoster } from './ocean-scene.ts';

const hue = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const NOON = dayMixAt(13);

test('the day runs from noon to the middle of the night', () => {
  assert.equal(dayMixAt(13).night, 0);
  assert.equal(dayMixAt(1).night, 1);
  assert.equal(dayMixAt(23).night, 1);
  assert.equal(dayMixAt(13).warm, 0);
  assert.ok(dayMixAt(19).warm > 0.9);
  assert.ok(dayMixAt(6.5).warm > 0.9);
});

test("Sunny reef at noon is the mock's water", () => {
  const s = waterStops('reef', 'popular', NOON);
  assert.equal(s.top, '#8be8e6');
  assert.equal(s.mid, '#27b0cf');
  assert.equal(s.bot, '#0e76a8');
  assert.equal(s.ray, 0.55);
});

test('every level down is darker, and Buried has no sun', () => {
  const sum = (hex: string) => hexToRgb(hex).reduce((a, v) => a + v, 0);
  for (const w of WATERS) {
    const levels = DEPTHS.map((d) => waterStops(w, d, NOON));
    for (let i = 1; i < 4; i++) assert.ok(sum(levels[i].mid) < sum(levels[i - 1].mid), `${w} ${DEPTHS[i]}`);
    assert.equal(levels[3].ray, 0);
  }
});

test('no water at any hour is violet', () => {
  for (const hour of [1, 6.5, 13, 19]) {
    for (const p of allPlaces()) {
      const s = waterStops(p.water, p.depth, dayMixAt(hour));
      for (const c of [s.top, s.mid, s.bot]) {
        const h = hue(c);
        assert.ok(h === null || h < 250 || h > 330, `${p.water}/${p.depth} at ${hour}: ${c} is hue ${h}`);
      }
    }
  }
});

test('ink reads on the water: dark on the reef, light in the deep', () => {
  assert.equal(surfaceWater('reef', 'popular', NOON).ink, 'dark');
  assert.equal(surfaceWater('midnight', 'buried', NOON).ink, 'light');
});

test('the gradient meets its stops', () => {
  const stops = { top: hexToRgb('#000000'), mid: hexToRgb('#646464'), bot: hexToRgb('#ffffff') };
  assert.deepEqual(gradientAt(stops, 0), [0, 0, 0]);
  assert.deepEqual(gradientAt(stops, 0.45), [100, 100, 100]);
  assert.deepEqual(gradientAt(stops, 1), [255, 255, 255]);
  assert.deepEqual(gradientAt(stops, -3), [0, 0, 0]);
});

test('the seabed stays in the bottom quarter with no jumps across the screen', () => {
  for (let d = 0; d < 4; d++) {
    let last = seabedAt(d, 0);
    for (let x = 0.005; x <= 1; x += 0.005) {
      const y = seabedAt(d, x);
      assert.ok(y >= 0.09 && y <= 0.27, `depth ${d} at ${x}: ${y}`);
      assert.ok(Math.abs(y - last) < 0.012, `a jump at depth ${d}, x ${x}`);
      last = y;
    }
  }
});

test('every place has its wild life, the same each time, with at least 3 kinds of song to tap', () => {
  for (const p of allPlaces()) {
    const a = wildRoster(p);
    assert.deepEqual(a, wildRoster(p));
    assert.ok(a.length >= 6, `${p.water}/${p.depth}`);
    assert.ok(new Set(a.map((f) => f.species).filter(Boolean)).size >= 3, `${p.water}/${p.depth} kinds`);
    assert.ok(a.some((f) => f.look === 'crab' || f.look === 'starfish'));
    for (const f of a) {
      assert.ok(f.band >= 0 && f.band <= 1);
      assert.ok(f.x >= 0 && f.x <= 1);
    }
  }
});

test('a whale lives in Open blue, an angler in the deep', () => {
  assert.ok(wildRoster({ water: 'blue', depth: 'popular' }).some((f) => f.look === 'whale'));
  assert.ok(wildRoster({ water: 'reef', depth: 'gems' }).some((f) => f.look === 'angler'));
  assert.equal(wildRoster({ water: 'reef', depth: 'gems' }).find((f) => f.look === 'angler')?.species, null);
});
