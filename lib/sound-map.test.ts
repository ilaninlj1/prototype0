import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAP_MEASURES, mapPointOf, measureVector, pickNear, placeByNeighbors, regionAt, songsWithin, standardize, type SoundMap } from './sound-map.ts';

// Two regions, five songs in two genres.
const MAP: SoundMap = {
  v: 1,
  builtAt: '2026-10-16',
  settings: { neighbors: 15, minDist: 0.02, seed: 42, regions: 2 },
  measures: [...MAP_MEASURES],
  mean: [0.5, 0.5, 0.5, 0.5, 0.1, 0.5, -8, 120],
  sd: [0.2, 0.2, 0.3, 0.3, 0.1, 0.2, 4, 30],
  genres: ['Pop', 'Jazz'],
  regions: [
    { x: 0.2, y: 0.2, words: 'loud · bright', songs: 3 },
    { x: 0.8, y: 0.8, words: 'instrumental · calm', songs: 2 },
  ],
  songs: {
    '1': [0.2, 0.2, 0, 0],
    '2': [0.22, 0.21, 0, 0],
    '3': [0.25, 0.18, 0, 0],
    '4': [0.8, 0.8, 1, 1],
    '5': [0.82, 0.79, 1, 1],
  },
};
const keepOrder = () => 0.9999; // Fisher–Yates with this swaps nothing

test("a song's measures as a vector, in MAP_MEASURES order, NaN where missing", () => {
  const f = { energy: 0.9, danceability: 0.4, acousticness: 0.1, instrumentalness: 0, speechiness: 0.05, valence: 0.7, loudness: -5, tempo: 128 };
  assert.deepEqual(measureVector(f), [0.9, 0.4, 0.1, 0, 0.05, 0.7, -5, 128]);
  assert.ok(Number.isNaN(measureVector({ energy: 0.9 })[1]));
});

test("standardizing uses the map's means and spreads; a missing measure sits at the mean", () => {
  const z = standardize(MAP, [0.7, Number.NaN, 0.5, 0.5, 0.1, 0.5, -4, 150]);
  assert.deepEqual(z.map((v) => Math.round(v * 100) / 100), [1, 0, 0, 0, 0, 0, 1, 1]);
});

test('a song off the map lands among its nearest neighbors by sound, in their region', () => {
  const near = (x: number, y: number, region: number, vector: number[]) => ({ x, y, region, vector });
  const neighbors = [near(0.2, 0.2, 0, [1, 1]), near(0.3, 0.2, 0, [1.1, 0.9]), near(0.8, 0.8, 1, [-1, -1])];
  const placed = placeByNeighbors([1, 1], neighbors, 2)!;
  assert.ok(Math.abs(placed.x - 0.25) < 1e-9 && Math.abs(placed.y - 0.2) < 1e-9);
  assert.equal(placed.region, 0);
  assert.equal(placeByNeighbors([1, 1], [], 5), null);
});

test("songs within a ring, and the ring's region", () => {
  assert.deepEqual(songsWithin(MAP, { x: 0.21, y: 0.2 }, 0.05).sort(), [1, 2, 3]);
  assert.deepEqual(songsWithin(MAP, { x: 0.5, y: 0.5 }, 0.08), [], 'open sea');
  assert.equal(regionAt(MAP, { x: 0.81, y: 0.8 }, 0.08), 1);
  assert.equal(regionAt(MAP, { x: 0.45, y: 0.4 }, 0.08), 0, 'an empty ring takes the nearest region center');
});

const resolveAll = (artistOf: Record<number, string> = {}) => (id: number, genre: string) => ({ artist: artistOf[id] ?? `artist ${id}`, track: { id, genre } });

test('picking near a spot: the nearest unheard songs first, with their genre', () => {
  const picked = pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set([1]), resolveAll(), () => true, keepOrder);
  assert.deepEqual(picked, [{ id: 2, genre: 'Pop' }, { id: 3, genre: 'Pop' }]);
});

test('picking near a spot: one song per artist, filtered artists and unresolvable songs left out', () => {
  const sameArtist = pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set([1]), resolveAll({ 2: 'X', 3: 'X' }), () => true, keepOrder);
  assert.deepEqual(sameArtist.map((t) => t.id), [2, 4]);
  const filtered = pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set([1]), resolveAll(), (a) => a !== 'artist 2', keepOrder);
  assert.deepEqual(filtered.map((t) => t.id), [3, 4]);
  const missing = pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set([1]), (id, genre) => (id === 3 ? null : resolveAll()(id, genre)), () => true, keepOrder);
  assert.deepEqual(missing.map((t) => t.id), [2, 4]);
  assert.equal(pickNear(MAP, { x: 0.8, y: 0.8 }, 3, new Set([4, 5]), resolveAll(), () => true, keepOrder)[0].genre, 'Pop', 'it widens to the next region');
});

test('a spot that has run dry gives nothing', () => {
  assert.deepEqual(pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set([1, 2, 3, 4, 5]), resolveAll(), () => true), []);
  assert.deepEqual(pickNear(MAP, { x: 0.2, y: 0.2 }, 2, new Set(), resolveAll(), () => false), [], 'every artist filtered');
});

test("a song's spot on the map, or none when it isn't on it", () => {
  assert.deepEqual(mapPointOf(MAP, 4), { x: 0.8, y: 0.8 });
  assert.equal(mapPointOf(MAP, 99), null);
});
