import assert from 'node:assert/strict';
import { test } from 'node:test';

import { depthDragResult, nearestPlaceIndex, settleDive, showsAt, waterDragResult } from './ocean-dive.ts';

test('a slow drag finishes only past a fifth of the way', () => {
  assert.equal(settleDive(0.19, 0), 0);
  assert.equal(settleDive(0.21, 0), 1);
});

test('a flick wins over how far the drag went', () => {
  assert.equal(settleDive(0.05, -900), 1);
  assert.equal(settleDive(0.9, 900), 0);
});

test('a small upward velocity is not a flick', () => {
  assert.equal(settleDive(0.05, -100), 0);
});

test('dragging down rises one level, and from the top surfaces', () => {
  assert.deepEqual(depthDragResult(0, 1), { depth: 0, surface: true });
  assert.deepEqual(depthDragResult(2, 1), { depth: 1, surface: false });
});

test('dragging up sinks one level and stops at the floor', () => {
  assert.deepEqual(depthDragResult(0, -1), { depth: 1, surface: false });
  assert.deepEqual(depthDragResult(3, -1), { depth: 3, surface: false });
});

test('a drag that is too small stays put', () => {
  assert.deepEqual(depthDragResult(1, 0), { depth: 1, surface: false });
  assert.equal(waterDragResult(2, 0), 2);
});

test('waters stop at the edges', () => {
  assert.equal(waterDragResult(0, 1), 0); // dragging right goes toward the first water
  assert.equal(waterDragResult(3, -1), 3);
  assert.equal(waterDragResult(1, -1), 2);
  assert.equal(waterDragResult(1, 1), 0);
});

test('a fractional position settles on the nearest place, inside the grid', () => {
  assert.equal(nearestPlaceIndex(1.4), 1);
  assert.equal(nearestPlaceIndex(1.6), 2);
  assert.equal(nearestPlaceIndex(-0.4), 0);
  assert.equal(nearestPlaceIndex(3.7), 3);
});

test('the tab bar leaves early and the ocean buttons arrive late', () => {
  assert.equal(showsAt(0).tabBar, 1);
  assert.equal(showsAt(0).ui, 0);
  assert.equal(showsAt(0.5).tabBar, 0);
  assert.equal(showsAt(1).ui, 1);
  assert.equal(showsAt(1).tabBar, 0);
});

test('nothing from the ocean UI shows before the dive is nearly done', () => {
  assert.equal(showsAt(0.7).ui, 0);
  assert.ok(showsAt(0.9).ui > 0 && showsAt(0.9).ui < 1);
});
