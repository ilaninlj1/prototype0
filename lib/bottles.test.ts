import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import {
  bottleSlotOpen,
  canLaunch,
  commit,
  EMPTY_OUTBOX,
  enqueue,
  oldFinds,
  sent,
  stage,
  unstage,
  type OutboxItem,
} from './bottles.ts';

const slot = (over: Partial<Parameters<typeof bottleSlotOpen>[0]> = {}) =>
  bottleSlotOpen({ enabled: true, offline: false, mode: 'genre', songsHeard: 20, cardsSinceBottle: 4, ...over });

test('a slot opens on the 5th card after the last bottle in genre mode', () => {
  assert.equal(slot({ cardsSinceBottle: 4 }), true);
  assert.equal(slot({ cardsSinceBottle: 3 }), false);
});

test('no slot in the first 5 songs', () => {
  assert.equal(slot({ songsHeard: 4 }), false);
  assert.equal(slot({ songsHeard: 5 }), true);
});

test('no slot in artist, map or deck mode, offline, or turned off', () => {
  assert.equal(slot({ mode: 'artist' }), false);
  assert.equal(slot({ mode: 'deck' }), false);
  assert.equal(slot({ mode: 'map' }), false);
  assert.equal(slot({ offline: true }), false);
  assert.equal(slot({ enabled: false }), false);
});

test('sorted mode allows a slot', () => {
  assert.equal(slot({ mode: 'sorted' }), true);
});

const track = (over: Partial<DiscoveryTrack> = {}): DiscoveryTrack => ({
  id: 1,
  trackName: 'Song',
  artistId: 2,
  artistName: 'Artist',
  artworkUrl100: '',
  primaryGenreName: 'shoegaze',
  previewUrl: 'https://example.com/a.m4a',
  trackViewUrl: '',
  collectionName: null,
  ...over,
});

test('canLaunch refuses bottles, short listens and the 21st launch', () => {
  assert.equal(canLaunch(track(), 10_000, 0), true);
  assert.equal(canLaunch(track({ via: 'bottle' }), 30_000, 0), false);
  assert.equal(canLaunch(track(), 9_999, 0), false);
  assert.equal(canLaunch(track(), 30_000, 20), false);
  assert.equal(canLaunch(track({ via: 'map' }), 30_000, 19), true);
});

const verdict = (id: string): OutboxItem => ({
  kind: 'verdict',
  id,
  bottleId: `b-${id}`,
  verdict: 'pass',
  place: null,
  tier: null,
  ring: null,
  at: 1,
});

test('stage then unstage leaves the queue untouched', () => {
  const o = unstage(stage(EMPTY_OUTBOX, verdict('a')));
  assert.deepEqual(o, EMPTY_OUTBOX);
});

test('staging twice moves the first item to queued', () => {
  const o = stage(stage(EMPTY_OUTBOX, verdict('a')), verdict('b'));
  assert.deepEqual(
    o.queued.map((i) => i.id),
    ['a']
  );
  assert.equal(o.pending?.id, 'b');
  assert.deepEqual(
    unstage(o).queued.map((i) => i.id),
    ['a']
  );
});

test('commit moves pending to queued', () => {
  const o = commit(stage(EMPTY_OUTBOX, verdict('a')));
  assert.equal(o.pending, null);
  assert.deepEqual(
    o.queued.map((i) => i.id),
    ['a']
  );
  assert.deepEqual(commit(EMPTY_OUTBOX), EMPTY_OUTBOX);
});

test('sent removes only those ids', () => {
  const o = commit(stage(stage(stage(EMPTY_OUTBOX, verdict('a')), verdict('b')), verdict('c')));
  assert.deepEqual(
    sent(o, ['a', 'c']).queued.map((i) => i.id),
    ['b']
  );
});

const like = (trackId: number, listenMs: number, timestamp: number, source?: SwipeEntry['source']): SwipeEntry => ({
  trackId,
  artistId: 1,
  genre: 'g',
  action: 'like',
  timestamp,
  listenMs,
  ...(source ? { source } : {}),
});

test('oldFinds keeps 10 s+ feed likes, newest first, at most 30, skipping drop and bottle songs', () => {
  const liked = [1, 2, 3, 4, 5].map((id) => track({ id }));
  const history = [like(1, 12_000, 100), like(2, 3_000, 200), like(3, 20_000, 300, 'drop'), like(4, 15_000, 400, 'bottle'), like(5, 11_000, 500, 'map')];
  assert.deepEqual(
    oldFinds(history, liked).map((t) => t.id),
    [5, 1]
  );
  const many = Array.from({ length: 40 }, (_, i) => track({ id: 100 + i }));
  const manyHistory = many.map((t, i) => like(t.id, 20_000, i));
  assert.equal(oldFinds(manyHistory, many).length, 30);
  assert.equal(oldFinds(manyHistory, many)[0].id, 139);
});

test('enqueue sends at once and leaves the undoable item alone', () => {
  const o = enqueue(stage(EMPTY_OUTBOX, verdict('a')), verdict('known'));
  assert.equal(o.pending?.id, 'a');
  assert.deepEqual(
    o.queued.map((i) => i.id),
    ['known']
  );
});
