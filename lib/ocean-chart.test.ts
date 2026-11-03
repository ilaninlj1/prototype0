import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anatomyOf } from './ocean-anatomy.ts';
import { chartDots, chartLine, hitDot, listeningPath, placeAtChart } from './ocean-chart.ts';
import type { SwipeEntry } from './discovery.ts';
import { allPlaces, placeKey, type Kind, type Place } from './ocean-map.ts';
import type { Creature, OceanLife } from './ocean-person.ts';

const W = 320;
const H = 480;

function creature(i: number, over: Partial<Creature> = {}): Creature {
  const place: Place = over.place ?? { water: 'kelp', depth: 'buried' };
  return {
    trackId: i, artist: `a${i}`, kind: 'clown' as Kind, place, color: '#e8a33d', accent: '#3d8fe8', heard: 1, hurried: false, size: 1, vivid: 1,
    likedAt: 1000, foundHour: 13, rare: false, first: false, school: null, seed: i * 17 + 3, anatomy: anatomyOf(null), sound: null,
    foundRow: 3, climb: 0, foundListeners: null, nowListeners: null, ...over,
  };
}
function lifeWith(creatures: Creature[]): OceanLife {
  const places = Object.fromEntries(allPlaces().map((p) => [placeKey(p), { place: p, creatures: [], coral: [], sand: { rise: 0, specks: [] }, heard: 0 }])) as OceanLife['places'];
  for (const c of creatures) places[placeKey(c.place)].creatures.push(c);
  return { places, total: creatures.length, heardTotal: creatures.length, oldest: null };
}
const entry = (timestamp: number, over: Partial<SwipeEntry> = {}): SwipeEntry => ({ trackId: timestamp, artistId: 1, genre: 'x', action: 'skip', timestamp, ...over });

test('no ocean, no dots', () => {
  assert.deepEqual(chartDots(null, W, H), []);
  assert.deepEqual(chartDots(lifeWith([]), W, H), []);
});

test('a fish sits in the column of its water and the row of its depth', () => {
  const [d] = chartDots(lifeWith([creature(1)]), W, H);
  assert.ok(d.x > W / 4 && d.x < W / 2, `x ${d.x}`);
  assert.ok(d.y > (H * 3) / 4 && d.y < H, `y ${d.y}`);
});

test('a fish that hasn’t moved has no trail; one that climbed sits above where you found it, in the same column', () => {
  const [still] = chartDots(lifeWith([creature(1)]), W, H);
  assert.equal(still.y, still.fromY);
  const [moved] = chartDots(lifeWith([creature(1, { climb: 1.5, place: { water: 'kelp', depth: 'gems' } })]), W, H);
  assert.equal(moved.x, moved.fromX);
  assert.ok(moved.fromY - moved.y > (H / 4) * 1.4);
});

test('a fish never leaves the top of the graph', () => {
  const [d] = chartDots(lifeWith([creature(1, { climb: 9, foundRow: 1, place: { water: 'reef', depth: 'popular' } })]), W, H);
  assert.ok(d.y > 0);
});

test('bigger creatures are bigger dots', () => {
  const [small, big] = chartDots(lifeWith([creature(1, { size: 0.7 }), creature(2, { size: 1.8 })]), W, H);
  assert.ok(big.r > small.r);
});

test('your path goes oldest to newest and follows where you listened', () => {
  const reef: Place = { water: 'reef', depth: 'popular' };
  const deep: Place = { water: 'midnight', depth: 'buried' };
  const day = 86_400_000;
  const history = [entry(0, { trackId: 1 }), entry(day * 30, { trackId: 2 })];
  const path = listeningPath(history, (e) => (e.trackId === 1 ? reef : deep));
  assert.equal(path.length, 2);
  assert.ok(path[0].x < path[1].x && path[0].y < path[1].y);
  assert.ok(path[0].at < path[1].at);
  assert.equal(path[0].x, 0.125);
  assert.equal(path[1].y, 0.875);
});

test('one evening still draws a line, and a long history stays a readable number of points', () => {
  const reef: Place = { water: 'reef', depth: 'popular' };
  const evening = Array.from({ length: 60 }, (_, i) => entry(i * 3 * 60_000));
  assert.ok(listeningPath(evening, () => reef).length >= 5);
  const years = Array.from({ length: 5000 }, (_, i) => entry(i * 3_600_000));
  assert.ok(listeningPath(years, () => reef).length <= 15);
});

test('steering, Run and songs with no place stay off your path', () => {
  const reef: Place = { water: 'reef', depth: 'popular' };
  assert.deepEqual(listeningPath([], () => reef), []);
  assert.deepEqual(listeningPath([entry(1, { action: 'steer-sound' })], () => reef), []);
  assert.deepEqual(listeningPath([entry(1, { source: 'run' })], () => reef), []);
  assert.deepEqual(listeningPath([entry(1)], () => null), []);
});

test('a tap finds the nearest fish in reach', () => {
  const dots = chartDots(lifeWith([creature(1), creature(2, { place: { water: 'reef', depth: 'popular' }, foundRow: 0 })]), W, H);
  assert.equal(hitDot(dots, dots[0].x + 3, dots[0].y)?.creature, dots[0].creature);
  assert.equal(hitDot(dots, -100, -100), null);
});

test('a point on the graph is in one place', () => {
  assert.deepEqual(placeAtChart(10, 10, W, H), { water: 'reef', depth: 'popular' });
  assert.deepEqual(placeAtChart(W - 1, H - 1, W, H), { water: 'midnight', depth: 'buried' });
  assert.deepEqual(placeAtChart(W + 50, -5, W, H), { water: 'midnight', depth: 'popular' });
});

test('the line under the graph says what moved', () => {
  assert.match(chartLine([]), /Nothing lives here/);
  assert.match(chartLine(chartDots(lifeWith([creature(1)]), W, H)), /1 song so far/);
  assert.match(chartLine(chartDots(lifeWith([creature(1, { climb: 1 }), creature(2)]), W, H)), /1 of your 2 songs have climbed/);
});
