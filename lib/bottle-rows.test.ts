import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBottle, parseBottles } from './bottle-rows.ts';

const ID = '7d3f0c2a-1b2c-4d5e-8f90-123456789abc';
const hop = (over: Record<string, unknown> = {}) => ({
  kind: 'keep',
  city: 'Lisbon',
  country: 'Portugal',
  lat: 38.5,
  lng: -9,
  exact: true,
  tier: 'deep',
  ring: { key: 4, mode: 0, energy: 0.6, tempo: 120 },
  at: '2026-10-28T12:00:00Z',
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  track_id: 1440857781,
  artist_key: 'some artist',
  genre_tag: 'shoegaze',
  keeps: 1,
  passes: 2,
  state: 'floating',
  last_moved_at: '2026-10-28T12:00:00Z',
  changed_at: '2026-10-28T12:00:00Z',
  hops: [hop({ kind: 'launch', city: 'Dallas', tier: null, ring: null }), hop()],
  ...over,
});

test('parses a good row into camelCase with hops in order', () => {
  const b = parseBottle(row());
  assert.equal(b?.id, ID);
  assert.equal(b?.trackId, 1440857781);
  assert.equal(b?.artistKey, 'some artist');
  assert.equal(b?.lastMovedAt, '2026-10-28T12:00:00Z');
  assert.equal(b?.changedAt, '2026-10-28T12:00:00Z');
  assert.deepEqual(
    b?.hops.map((h) => [h.kind, h.city]),
    [
      ['launch', 'Dallas'],
      ['keep', 'Lisbon'],
    ]
  );
  assert.deepEqual(b?.hops[1].ring, { key: 4, mode: 0, energy: 0.6, tempo: 120 });
});

test('drops a row with a bad id, a track id ≤ 0, or an unknown state', () => {
  assert.equal(parseBottle(row({ id: 'not-a-uuid' })), null);
  assert.equal(parseBottle(row({ track_id: 0 })), null);
  assert.equal(parseBottle(row({ track_id: 1.5 })), null);
  assert.equal(parseBottle(row({ state: 'exploded' })), null);
});

test('clamps strings and strips control characters', () => {
  const b = parseBottle(row({ hops: [hop({ city: 'L'.repeat(5000) }), hop({ city: 'Se\u0000o\u001bul' })] }));
  assert.equal(b?.hops[0].city.length, 80);
  assert.equal(b?.hops[1].city, 'Seoul');
});

test('drops hops with NaN or out-of-range coordinates but keeps the bottle', () => {
  const b = parseBottle(row({ hops: [hop({ lat: Number.NaN }), hop({ lng: 200 }), hop({ lat: 91 }), hop()] }));
  assert.equal(b?.hops.length, 1);
});

test('caps hops at 500, keeping the first', () => {
  const many = Array.from({ length: 600 }, (_, i) => hop({ city: `c${i}` }));
  const b = parseBottle(row({ hops: many }));
  assert.equal(b?.hops.length, 500);
  assert.equal(b?.hops[0].city, 'c0');
});

test('a ring seed out of range becomes null', () => {
  const ringOf = (ring: unknown) => parseBottle(row({ hops: [hop({ ring })] }))?.hops[0].ring;
  assert.equal(ringOf({ key: 12, mode: 0, energy: 0.5, tempo: 100 }), null);
  assert.equal(ringOf({ key: 3, mode: 0, energy: 1.7, tempo: 100 }), null);
  assert.equal(ringOf({ key: 3, mode: 2, energy: 0.5, tempo: 100 }), null);
  assert.deepEqual(ringOf({ key: null, mode: null, energy: 0.5, tempo: 100 }), { key: null, mode: null, energy: 0.5, tempo: 100 });
});

test('unknown tier becomes null, missing exact defaults to true', () => {
  const { exact: _drop, ...noExact } = hop({ tier: 'sideways' });
  const b = parseBottle(row({ hops: [noExact] }));
  assert.equal(b?.hops[0].tier, null);
  assert.equal(b?.hops[0].exact, true);
});

test('parseBottles skips non-objects and keeps the good ones', () => {
  const list = parseBottles([row(), 'junk', null, 42, row({ state: 'nope' }), row({ id: ID.replace('7', '8') })]);
  assert.equal(list.length, 2);
});

test('parseBottles of null or a non-array is []', () => {
  assert.deepEqual(parseBottles(null), []);
  assert.deepEqual(parseBottles({ id: ID }), []);
});
