import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeDiscoveryTracks,
  extractGenres,
  mergeDiscoveredGenres,
  isGenreRelated,
  deriveSeenTrackIds,
  deriveVisitedArtistIds,
  deriveGenresHeard,
  pickJumpGenre,
  parseGenreSearchResponse,
  parseArtistLookupResponse,
  refillQueue,
  MAX_REFILL_ATTEMPTS,
  type DiscoveryTrack,
  type SwipeEntry,
} from './discovery.ts';

function track(overrides: Partial<DiscoveryTrack>): DiscoveryTrack {
  return {
    id: 1,
    trackName: 'Track',
    artistId: 10,
    artistName: 'Artist',
    artworkUrl100: 'https://example.com/art.jpg',
    primaryGenreName: 'Rock',
    previewUrl: 'https://example.com/preview.m4a',
    ...overrides,
  };
}

test('dedupeDiscoveryTracks keeps the first occurrence of each id', () => {
  const tracks = [
    track({ id: 1, trackName: 'A' }),
    track({ id: 1, trackName: 'B' }),
    track({ id: 2 }),
  ];
  const result = dedupeDiscoveryTracks(tracks);
  assert.equal(result.length, 2);
  assert.equal(result[0].trackName, 'A');
});

test('extractGenres returns distinct genres in first-seen order', () => {
  const tracks = [
    track({ id: 1, primaryGenreName: 'Rock' }),
    track({ id: 2, primaryGenreName: 'Pop' }),
    track({ id: 3, primaryGenreName: 'Rock' }),
  ];
  assert.deepEqual(extractGenres(tracks), ['Rock', 'Pop']);
});

test('mergeDiscoveredGenres appends only new genres, preserving order', () => {
  const result = mergeDiscoveredGenres(['Rock', 'Pop'], ['Pop', 'Jazz']);
  assert.deepEqual(result, ['Rock', 'Pop', 'Jazz']);
});

test('mergeDiscoveredGenres returns the same array reference when nothing new', () => {
  const existing = ['Rock'];
  assert.equal(mergeDiscoveredGenres(existing, ['Rock']), existing);
});

test('isGenreRelated matches substrings in either direction, case-insensitively', () => {
  assert.equal(isGenreRelated('Hip-Hop', 'Hip-Hop/Rap'), true);
  assert.equal(isGenreRelated('rock', 'Alternative Rock'), true);
  assert.equal(isGenreRelated('Jazz', 'Pop'), false);
});

test('isGenreRelated rejects empty terms', () => {
  assert.equal(isGenreRelated('', 'Rock'), false);
  assert.equal(isGenreRelated('Rock', ''), false);
});

test('derive* helpers collect distinct values from swipe history', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1 },
    { trackId: 2, artistId: 10, genre: 'Rock', action: 'like', timestamp: 2 },
    { trackId: 3, artistId: 20, genre: 'Pop', action: 'genre-jump', timestamp: 3 },
  ];
  assert.deepEqual(deriveSeenTrackIds(history), new Set([1, 2, 3]));
  assert.deepEqual(deriveVisitedArtistIds(history), new Set([10, 20]));
  assert.deepEqual(deriveGenresHeard(history), new Set(['Rock', 'Pop']));
});

test('pickJumpGenre prefers an unexplored discovered genre', () => {
  const genre = pickJumpGenre(['Rock', 'Jazz'], new Set(['Rock']), ['Rock', 'Pop'], []);
  assert.equal(genre, 'Jazz');
});

test('pickJumpGenre falls back to allGenres when nothing discovered is unexplored', () => {
  const genre = pickJumpGenre(['Rock'], new Set(['Rock']), ['Rock', 'Pop'], []);
  assert.equal(genre, 'Pop');
});

test('pickJumpGenre falls back to the least-recently-heard genre once everything is explored', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 1, genre: 'Rock', action: 'skip', timestamp: 100 },
    { trackId: 2, artistId: 1, genre: 'Pop', action: 'skip', timestamp: 50 },
  ];
  const genre = pickJumpGenre(['Rock'], new Set(['Rock', 'Pop']), ['Rock', 'Pop'], history);
  assert.equal(genre, 'Pop'); // heard longer ago than Rock
});

test('parseGenreSearchResponse maps fields and drops genre-unrelated results', () => {
  const json = {
    results: [
      { trackId: 1, trackName: 'Song A', artistId: 10, artistName: 'Band', artworkUrl100: 'a', primaryGenreName: 'Alternative Rock', previewUrl: 'p1' },
      { trackId: 2, trackName: 'Song B', artistId: 11, artistName: 'Singer', artworkUrl100: 'b', primaryGenreName: 'Pop', previewUrl: 'p2' },
      { trackId: 3, trackName: 'Song C', artistId: 12, artistName: 'Nobody', artworkUrl100: 'c', primaryGenreName: 'Jazz' },
    ],
  };
  const result = parseGenreSearchResponse(json, 'Rock');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].primaryGenreName, 'Alternative Rock');
});

test('parseArtistLookupResponse skips the artist entry and previewless tracks', () => {
  const json = {
    results: [
      { wrapperType: 'artist', artistId: 10, artistName: 'Band' },
      { wrapperType: 'track', trackId: 1, trackName: 'Song A', artistId: 10, artistName: 'Band', artworkUrl100: 'a', primaryGenreName: 'Rock', previewUrl: 'p1' },
      { wrapperType: 'track', trackId: 2, trackName: 'Song B', artistId: 10, artistName: 'Band', artworkUrl100: 'b', primaryGenreName: 'Rock' },
    ],
  };
  const result = parseArtistLookupResponse(json);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});

test('refillQueue tops the queue up to target depth, skipping seen and duplicate tracks', async () => {
  const seen = new Set([1]);
  const batch = [track({ id: 1 }), track({ id: 2 }), track({ id: 3 }), track({ id: 4 })];
  const fetcher = async () => batch;
  const { queue, fetched } = await refillQueue([], { type: 'genre', genre: 'Rock' }, seen, fetcher);
  assert.equal(queue.length, 3);
  assert.deepEqual(queue.map((t) => t.id), [2, 3, 4]);
  assert.equal(fetched.length, 4); // every returned track counts as discovered, shown or not
});

test('refillQueue does nothing when already at target depth', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [];
  };
  const full = [track({ id: 1 }), track({ id: 2 }), track({ id: 3 })];
  const { queue } = await refillQueue(full, { type: 'genre', genre: 'Rock' }, new Set(), fetcher);
  assert.equal(calls, 0);
  assert.deepEqual(queue, full);
});

test('refillQueue stops retrying once a strategy stops producing anything new', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [track({ id: 1 })]; // always the same already-seen track
  };
  const { queue } = await refillQueue([], { type: 'genre', genre: 'Rock' }, new Set([1]), fetcher);
  assert.equal(queue.length, 0);
  assert.equal(calls, MAX_REFILL_ATTEMPTS);
});
