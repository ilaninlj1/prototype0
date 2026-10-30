import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bottle, Hop } from './bottle-rows.ts';
import { ARC_STEPS, HOP_MS, REST_MS, facing, hopPoints, pickArc, pulseAt, seaArcs, seaCountLine, shows, toVec, turn } from './sea-globe.ts';

const hop = (city: string, lat: number, lng: number, kind: Hop['kind'] = 'keep'): Hop => ({
  kind, city, country: 'X', lat, lng, exact: true, tier: null, ring: null, at: '2026-10-29T12:00:00Z',
});
const bottle = (id: string, hops: Hop[], changedAt = '2026-10-29T12:00:00Z', keeps = hops.length - 1): Bottle => ({
  id, trackId: 1, artistKey: 'a', genreTag: 'Pop', keeps, passes: 0, state: 'floating', lastMovedAt: changedAt, changedAt, hops,
});
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('turning a place to face you puts it in the middle of the globe', () => {
  for (const [lat, lng] of [[32.8, -96.8], [-33.9, 151.2], [64, -21], [0, 0]]) {
    const s = facing(lat, lng);
    const t = turn(toVec(lat, lng), s.yaw, s.pitch);
    assert.ok(close(t[0], 0) && close(t[1], 0) && close(t[2], 1), `${lat},${lng}`);
  }
});

test('the far side of the globe is hidden, but an arch lifted past the edge still shows', () => {
  const s = facing(0, 0);
  assert.equal(shows(turn(toVec(0, 180), s.yaw, s.pitch)), false);
  assert.equal(shows(turn(toVec(0, 10), s.yaw, s.pitch)), true);
  const lifted = turn([1.1, 0, -1.2], 0, 0);
  assert.equal(shows(lifted), true);
});

test('a hop arches between its two places, higher for a longer trip', () => {
  const dallas = toVec(32.8, -96.8);
  const austin = toVec(30.3, -97.7);
  const lisbon = toVec(38.7, -9.1);
  const short = hopPoints(dallas, austin, 0);
  const long = hopPoints(dallas, lisbon, 0);
  assert.equal(long.length, ARC_STEPS + 1);
  assert.deepEqual(long[0].map((v) => +v.toFixed(9)), dallas.map((v) => +v.toFixed(9)));
  const peak = (pts: number[][]) => Math.max(...pts.map((p) => Math.hypot(p[0], p[1], p[2])));
  assert.ok(peak(long) > peak(short));
  assert.ok(Math.abs(Math.hypot(...long[ARC_STEPS]) - 1) < 1e-9, 'it lands on the surface');
});

test('two stops in the same city make a small petal, and repeats fan out instead of overlapping', () => {
  const dallas = toVec(32.8, -96.8);
  const a = hopPoints(dallas, dallas, 0.4);
  const b = hopPoints(dallas, dallas, 1.7);
  const mid = ARC_STEPS / 2;
  const away = Math.acos(Math.min(1, a[mid].reduce((s, v, i) => s + (v / Math.hypot(...a[mid])) * dallas[i], 0)));
  assert.ok(away > 0.03 && away < 0.15, 'a few degrees out and back');
  assert.ok(Math.hypot(a[mid][0] - b[mid][0], a[mid][1] - b[mid][1], a[mid][2] - b[mid][2]) > 0.02);
});

test('the sea shows the most recently changed bottles, one arc per hop', () => {
  const old = bottle('b-old', [hop('Dallas', 32.8, -96.8, 'launch'), hop('Lisbon', 38.7, -9.1)], '2026-10-20T00:00:00Z');
  const fresh = bottle('b-new', [hop('Dallas', 32.8, -96.8, 'launch'), hop('Austin', 30.3, -97.7), hop('Lagos', 6.5, 3.4)], '2026-10-29T00:00:00Z');
  const arcs = seaArcs([old, fresh, bottle('b-empty', [])]);
  assert.deepEqual(arcs.map((a) => a.bottleId), ['b-new', 'b-old']);
  assert.equal(arcs[0].segments.length, 2);
  assert.equal(seaArcs([old, fresh], 1).length, 1);
});

test('a pulse runs hop by hop in order, then rests before starting over', () => {
  assert.deepEqual(pulseAt(2, 0, 0), { hop: 0, along: 0 });
  assert.deepEqual(pulseAt(2, HOP_MS * 1.5, 0), { hop: 1, along: 0.5 });
  assert.equal(pulseAt(2, HOP_MS * 2 + 10, 0), null);
  assert.deepEqual(pulseAt(2, HOP_MS * 2 + REST_MS, 0), { hop: 0, along: 0 });
  assert.equal(pulseAt(0, 500, 0), null);
});

test('a tap picks the bottle whose arc is under the finger, and nothing on empty sea', () => {
  const arcs = seaArcs([
    bottle('dallas-lisbon', [hop('Dallas', 32.8, -96.8, 'launch'), hop('Lisbon', 38.7, -9.1)]),
    bottle('tokyo-seoul', [hop('Tokyo', 35.7, 139.7, 'launch'), hop('Seoul', 37.6, 127)], '2026-10-28T00:00:00Z'),
  ]);
  const spin = facing(32.8, -96.8);
  const globe = { cx: 200, cy: 300, r: 150 };
  assert.equal(pickArc({ x: 200, y: 300 }, arcs, spin, globe), 0, 'Dallas is in the middle');
  assert.equal(pickArc({ x: 20, y: 40 }, arcs, spin, globe), null);
  const tokyo = facing(35.7, 139.7);
  assert.equal(pickArc({ x: 200, y: 300 }, arcs, tokyo, globe), 1);
});

test('the count line says bottles, cities and keeps in plain words', () => {
  const b = bottle('x', [hop('Dallas', 32.8, -96.8, 'launch'), hop('Lisbon', 38.7, -9.1), hop('Lisbon', 38.7, -9.1)]);
  assert.equal(seaCountLine([b]), '1 bottle · 2 cities · 2 keeps');
  assert.equal(seaCountLine([]), '0 bottles · 0 cities · 0 keeps');
});
