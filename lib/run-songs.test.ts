import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DiscoveryTrack } from './discovery.ts';
import { beatFor, energyBand, pickNext, slotIsBlind, type RunCandidate } from './run-songs.ts';

let nextId = 1;
const cand = (tempo: number, energy: number, artist = `A${nextId}`): RunCandidate => {
  const id = nextId++;
  return { track: { id, artistName: artist } as DiscoveryTrack, tempo, energy, artist };
};
const rng = () => 0;
const base = { mode: 'blind' as const, index: 0, spm: 164, steer: 'hold' as const, usedIds: new Set<number>(), usedArtists: new Set<string>(), rng };

test('fits at half time', () => {
  assert.equal(beatFor(82, 164), 164);
  assert.equal(beatFor(330, 164), 165);
  const half = cand(82, 0.6);
  const off = cand(120, 0.6);
  assert.equal(pickNext({ ...base, blindPool: [off, half], liked: [] })?.cand, half);
});

test('widens to 6 % when under 12 fit', () => {
  const near = cand(170, 0.6); // 3.7 % off
  const wider = cand(173, 0.6); // 5.5 % off, only in the 6 % window
  // Ease wants low energy: only the wider song is in the band, and with under 12 at 4 % the window widens to reach it.
  const lowWider = cand(173, 0.3);
  const got = pickNext({ ...base, steer: 'ease', blindPool: [near, wider, lowWider], liked: [] });
  assert.equal(got?.cand, lowWider);
});

test('ease prefers low energy', () => {
  const loud = cand(164, 0.9);
  const calm = cand(164, 0.4);
  assert.equal(pickNext({ ...base, steer: 'ease', blindPool: [loud, calm], liked: [] })?.cand, calm);
  assert.equal(pickNext({ ...base, steer: 'lift', blindPool: [loud, calm], liked: [] })?.cand, loud);
  assert.deepEqual(energyBand('hold'), [0.45, 0.8]);
});

test('mix plays blind every third', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => slotIsBlind('mix', i)), [false, false, true, false, false, true]);
  const blind = cand(164, 0.6);
  const liked = cand(164, 0.6);
  assert.deepEqual(pickNext({ ...base, mode: 'mix', index: 0, blindPool: [blind], liked: [liked] }), { cand: liked, blind: false });
  assert.deepEqual(pickNext({ ...base, mode: 'mix', index: 2, blindPool: [blind], liked: [liked] }), { cand: blind, blind: true });
});

test('mix falls back to blind with no liked songs', () => {
  const blind = cand(164, 0.6);
  assert.deepEqual(pickNext({ ...base, mode: 'mix', index: 0, blindPool: [blind], liked: [] }), { cand: blind, blind: true });
});

test('liked fits loosely, then plays any tempo', () => {
  const far = cand(100, 0.6);
  assert.equal(pickNext({ ...base, mode: 'liked', blindPool: [], liked: [far] })?.cand, far);
});

test('never repeats an artist in blind', () => {
  const a1 = cand(164, 0.6, 'Same');
  const a2 = cand(164, 0.6, 'Same');
  const got = pickNext({ ...base, usedArtists: new Set(['Same']), blindPool: [a1, a2], liked: [] });
  assert.equal(got, null);
});

test('a played song never comes back', () => {
  const only = cand(164, 0.6);
  assert.equal(pickNext({ ...base, mode: 'liked', usedIds: new Set([only.track.id]), blindPool: [], liked: [only] }), null);
});

test('returns null only when nothing is left', () => {
  assert.equal(pickNext({ ...base, blindPool: [], liked: [] }), null);
  const offBeat = cand(100, 0.1);
  assert.equal(pickNext({ ...base, blindPool: [offBeat], liked: [] })?.cand, offBeat);
});
