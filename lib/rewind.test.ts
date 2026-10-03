import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import { agoLabel, bandFor, heardIn, inPeriod, likesInPeriod, periodLabel, periodLine, periodStart, step } from './rewind.ts';
import type { SpotifyLike } from './spotify.ts';

// Local time, so the tests pass in any timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function track(id: number, likedAt?: number): DiscoveryTrack {
  return {
    id,
    trackName: `Song ${id}`,
    artistId: id * 10,
    artistName: `Artist ${id}`,
    artworkUrl100: '',
    primaryGenreName: 'Alternative',
    previewUrl: '',
    trackViewUrl: '',
    collectionName: null,
    likedAt,
  };
}

test('periodStart snaps to the start of the day, month or year', () => {
  assert.equal(periodStart(at(2026, 9, 24, 18), 'day'), new Date(2026, 8, 24).getTime());
  assert.equal(periodStart(at(2026, 9, 24, 18), 'month'), new Date(2026, 8, 1).getTime());
  assert.equal(periodStart(at(2026, 9, 24, 18), 'year'), new Date(2026, 0, 1).getTime());
});

test('bandFor: a short drag steps a day, further a month, furthest a year', () => {
  const half = 180;
  assert.equal(bandFor(10, half), null, 'a nudge does nothing');
  assert.equal(bandFor(40, half), 'day');
  assert.equal(bandFor(-40, half), 'day', 'either direction');
  assert.equal(bandFor(100, half), 'month');
  assert.equal(bandFor(150, half), 'year');
  assert.equal(bandFor(400, half), 'year', 'past the end stays a year');
});

const times = [at(2025, 6, 2), at(2026, 8, 30), at(2026, 9, 3), at(2026, 9, 3, 20), at(2026, 9, 28), at(2026, 10, 2)];

test('step back skips empty days and lands on the latest find before', () => {
  assert.equal(step(times, at(2026, 10, 2), 'day', -1), at(2026, 9, 28));
  assert.equal(step(times, at(2026, 9, 28), 'day', -1), at(2026, 9, 3, 20), 'the latest find that day');
  assert.equal(step(times, at(2026, 9, 3, 20), 'day', -1), at(2026, 8, 30));
});

test('step back by month and year lands in the nearest earlier one with finds', () => {
  assert.equal(step(times, at(2026, 10, 2), 'month', -1), at(2026, 9, 28));
  assert.equal(step(times, at(2026, 9, 28), 'month', -1), at(2026, 8, 30));
  assert.equal(step(times, at(2026, 8, 30), 'month', -1), at(2025, 6, 2), 'skips 13 empty months');
  assert.equal(step(times, at(2026, 10, 2), 'year', -1), at(2025, 6, 2));
});

test('step forward lands on the earliest find after', () => {
  assert.equal(step(times, at(2025, 6, 2), 'day', 1), at(2026, 8, 30));
  assert.equal(step(times, at(2026, 8, 30), 'month', 1), at(2026, 9, 3));
  assert.equal(step(times, at(2025, 6, 2), 'year', 1), at(2026, 8, 30));
});

test('step returns null at either end', () => {
  assert.equal(step(times, at(2025, 6, 2), 'day', -1), null);
  assert.equal(step(times, at(2026, 10, 2), 'day', 1), null);
  assert.equal(step(times, at(2026, 1, 5), 'year', -1), at(2025, 6, 2));
  assert.equal(step(times, at(2025, 6, 2), 'year', -1), null);
  assert.equal(step([], at(2026, 10, 2), 'day', -1), null);
});

test('inPeriod keeps that day, month or year, newest first, and skips undated saves', () => {
  const tracks = [
    track(1, at(2026, 9, 3)),
    track(2, at(2026, 9, 3, 20)),
    track(3, at(2026, 9, 28)),
    track(4),
    track(5, at(2025, 6, 2)),
  ];
  const ids = (ts: DiscoveryTrack[]) => ts.map((t) => t.id);
  assert.deepEqual(ids(inPeriod(tracks, at(2026, 9, 3), 'day')), [2, 1]);
  assert.deepEqual(ids(inPeriod(tracks, at(2026, 9, 3), 'month')), [3, 2, 1]);
  assert.deepEqual(ids(inPeriod(tracks, at(2025, 1, 1), 'year')), [5]);
});

test('periodLabel names the day plainly', () => {
  const now = at(2026, 10, 3, 9);
  assert.equal(periodLabel(at(2026, 10, 3, 1), 'day', now), 'Today');
  assert.equal(periodLabel(at(2026, 10, 2), 'day', now), 'Yesterday');
  assert.equal(periodLabel(at(2026, 9, 24), 'day', now), 'Thu, Sep 24');
  assert.equal(periodLabel(at(2025, 6, 2), 'day', now), 'Jun 2, 2025');
  assert.equal(periodLabel(at(2026, 9, 24), 'month', now), 'September 2026');
  assert.equal(periodLabel(at(2025, 6, 2), 'year', now), '2025');
});

test('agoLabel says how far back, in the unit you are looking at', () => {
  const now = at(2026, 10, 3, 9);
  assert.equal(agoLabel(at(2026, 10, 3), 'day', now), null, 'Today needs no second label');
  assert.equal(agoLabel(at(2026, 10, 2), 'day', now), null);
  assert.equal(agoLabel(at(2026, 9, 28), 'day', now), '5 days ago');
  assert.equal(agoLabel(at(2026, 8, 30), 'day', now), '5 weeks ago');
  assert.equal(agoLabel(at(2025, 6, 2), 'day', now), '1 year ago');
  assert.equal(agoLabel(at(2026, 10, 1), 'month', now), 'This month');
  assert.equal(agoLabel(at(2026, 9, 30), 'month', now), 'Last month');
  assert.equal(agoLabel(at(2026, 6, 1), 'month', now), '4 months ago');
  assert.equal(agoLabel(at(2026, 1, 1), 'year', now), 'This year');
  assert.equal(agoLabel(at(2025, 1, 1), 'year', now), 'Last year');
  assert.equal(agoLabel(at(2023, 1, 1), 'year', now), '3 years ago');
});

test('heardIn counts songs heard in that period, not steering', () => {
  const e = (trackId: number, timestamp: number, action: SwipeEntry['action'] = 'skip'): SwipeEntry => ({
    trackId,
    artistId: 1,
    genre: 'Pop',
    action,
    timestamp,
  });
  const history = [
    e(1, at(2026, 9, 3)),
    e(2, at(2026, 9, 3, 15), 'like'),
    e(2, at(2026, 9, 3, 16)),
    e(3, at(2026, 9, 3), 'steer-artist'),
    e(4, at(2026, 9, 4)),
  ];
  assert.equal(heardIn(history, at(2026, 9, 3), 'day'), 2);
  assert.equal(heardIn(history, at(2026, 9, 3), 'month'), 3);
});

test('periodLine is one plain sentence', () => {
  assert.equal(periodLine(3, 41), '3 songs found, out of 41 you heard.');
  assert.equal(periodLine(1, 1), '1 song found, the only one you heard.');
  assert.equal(periodLine(2, 0), '2 songs found.', 'saves from before the swipe log say nothing about hearing');
  assert.equal(periodLine(3, 2), '3 songs found.');
});

test('periodLine adds Spotify likes when they are switched on', () => {
  assert.equal(periodLine(3, 41, 12), '3 songs found, out of 41 you heard. 12 liked on Spotify.');
  assert.equal(periodLine(0, 0, 1), '1 song liked on Spotify.', 'a Spotify-only day says just that');
  assert.equal(periodLine(0, 20, 5), 'No blind finds among the 20 you heard. 5 liked on Spotify.');
  assert.equal(periodLine(2, 0, 0), '2 songs found.', 'Spotify on but nothing liked there that day');
});

test('likesInPeriod keeps Spotify likes from that day, month or year, newest first', () => {
  const like = (id: string, addedAt: number): SpotifyLike => ({ id, name: id, artist: '', art: '', addedAt });
  const likes = [like('a', at(2019, 4, 2)), like('b', at(2019, 4, 2, 20)), like('c', at(2019, 5, 1)), like('d', at(2020, 1, 1))];
  assert.deepEqual(
    likesInPeriod(likes, at(2019, 4, 2), 'day').map((l) => l.id),
    ['b', 'a']
  );
  assert.deepEqual(
    likesInPeriod(likes, at(2019, 1, 1), 'year').map((l) => l.id),
    ['c', 'b', 'a']
  );
});
