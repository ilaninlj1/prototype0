import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampPan, labelCovered, labelLeft, MAP_PAD, onScreen, toCanvas, toMap, toScreen } from './map-geometry.ts';

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

test('a label that would overlap a more important one hides until zooming pulls them apart', () => {
  // In priority order, as screen positions with each label's text width.
  const labels = [
    { x: 100, y: 200, w: 120 },
    { x: 160, y: 205, w: 120 },
    { x: 100, y: 300, w: 120 },
  ];
  assert.deepEqual(
    labels.map((_, i) => labelCovered(i, labels)),
    [false, true, false]
  );
  assert.equal(labelCovered(1, [labels[0], { x: 260, y: 205, w: 120 }, labels[2]]), false, 'zoomed apart');
  assert.equal(labelCovered(1, [labels[0], { x: 160, y: 230, w: 120 }]), false, 'on the next line');
  const chain = [
    { x: 100, y: 200, w: 120 },
    { x: 200, y: 200, w: 120 },
    { x: 300, y: 200, w: 120 },
  ];
  assert.deepEqual(
    chain.map((_, i) => labelCovered(i, chain)),
    [false, true, false],
    'a hidden label hides nothing'
  );
});

test('panning stops at the edge', () => {
  assert.equal(clampPan(500, 2, W), W / 2);
  assert.equal(clampPan(-500, 2, W), -W / 2);
  assert.equal(clampPan(10, 1, W), 0);
});
