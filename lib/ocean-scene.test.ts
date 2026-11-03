import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allPlaces, DEPTHS, WATERS } from './ocean-map.ts';
import { TOWERS, anemoneSpots, dayMixAt, floorAt, floorLift, gradientAt, hexToRgb, seabedAt, surfaceWater, towerRadius, waterStops } from './ocean-scene.ts';

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

test('the sea floor is one unbroken shape: it repeats across biomes with no jumps', () => {
  for (let x = 0; x <= 3; x += 0.005) {
    const y = seabedAt(x);
    assert.ok(y >= 0.04 && y <= 0.25, `${x}: ${y}`);
    assert.ok(Math.abs(y - seabedAt(x + 0.005)) < 0.006, `a jump at ${x}`);
    assert.ok(Math.abs(y - seabedAt(x + 1)) < 1e-6, 'it repeats each screen');
  }
});

test('the floor runs like a coast: shallow at the reef, a trench at Midnight, with no steps between', () => {
  assert.ok(floorAt(0, 0.3) > floorAt(1, 0.3));
  assert.ok(floorAt(1, 0.3) > floorAt(2, 0.3));
  assert.ok(floorAt(2, 0.3) > floorAt(3, 0.3));
  for (let c = 0; c < 3; c += 0.01) assert.ok(Math.abs(floorLift(c) - floorLift(c + 0.01)) < 0.002);
  for (let x = 0; x < 1; x += 0.01) assert.ok(floorAt(3, x) >= 0.03, 'never under the screen');
  assert.ok(floorAt(0, 0.25) < 0.52, 'the shallowest floor still leaves most of the screen for water');
});

test('reef towers grow from below: nothing above their tips, wider going down, no jumps', () => {
  for (let i = 0; i < TOWERS.length; i++) {
    assert.equal(towerRadius(i, TOWERS[i].tip - 0.1), 0);
    assert.ok(towerRadius(i, 3.8) > towerRadius(i, TOWERS[i].tip + 0.1));
    for (let d = TOWERS[i].tip + 0.05; d < 4; d += 0.002) assert.ok(Math.abs(towerRadius(i, d) - towerRadius(i, d + 0.002)) < 0.003);
  }
});

test('anemones sit on the towers, inside the screen, and shallow levels have them too', () => {
  for (let row = 0; row < 4; row++) {
    const spots = anemoneSpots(row);
    assert.ok(spots.length >= 1, `row ${row}`);
    for (const s of spots) assert.ok(s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1);
  }
});
