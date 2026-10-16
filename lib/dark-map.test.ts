import assert from 'node:assert/strict';
import { test } from 'node:test';

import { brightness, genreUnderDark, glowRadius, GRID, heardIds, lightMap, litShare, newLights, refillSource } from './dark-map.ts';
import type { Strategy, SwipeEntry } from './discovery.ts';
import type { SoundFeatures } from './sound.ts';
import { MAP_MEASURES, type SoundMap } from './sound-map.ts';

const entry = (trackId: number, action: SwipeEntry['action'], listenMs?: number): SwipeEntry => ({
  trackId,
  artistId: 1,
  genre: 'Pop',
  action,
  timestamp: 0,
  listenMs,
});

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
  songs: { '1': [0.2, 0.2, 0, 0], '2': [0.22, 0.21, 0, 0], '3': [0.25, 0.18, 0, 0], '4': [0.8, 0.8, 1, 1], '5': [0.82, 0.79, 1, 1] },
};
const feats = (energy: number): SoundFeatures => ({
  tempo: 120,
  key: 0,
  mode: 1,
  energy,
  danceability: 0.5,
  acousticness: 0.5,
  instrumentalness: 0.5,
  speechiness: 0.1,
  liveness: 0.1,
  valence: 0.5,
  loudness: -8,
});

test('heard means a skip, like, reveal or genre jump; steering is not hearing', () => {
  const ids = heardIds([entry(1, 'skip'), entry(2, 'steer-sound'), entry(3, 'reveal'), entry(4, 'like'), entry(5, 'genre-jump')]);
  assert.deepEqual([...ids].sort(), [1, 3, 4, 5]);
});

test('brightness grows with the longest listen, full at 24 seconds; saves shine fully', () => {
  const b = brightness([entry(1, 'skip', 12_000), entry(1, 'reveal', 6_000), entry(2, 'skip', 1_000), entry(3, 'skip', 40_000), entry(4, 'skip')], [5]);
  assert.equal(b.get(1), 0.5);
  assert.equal(b.get(2), 0.25, 'a two-second skip still counts, dimly');
  assert.equal(b.get(3), 1);
  assert.equal(b.get(4), 0.5, 'no listen time recorded');
  assert.equal(b.get(5), 1, 'saved');
});

test('odd listen times are clamped', () => {
  const b = brightness([entry(1, 'skip', -500), entry(2, 'skip', Number.NaN), entry(3, 'skip', 10 ** 9)], []);
  assert.deepEqual([b.get(1), b.get(2), b.get(3)], [0.25, 0.25, 1]);
});

test('the glow grows with brightness', () => {
  assert.ok(Math.abs(glowRadius(1) - 0.035) < 1e-12);
  assert.ok(Math.abs(glowRadius(0.25) - 0.035 * 0.7) < 1e-12);
});

test('lit share counts grid cells that hold a map song and a heard one', () => {
  const cell = (c: number, r: number) => ({ x: (c + 0.5) / GRID.cols, y: (r + 0.5) / GRID.rows });
  const all = [cell(0, 0), cell(0, 0), cell(5, 5), cell(10, 10), cell(20, 30)];
  assert.equal(litShare(all, [cell(5, 5)]), 0.25);
  assert.equal(litShare(all, [cell(1, 1)]), 0, 'a heard song in an empty cell lights nothing');
  assert.equal(litShare([], []), 0);
  assert.equal(litShare([{ x: 1, y: 1 }], [{ x: 1, y: 1 }]), 1, 'the far edge is inside the grid');
});

test('new lights are the ones not lit last time, all of them the first time', () => {
  assert.deepEqual([...newLights([1, 2, 3], [])], [1, 2, 3]);
  assert.deepEqual([...newLights([1, 2, 3], [1, 3])], [2]);
});

test('a new listener sees a dark map: no lights, nothing lit, nothing to bloom', () => {
  const v = lightMap(MAP, [], [], [], () => null, () => []);
  assert.equal(v.lights.length, 0);
  assert.equal(v.litShare, 0);
  assert.equal(v.unmapped, 0);
  assert.equal(v.dots.length, 5);
  assert.deepEqual(v.regions.map((r) => r.heard), [0, 0]);
});

test('heard songs light their spot; off-map ones are placed by their neighbors or counted unmapped', () => {
  const neighbors = [{ x: 0.8, y: 0.8, region: 1, vector: [0, 0, 0, 0, 0, 0, 0, 0] }];
  const history = [entry(1, 'skip', 24_000), entry(99, 'skip', 24_000), entry(77, 'reveal', 6_000)];
  const v = lightMap(MAP, history, [2], [1], (id) => (id === 99 ? feats(0.5) : null), () => neighbors);
  assert.deepEqual(v.lights.map((l) => l.id).sort((a, b) => a - b), [1, 2, 99]);
  const placed = v.lights.find((l) => l.id === 99)!;
  assert.deepEqual([placed.x, placed.y], [0.8, 0.8]);
  assert.equal(v.unmapped, 1, 'song 77 has no sound data and the map has never heard of it');
  assert.equal(v.lights.find((l) => l.id === 2)!.saved, true);
  assert.deepEqual(v.lights.filter((l) => l.fresh).map((l) => l.id).sort((a, b) => a - b), [2, 99]);
  assert.equal(v.regions[0].region, 1, 'least heard region first');
  assert.equal(v.regions[1].heard, 2, 'region tallies count map songs only');
});

test('in the dark the map serves the songs, even over artist steering; otherwise as before', () => {
  assert.equal(refillSource('artist', true, false), 'map');
  assert.equal(refillSource('genre', true, true), 'map');
  assert.equal(refillSource('artist', false, true), 'artist');
  assert.equal(refillSource('genre', false, true), 'sorted');
  assert.equal(refillSource('genre', false, false), 'genre');
});

test("the genre kept underneath the dark: the current one, or the playing song's when steering by artist", () => {
  const jazz: Strategy = { type: 'genre', genre: 'Jazz' };
  const byArtist: Strategy = { type: 'artist', artistId: 1, artistName: 'X' };
  const genres = ['Pop', 'Rock', 'Jazz'];
  assert.equal(genreUnderDark(jazz, 'Pop', genres), jazz);
  assert.deepEqual(genreUnderDark(byArtist, 'Pop', genres), { type: 'genre', genre: 'Pop' });
  assert.deepEqual(genreUnderDark(byArtist, 'Alternative', genres, () => 0.5), { type: 'genre', genre: 'Rock' }, "an iTunes genre with no catalog isn't kept");
  assert.deepEqual(genreUnderDark(byArtist, null, genres, () => 0), { type: 'genre', genre: 'Pop' });
});
