import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anatomyOf } from './ocean-anatomy.ts';
import { castFor, MAX_ANIMATED } from './ocean-cast.ts';
import { placeKey, allPlaces, type Kind, type Place } from './ocean-map.ts';
import type { Creature, OceanLife } from './ocean-person.ts';
import type { SoundFeatures } from './sound.ts';

const here: Place = { water: 'reef', depth: 'popular' };
const sound: SoundFeatures = { tempo: 110, key: 2, mode: 1, energy: 0.6, danceability: 0.5, acousticness: 0.2, instrumentalness: 0, speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -8 };

function creature(i: number, over: Partial<Creature> = {}): Creature {
  return {
    trackId: i, artist: `a${i}`, kind: 'clown' as Kind, place: here, color: '#e8a33d', accent: '#3d8fe8', heard: 1, hurried: false, size: 1, vivid: 1,
    likedAt: 1_000_000 - i, foundHour: 13, rare: false, first: false, school: null, seed: i * 17 + 3, anatomy: anatomyOf(null), sound: null,
    foundRow: 0, climb: 0, foundListeners: null, nowListeners: null, ...over,
  };
}
function lifeWith(creatures: Creature[]): OceanLife {
  const places = Object.fromEntries(allPlaces().map((p) => [placeKey(p), { place: p, creatures: [], coral: [], sand: { rise: 0, specks: [] }, heard: 0 }])) as OceanLife['places'];
  places[placeKey(here)].creatures = creatures;
  places[placeKey(here)].heard = creatures.length;
  return { places, total: creatures.length, heardTotal: creatures.length, oldest: null };
}

test('nothing lives in an ocean with none of your songs', () => {
  assert.deepEqual(castFor(here, null, 13), { members: [], hiddenCount: 0 });
  assert.deepEqual(castFor(here, lifeWith([]), 13).members, []);
});

test('never more than the cap move at once, newest first, and the rest are counted', () => {
  const { members, hiddenCount } = castFor(here, lifeWith(Array.from({ length: 63 }, (_, i) => creature(i))), 13);
  assert.equal(members.length, MAX_ANIMATED);
  assert.equal(members[0].creature.trackId, 0);
  assert.equal(hiddenCount, 33);
});

test('the same input gives the same stage', () => {
  const life = lifeWith([creature(1), creature(2)]);
  assert.deepEqual(castFor(here, life, 13), castFor(here, life, 13));
});

test('awake follows the hour', () => {
  const life = lifeWith([creature(1, { foundHour: 2 })]);
  assert.equal(castFor(here, life, 13).members[0].awake, false);
  assert.equal(castFor(here, life, 2).members[0].awake, true);
});

test('sleepers are numbered so they spread out', () => {
  const life = lifeWith([creature(1, { foundHour: 2 }), creature(2), creature(3, { foundHour: 2 })]);
  const m = castFor(here, life, 13).members;
  assert.deepEqual([m[0].restI, m[0].restN, m[2].restI, m[2].restN], [0, 2, 1, 2]);
});

test('saves by one artist swim together, in order', () => {
  const m = castFor(here, lifeWith([creature(1, { school: 'x' }), creature(2), creature(3, { school: 'x' }), creature(4, { school: 'x' })]), 13).members;
  assert.deepEqual([m[0].leader, m[2].leader, m[3].leader], [-1, 0, 0]);
  assert.deepEqual([m[2].schoolIndex, m[3].schoolIndex], [1, 2]);
  assert.equal(m[1].leader, -1);
});

test('songs that sound alike pair up, two by two; a very different song stays alone', () => {
  const far = { ...sound, energy: 0.05, acousticness: 0.95, tempo: 60, valence: 0.05, danceability: 0.05 };
  const m = castFor(here, lifeWith([creature(1, { sound }), creature(2, { sound: { ...sound, energy: 0.61 } }), creature(3, { sound: { ...sound, energy: 0.62 } }), creature(4, { sound: far })]), 13).members;
  assert.equal(m[1].leader, 0);
  assert.equal(m[1].soundAlike, true);
  assert.equal(m[2].leader, -1, 'the pair is full');
  assert.equal(m[3].leader, -1);
});

test('a sleeping creature follows nobody', () => {
  const m = castFor(here, lifeWith([creature(1, { school: 'x' }), creature(2, { school: 'x', foundHour: 2 })]), 13).members;
  assert.equal(m[1].awake, false);
  assert.equal(m[1].leader, -1);
});

test('a faster song has a quicker creature, within limits', () => {
  const m = castFor(here, lifeWith([creature(1, { sound: { ...sound, tempo: 170 } }), creature(2, { sound: { ...sound, tempo: 60 } })]), 13).members;
  assert.ok(m[0].pace > m[1].pace);
  assert.ok(m[0].pace <= 1.4 && m[1].pace >= 0.7);
});

test('on the reef a clownfish stays near an anemone; elsewhere and other kinds roam', () => {
  const clown = castFor(here, lifeWith([creature(1, { kind: 'clown' })]), 13).members[0];
  assert.ok(clown.reach < 0.5);
  const darter = castFor(here, lifeWith([creature(1, { kind: 'darter' })]), 13).members[0];
  assert.equal(darter.reach, 1);
});

test('a fish partway up a level swims nearer its top', () => {
  const still = castFor(here, lifeWith([creature(1, { kind: 'darter' })]), 13).members[0];
  const up = castFor(here, lifeWith([creature(1, { kind: 'darter', climb: 0.5 })]), 13).members[0];
  assert.ok(up.band < still.band);
});

test('homes spread over the water: no two start on top of each other, and a new find moves nobody else', () => {
  const list = Array.from({ length: 20 }, (_, i) => creature(i, { kind: 'darter' }));
  const m = castFor(here, lifeWith(list), 13).members;
  let closest = Infinity;
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) closest = Math.min(closest, Math.hypot(m[i].x - m[j].x, m[i].band - m[j].band));
  assert.ok(closest > 0.08, `closest ${closest}`);
  const withNew = castFor(here, lifeWith([creature(99, { kind: 'darter' }), ...list]), 13).members;
  assert.deepEqual([withNew[1].x, withNew[1].band], [m[0].x, m[0].band]);
});

test('each song keeps its own depth in the picture', () => {
  const a = castFor(here, lifeWith([creature(1)]), 13).members[0].z;
  assert.ok([0, 1, 2].includes(a));
  assert.equal(castFor(here, lifeWith([creature(1), creature(2)]), 13).members[0].z, a);
});
