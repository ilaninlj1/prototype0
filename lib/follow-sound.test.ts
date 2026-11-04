import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DeckCandidate } from './decks.ts';
import type { DiscoveryTrack } from './discovery.ts';
import { DIRECTIONS, directionsOpen, followEndLine, followLabel, followStep, pickFollow, type FollowFrom } from './follow-sound.ts';
import type { Depth } from './ocean-map.ts';
import type { SoundFeatures } from './sound.ts';

const sound = (over: Partial<SoundFeatures> = {}): SoundFeatures => ({
  tempo: 120,
  key: 0,
  mode: 1,
  energy: 0.5,
  danceability: 0.5,
  acousticness: 0.3,
  instrumentalness: 0,
  speechiness: 0.05,
  liveness: 0.1,
  valence: 0.5,
  loudness: -8,
  ...over,
});

const cand = (id: number, artist: string, s: Partial<SoundFeatures>, depth: Depth = 'popular'): DeckCandidate => ({
  track: { id } as DiscoveryTrack,
  artist,
  sound: sound(s),
  depth,
});

const from: FollowFrom = { trackId: 1, label: 'Start', artist: 'me', sound: sound(), depth: 'popular' };
const ids = (t: DiscoveryTrack[]) => t.map((x) => x.id);

test('calmer and harder move energy, the right way, and leave valence out of it', () => {
  const pool = [cand(2, 'a', { energy: 0.35 }), cand(3, 'b', { energy: 0.65 }), cand(4, 'c', { energy: 0.5, valence: 0.9 })];
  assert.deepEqual(ids(pickFollow(pool, 'calmer', from, 5)), [2]);
  assert.deepEqual(ids(pickFollow(pool, 'harder', from, 5)), [3]);
});

test('brighter and darker move valence', () => {
  const pool = [cand(2, 'a', { valence: 0.7 }), cand(3, 'b', { valence: 0.3 }), cand(4, 'c', { energy: 0.7 })];
  assert.deepEqual(ids(pickFollow(pool, 'brighter', from, 5)), [2]);
  assert.deepEqual(ids(pickFollow(pool, 'darker', from, 5)), [3]);
});

test('a direction is a step, not a leap: too far away does not count', () => {
  assert.deepEqual(pickFollow([cand(2, 'a', { energy: 1 })], 'harder', from, 5), []);
  assert.deepEqual(pickFollow([cand(2, 'a', { valence: 0 })], 'darker', from, 5), []);
});

test('a tiny change is not a step either', () => {
  assert.deepEqual(pickFollow([cand(2, 'a', { energy: 0.53 })], 'harder', from, 5), []);
});

test('deeper goes exactly one depth down, and nothing is below Buried', () => {
  const pool = [cand(2, 'a', {}, 'popular'), cand(3, 'b', {}, 'deepcuts'), cand(4, 'c', {}, 'gems'), cand(5, 'd', {}, 'buried')];
  assert.deepEqual(ids(pickFollow(pool, 'deeper', from, 5)), [3]);
  assert.deepEqual(pickFollow(pool, 'deeper', { ...from, depth: 'buried' }, 5), []);
});

test('among the songs that moved, the closest in every other way comes first', () => {
  const pool = [cand(2, 'a', { energy: 0.65, tempo: 170, acousticness: 0.9 }), cand(3, 'b', { energy: 0.65 })];
  assert.deepEqual(ids(pickFollow(pool, 'harder', from, 5)), [3, 2]);
});

test('harder keeps the mood: of two songs that moved the same, the one that stayed as happy wins', () => {
  const pool = [cand(2, 'a', { energy: 0.65, valence: 0.95 }), cand(3, 'b', { energy: 0.65, valence: 0.5 })];
  assert.deepEqual(ids(pickFollow(pool, 'harder', from, 5)), [3, 2]);
});

test('never the same artist again, and one song per artist', () => {
  const pool = [cand(2, 'me', { energy: 0.65 }), cand(3, 'a', { energy: 0.65 }), cand(4, 'a', { energy: 0.66 })];
  assert.deepEqual(ids(pickFollow(pool, 'harder', from, 5)), [3]);
});

test('directionsOpen says which words have anywhere to go', () => {
  const pool = [cand(2, 'a', { energy: 0.65 })];
  assert.deepEqual(directionsOpen(pool, from), ['harder']);
  assert.deepEqual(directionsOpen([], from), []);
  assert.deepEqual([...DIRECTIONS], ['calmer', 'harder', 'brighter', 'darker', 'deeper']);
});

test('a step records how far it moved, for the trail', () => {
  assert.equal(followStep('harder', sound(), sound({ energy: 0.7 })).toFixed(2), '0.20');
  assert.equal(followStep('calmer', sound(), sound({ energy: 0.3 })).toFixed(2), '0.20');
  assert.equal(followStep('darker', sound(), sound({ valence: 0.2 })).toFixed(2), '0.30');
});

test('the status line reads as a sentence', () => {
  assert.equal(followLabel('harder', 'Creep'), 'Harder than “Creep”');
});

test('it says so plainly when the way you were heading has run out', () => {
  assert.equal(followEndLine(null, ['harder']), null);
  assert.equal(followEndLine('harder', ['harder', 'calmer']), null);
  assert.equal(followEndLine('harder', ['calmer']), 'Nothing harder from here');
  assert.equal(followEndLine('deeper', []), 'Nothing deeper from here');
});
