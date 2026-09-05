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
  deriveRatedGenres,
  pickJumpGenre,
  parseGenreSearchResponse,
  parseArtistLookupResponse,
  refillQueue,
  refillQueueWithFallback,
  buildSpotifySearchUrl,
  artworkUrl,
  MAX_REFILL_ATTEMPTS,
  MAX_GENRE_FALLBACKS,
  RATED_LISTEN_THRESHOLD_MS,
  type DiscoveryTrack,
  type SwipeEntry,
  type Strategy,
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
    trackViewUrl: 'https://music.apple.com/example',
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

test('isGenreRelated uses an override\'s exact-match list, case-insensitively, when the term has one', () => {
  const overrides = { reggaeton: ['Urbano Latino'] };
  assert.equal(isGenreRelated('reggaeton', 'Urbano latino', overrides), true);
  assert.equal(isGenreRelated('Reggaeton', 'urbano latino', overrides), true);
});

test('isGenreRelated rejects a genre not on the override list even if substring matching would have allowed it', () => {
  const overrides = { metal: ['Hard Rock', 'Metal', 'Rock'] };
  // "Heavy Metal" contains "metal" and would pass the substring check, but
  // isn't on the override's list, so an override term rejects it outright.
  assert.equal(isGenreRelated('metal', 'Heavy Metal', overrides), false);
});

test('isGenreRelated falls back to substring matching for a term absent from the override map', () => {
  const overrides = { reggaeton: ['Urbano Latino'] };
  assert.equal(isGenreRelated('Hip-Hop', 'Hip-Hop/Rap', overrides), true);
});

test('isGenreRelated: the real GENRE_TERM_OVERRIDES map fixes the reported reggaeton case', () => {
  assert.equal(isGenreRelated('reggaeton', 'Urbano latino'), true);
  assert.equal(isGenreRelated('reggaeton', 'Pop'), false);
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

test('deriveRatedGenres counts a genre-jump the same as skip/like once listenMs clears the threshold', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1, listenMs: 12000 },
    { trackId: 2, artistId: 10, genre: 'Jazz', action: 'like', timestamp: 2, listenMs: 15000 },
    { trackId: 3, artistId: 20, genre: 'Pop', action: 'genre-jump', timestamp: 3, listenMs: 11000 },
  ];
  // Direction never mattered — a genre-jump after actually listening counts
  // exactly like a skip or like does.
  assert.deepEqual(deriveRatedGenres(history), new Set(['Rock', 'Jazz', 'Pop']));
});

test('deriveRatedGenres excludes a swipe under the listen threshold regardless of action', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1, listenMs: 2000 },
    { trackId: 2, artistId: 10, genre: 'Jazz', action: 'like', timestamp: 2, listenMs: 0 },
  ];
  assert.deepEqual(deriveRatedGenres(history), new Set());
});

test('deriveRatedGenres treats a missing listenMs (pre-existing entries) as 0, not heard', () => {
  const history: SwipeEntry[] = [{ trackId: 1, artistId: 10, genre: 'Rock', action: 'like', timestamp: 1 }];
  assert.deepEqual(deriveRatedGenres(history), new Set());
});

test('deriveRatedGenres includes a swipe at exactly the threshold', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1, listenMs: RATED_LISTEN_THRESHOLD_MS },
  ];
  assert.deepEqual(deriveRatedGenres(history), new Set(['Rock']));
});

test('artworkUrl swaps the trailing 100x100bb.jpg segment for the requested size', () => {
  const url =
    'https://is1-ssl.mzstatic.com/image/thumb/Music/07/60/ba/mzi.png/100x100bb.jpg';
  assert.equal(
    artworkUrl(url, 600),
    'https://is1-ssl.mzstatic.com/image/thumb/Music/07/60/ba/mzi.png/600x600bb.jpg'
  );
});

test('artworkUrl leaves an empty or non-matching URL unchanged', () => {
  assert.equal(artworkUrl('', 600), '');
  assert.equal(artworkUrl('https://example.com/no-size-here.jpg', 600), 'https://example.com/no-size-here.jpg');
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

test('buildSpotifySearchUrl encodes artist and track name into a search query', () => {
  assert.equal(
    buildSpotifySearchUrl('Radiohead', 'Let Down'),
    'https://open.spotify.com/search/Radiohead%20Let%20Down'
  );
});

test('buildSpotifySearchUrl encodes special characters in either field', () => {
  assert.equal(
    buildSpotifySearchUrl('AC/DC', "Rock & Roll Ain't Noise Pollution"),
    "https://open.spotify.com/search/AC%2FDC%20Rock%20%26%20Roll%20Ain't%20Noise%20Pollution"
  );
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

test('refillQueueWithFallback falls back to another genre once the current strategy is exhausted', async () => {
  const calls: string[] = [];
  const history: SwipeEntry[] = [{ trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1 }];
  const fetcher = async (strategy: Strategy) => {
    if (strategy.type !== 'genre') throw new Error('unexpected artist strategy');
    calls.push(strategy.genre);
    if (strategy.genre === 'Rock') return [track({ id: 1 })]; // the only Rock result, already seen
    if (strategy.genre === 'Jazz') return [track({ id: 2 }), track({ id: 3 }), track({ id: 4 })];
    throw new Error(`unexpected genre ${strategy.genre}`);
  };

  const result = await refillQueueWithFallback(
    [],
    { type: 'genre', genre: 'Rock' },
    history,
    ['Jazz'],
    ['Rock', 'Jazz'],
    fetcher
  );

  assert.deepEqual(result.queue.map((t) => t.id), [2, 3, 4]);
  assert.deepEqual(result.strategy, { type: 'genre', genre: 'Jazz' });
  // Rock is retried MAX_REFILL_ATTEMPTS times before giving up on it, then Jazz succeeds on the first try.
  assert.equal(calls.length, MAX_REFILL_ATTEMPTS + 1);
});

test('refillQueueWithFallback tries distinct genres and terminates instead of looping forever when nothing has anything left', async () => {
  const allGenres = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
  const history: SwipeEntry[] = [{ trackId: 1, artistId: 1, genre: 'G0', action: 'skip', timestamp: 1 }];
  const seenGenres = new Set<string>();
  let calls = 0;
  const fetcher = async (strategy: Strategy) => {
    calls += 1;
    if (strategy.type === 'genre') seenGenres.add(strategy.genre);
    return []; // every genre is completely tapped out
  };

  const result = await refillQueueWithFallback(
    [],
    { type: 'genre', genre: 'G0' },
    history,
    [],
    allGenres,
    fetcher
  );

  assert.equal(result.queue.length, 0);
  // The initial strategy plus MAX_GENRE_FALLBACKS distinct fallback genres, never repeating one.
  assert.equal(seenGenres.size, MAX_GENRE_FALLBACKS + 1);
  assert.equal(calls, (MAX_GENRE_FALLBACKS + 1) * MAX_REFILL_ATTEMPTS);
});
