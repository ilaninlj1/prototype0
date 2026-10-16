import assert from 'node:assert/strict';
import { test } from 'node:test';

import { kmeans, mergeSmall, nameRegions, normalizeLayout, seeded, standardizeColumns } from './sound-map-rules.ts';

test('the same seed gives the same numbers, all between 0 and 1', () => {
  const a = seeded(42);
  const b = seeded(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.ok([seeded(1)(), seeded(2)()].every((v) => v > 0 && v < 1));
});

test('standardizing fills a missing value with its column mean and turns columns into z-scores', () => {
  const { rows, mean, sd } = standardizeColumns([
    [1, 10],
    [3, Number.NaN],
    [5, 30],
  ]);
  assert.deepEqual(mean, [3, 20]);
  assert.ok(Math.abs(sd[0] - Math.sqrt(8 / 3)) < 1e-12);
  assert.equal(rows[1][1], 0, 'the missing value sits at the mean');
  assert.ok(Math.abs(rows[0][0] + rows[2][0]) < 1e-12);
});

test('a layout scales to 0–1 on both axes', () => {
  assert.deepEqual(
    normalizeLayout([
      [2, -1],
      [4, 3],
      [3, 1],
    ]),
    [
      [0, 0],
      [1, 1],
      [0.5, 0.5],
    ]
  );
});

test('k-means finds two clear clusters, the same way twice', () => {
  const pts: [number, number][] = [
    [0.1, 0.1],
    [0.12, 0.11],
    [0.09, 0.13],
    [0.9, 0.9],
    [0.88, 0.91],
    [0.91, 0.87],
  ];
  const one = kmeans(pts, 2, seeded(7));
  assert.deepEqual(one, kmeans(pts, 2, seeded(7)));
  assert.equal(new Set(one.assign.slice(0, 3)).size, 1);
  assert.equal(new Set(one.assign.slice(3)).size, 1);
  assert.notEqual(one.assign[0], one.assign[3]);
});

test('a region under the minimum joins its nearest neighbor; regions are numbered largest first', () => {
  const pts: [number, number][] = [
    [0.1, 0.1],
    [0.11, 0.1],
    [0.12, 0.1],
    [0.3, 0.1],
    [0.9, 0.9],
    [0.91, 0.9],
  ];
  const { centers, assign } = mergeSmall(pts, [0, 0, 0, 1, 2, 2], 2);
  assert.deepEqual(assign, [0, 0, 0, 0, 1, 1]);
  assert.equal(centers.length, 2);
  assert.ok(Math.abs(centers[0][0] - 0.1575) < 1e-9);
});

// Columns: energy, danceability, acousticness, instrumentalness, speechiness, valence, loudness, tempo.
test('a region is named by the two measures it differs on most, loudness skipped', () => {
  const names = nameRegions([
    [-0.2, 0.9, 0.1, 1.4, -0.3, 0.2, 0.1, 0],
    [1.5, 0.2, -0.3, -0.5, 0.1, 0.4, 2.5, 0.9],
  ]);
  assert.deepEqual(names, ['instrumental · groovy', 'loud · fast']);
});

test('two regions with the same two words get a third', () => {
  const names = nameRegions([
    [1.5, 0, 0.3, 0, 0, 0, 0, 0.9],
    [1.4, 0, 0, 0, -0.5, 0, 0, 0.8],
  ]);
  assert.deepEqual(names, ['loud · fast · acoustic', 'loud · fast · melodic']);
});
