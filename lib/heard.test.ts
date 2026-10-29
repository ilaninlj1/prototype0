import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SwipeEntry } from './discovery.ts';
import { heardDays, heardSongs, outcomeLine } from './heard.ts';

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
const e = (trackId: number, action: SwipeEntry['action'], timestamp: number, over: Partial<SwipeEntry> = {}): SwipeEntry => ({
  trackId,
  trackName: `Song ${trackId}`,
  artistId: trackId * 10,
  artistName: `Artist ${trackId}`,
  genre: 'Soul',
  action,
  timestamp,
  listenMs: 6_000,
  ...over,
});

test('one row per song, newest first, steering left out', () => {
  const songs = heardSongs([e(1, 'skip', at(26)), e(2, 'reveal', at(27)), e(2, 'steer-artist', at(27, 13)), e(3, 'genre-jump', at(28))]);
  assert.deepEqual(
    songs.map((s) => s.track.id),
    [3, 2, 1]
  );
});

test('the strongest outcome wins: hearted, then revealed, then left, then skipped', () => {
  const [s] = heardSongs([e(1, 'reveal', at(27)), e(1, 'like', at(27, 13))]);
  assert.equal(s.outcome, 'saved');
  assert.equal(heardSongs([e(1, 'skip', at(27)), e(1, 'reveal', at(27, 13))])[0].outcome, 'revealed');
  assert.equal(heardSongs([e(1, 'genre-jump', at(27))])[0].outcome, 'jumped');
});

test('a song heard again moves up with its latest time and longest listen', () => {
  const songs = heardSongs([e(1, 'skip', at(20), { listenMs: 3_000 }), e(2, 'skip', at(25)), e(1, 'skip', at(27), { listenMs: 14_000 })]);
  assert.equal(songs[0].track.id, 1);
  assert.equal(songs[0].at, at(27));
  assert.equal(songs[0].listenMs, 14_000);
});

test('old entries without a name still show, named by what the app knows later', () => {
  const [s] = heardSongs([e(1, 'skip', at(27), { trackName: undefined, artistName: undefined })]);
  assert.equal(s.track.trackName, '');
  assert.equal(s.track.id, 1);
});

test('outcome lines in plain words', () => {
  const [skip] = heardSongs([e(1, 'skip', at(27), { listenMs: 4_400 })]);
  assert.equal(outcomeLine(skip), 'Skipped after 4s');
  assert.equal(outcomeLine({ ...skip, listenMs: 300 }), 'Skipped right away');
  assert.equal(outcomeLine({ ...skip, outcome: 'saved' }), 'Hearted');
  assert.equal(outcomeLine({ ...skip, outcome: 'revealed' }), 'Revealed');
  assert.equal(outcomeLine({ ...skip, outcome: 'jumped', listenMs: 12_000 }), 'Left for a new genre after 12s');
  assert.equal(outcomeLine({ ...skip, source: 'run' }), 'Played on a run');
});

test('days read Today, Yesterday, then the date, with the year only when it differs', () => {
  const songs = heardSongs([e(1, 'skip', at(28, 9)), e(2, 'skip', at(28, 8)), e(3, 'skip', at(27)), e(4, 'skip', at(3)), e(5, 'skip', new Date(2025, 11, 31).getTime())]);
  const days = heardDays(songs, at(28, 20));
  assert.deepEqual(
    days.map((d) => [d.label, d.songs.length]),
    [
      ['Today', 2],
      ['Yesterday', 1],
      ['Oct 3', 1],
      ['Dec 31, 2025', 1],
    ]
  );
});
