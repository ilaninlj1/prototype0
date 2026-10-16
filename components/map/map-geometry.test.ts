import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampPan, labelLeft, MAP_PAD, onScreen, toCanvas, toMap, toScreen } from './map-geometry.ts';

const W = 360;
const H = 560;

test('a map point goes to the screen and back at any zoom and pan', () => {
  for (const [zoom, panX, panY] of [
    [1, 0, 0],
    [2.5, 40, -60],
    [4, -200, 300],
  ]) {
    const p = { x: 0.37, y: 0.81 };
    const s = toScreen(toCanvas(p, W, H), W, H, zoom, panX, panY);
    const back = toMap(s.x, s.y, W, H, zoom, panX, panY)!;
    assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  }
});

test('a tap outside the map is no point at all', () => {
  assert.equal(toMap(MAP_PAD / 2, 100, W, H, 1, 0, 0), null);
  assert.equal(toMap(100, H - 2, W, H, 1, 0, 0), null);
  assert.notEqual(toMap(W / 2, H / 2, W, H, 1, 0, 0), null);
});

test('a label stays on screen near the edges, and hides once its region slides off screen', () => {
  assert.equal(labelLeft(10, 220, W), 0, 'near the left edge');
  assert.equal(labelLeft(350, 220, W), W - 220, 'near the right edge');
  assert.equal(labelLeft(180, 220, W), 70, 'centered on its region');
  assert.equal(onScreen(-5, 100, W, H), false);
  assert.equal(onScreen(100, H + 1, W, H), false);
  assert.equal(onScreen(100, 100, W, H), true);
});

test('panning stops at the edge', () => {
  assert.equal(clampPan(500, 2, W), W / 2);
  assert.equal(clampPan(-500, 2, W), -W / 2);
  assert.equal(clampPan(10, 1, W), 0);
});
