import assert from 'node:assert/strict';
import { test } from 'node:test';

import { castFor, MAX_ANIMATED } from './ocean-cast.ts';
import { placeKey, allPlaces, type Kind, type Place } from './ocean-map.ts';
import type { Creature, OceanLife } from './ocean-person.ts';

const here: Place = { water: 'reef', depth: 'popular' };

function creature(i: number, over: Partial<Creature> = {}): Creature {
  return {
    trackId: i, artist: `a${i}`, kind: 'clown' as Kind, place: here, color: '#e8a33d', heard: 1, hurried: false, size: 1, vivid: 1,
    likedAt: 1_000_000 - i, foundHour: 13, rare: false, first: false, school: null, seed: i * 17 + 3, ...over,
  };
}
function lifeWith(creatures: Creature[]): OceanLife {
  const places = Object.fromEntries(allPlaces().map((p) => [placeKey(p), { place: p, creatures: [], coral: [], sand: { rise: 0, specks: [] }, heard: 0 }])) as OceanLife['places'];
  places[placeKey(here)].creatures = creatures;
  places[placeKey(here)].heard = creatures.length;
  return { places, total: creatures.length, heardTotal: creatures.length, oldest: null };
}
const mine = (m: { creature: Creature | null }) => !!m.creature;

test('an empty ocean is full of wild life', () => {
  const { members, hiddenCount } = castFor(here, null, 13);
  assert.ok(members.length >= 6);
  assert.ok(members.every((m) => m.wild && !m.creature));
  assert.equal(hiddenCount, 0);
});

test('wild ones thin out as your songs move in', () => {
  const count = (n: number) => castFor(here, lifeWith(Array.from({ length: n }, (_, i) => creature(i))), 13).members.filter((m) => !mine(m)).length;
  assert.ok(count(0) > count(10));
  assert.ok(count(10) > count(25));
  assert.ok(count(25) >= 2, 'crabs and the odd fish stay');
});

test('never more than the cap move at once, newest first, and the rest are counted', () => {
  const list = Array.from({ length: 63 }, (_, i) => creature(i));
  const { members, hiddenCount } = castFor(here, lifeWith(list), 13);
  assert.ok(members.length <= MAX_ANIMATED);
  const shown = members.filter(mine).map((m) => m.creature!.trackId);
  assert.equal(shown[0], 0);
  assert.equal(shown.length + hiddenCount, 63);
});

test('the same input gives the same stage', () => {
  const life = lifeWith([creature(1), creature(2)]);
  assert.deepEqual(castFor(here, life, 13), castFor(here, life, 13));
});

test('awake follows the hour', () => {
  const life = lifeWith([creature(1, { foundHour: 2 })]);
  assert.equal(castFor(here, life, 13).members.find(mine)!.awake, false);
  assert.equal(castFor(here, life, 2).members.find(mine)!.awake, true);
});

test('wild ones come back when most of yours are asleep', () => {
  const asleep = Array.from({ length: 25 }, (_, i) => creature(i, { foundHour: 2 }));
  const { members } = castFor(here, lifeWith(asleep), 13);
  const awake = members.filter((m) => m.awake).length;
  assert.ok(awake / members.length >= 1 / 3 - 0.08, `${awake} of ${members.length}`);
});

test('saves by one artist share a school, in order', () => {
  const list = [creature(1, { school: 'x' }), creature(2), creature(3, { school: 'x' }), creature(4, { school: 'y' })];
  const cast = castFor(here, lifeWith(list), 13).members.filter(mine);
  const of = (id: number) => cast.find((m) => m.creature!.trackId === id)!;
  assert.equal(of(1).school, of(3).school);
  assert.notEqual(of(1).school, of(4).school);
  assert.deepEqual([of(1).schoolIndex, of(3).schoolIndex], [0, 1]);
  assert.equal(of(2).school, 0);
});

test('a quick kind of song swims quicker than a slow one', () => {
  const list = [creature(1, { kind: 'darter' }), creature(2, { kind: 'turtle' })];
  const cast = castFor(here, lifeWith(list), 13).members.filter(mine);
  assert.ok(Math.abs(cast[0].speed) > Math.abs(cast[1].speed) * 1.5);
});
