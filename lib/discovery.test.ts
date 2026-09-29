import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeDiscoveryTracks,
  extractGenres,
  mergeDiscoveredGenres,
  isGenreRelated,
  isGenericGenreTitle,
  deriveSeenTrackIds,
  deriveVisitedArtistIds,
  deriveGenresHeard,
  deriveRatedGenres,
  keepDropEntries,
  likedGenres,
  filterByGenre,
  pickJumpGenre,
  parseGenreSearchResponse,
  parseArtistLookupResponse,
  refillQueue,
  refillQueueWithFallback,
  buildSpotifySearchUrl,
  artworkUrl,
  describeListeners,
  describeGrowth,
  summarizeFinds,
  withLikedAt,
  MAX_REFILL_ATTEMPTS,
  MAX_GENRE_FALLBACKS,
  RATED_LISTEN_THRESHOLD_MS,
  ALBUM_SPREAD_WINDOW,
  ALBUM_SPREAD_CAP,
  spreadByAlbum,
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
    collectionName: null,
    ...overrides,
  };
}

function swipe(overrides: Partial<SwipeEntry>): SwipeEntry {
  return {
    trackId: 1,
    artistId: 1,
    genre: 'Rock',
    action: 'skip',
    timestamp: 0,
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

// ---------- isGenericGenreTitle ----------

test('isGenericGenreTitle matches a title that is exactly the genre name', () => {
  assert.equal(isGenericGenreTitle('Techno', 'Techno'), true);
});

test('isGenericGenreTitle matches case-insensitively and ignores surrounding whitespace/punctuation', () => {
  assert.equal(isGenericGenreTitle('  techno!  ', 'Techno'), true);
  assert.equal(isGenericGenreTitle('AMAPIANO', 'amapiano'), true);
});

test('isGenericGenreTitle does not match a title that merely contains the genre word', () => {
  assert.equal(isGenericGenreTitle('Techno Nights', 'Techno'), false);
  assert.equal(isGenericGenreTitle('My House', 'House'), false);
});

test('isGenericGenreTitle does not match an unrelated title', () => {
  assert.equal(isGenericGenreTitle('Space Song', 'Techno'), false);
});

test('isGenericGenreTitle handles empty strings without matching each other', () => {
  assert.equal(isGenericGenreTitle('', 'Techno'), false);
  assert.equal(isGenericGenreTitle('Techno', ''), false);
});

test('parseGenreSearchResponse drops a genre-related result whose title is just the searched genre', () => {
  const json = {
    results: [
      { trackId: 1, trackName: 'Techno', artistId: 10, artistName: 'DJ Nobody', artworkUrl100: 'a', primaryGenreName: 'Electronic', previewUrl: 'p1' },
      { trackId: 2, trackName: 'Techno Nights', artistId: 11, artistName: 'Real Artist', artworkUrl100: 'b', primaryGenreName: 'Electronic', previewUrl: 'p2' },
    ],
  };
  const result = parseGenreSearchResponse(json, 'Techno');
  assert.deepEqual(result.map((t) => t.id), [2]);
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

test('refillQueue spreads across the whole accumulated pool, not per batch — a dominated first fetch does not force an adjacent repeat', async () => {
  let call = 0;
  const fetcher = async () => {
    call += 1;
    // First attempt: two tracks, both album 100 — not enough alone to reach
    // target depth, so a second attempt happens.
    if (call === 1) return [track({ id: 1, collectionId: 100 }), track({ id: 2, collectionId: 100 })];
    // Second attempt: a different album entirely.
    return [track({ id: 3, collectionId: 200 }), track({ id: 4, collectionId: 200 })];
  };
  const { queue } = await refillQueue([], { type: 'genre', genre: 'Rock' }, new Set(), fetcher);
  // Placing per-batch-as-it-arrived would have produced [1, 2, 3] — two
  // album-100 tracks adjacent at the front, from the first batch alone.
  // Spreading over the accumulated pool interleaves them instead.
  assert.deepEqual(queue.map((t) => t.id), [1, 3, 2]);
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

test('a steer entry is inert to deriveRatedGenres', () => {
  const entry = swipe({ genre: 'Rock', action: 'steer-sound', timestamp: 0 });
  assert.deepEqual(deriveRatedGenres([entry]), new Set());
});

// ---------- spreadByAlbum ----------

test('spreadByAlbum keeps two same-album candidates apart when a different album is available to place between them', () => {
  const candidates = [
    track({ id: 1, collectionId: 100 }),
    track({ id: 2, collectionId: 100 }),
    track({ id: 3, collectionId: 200 }),
  ];
  const result = spreadByAlbum(candidates, []);
  assert.deepEqual(result.map((t) => t.id), [1, 3, 2]);
});

test('spreadByAlbum never treats two no-collectionId candidates as matching each other', () => {
  const candidates = [
    track({ id: 1, collectionId: undefined }),
    track({ id: 2, collectionId: undefined }),
    track({ id: 3, collectionId: undefined }),
  ];
  // If undefined were ever compared as "the same album", cap=1 would force
  // reordering here. Order staying exactly as given proves it isn't.
  assert.deepEqual(spreadByAlbum(candidates, []).map((t) => t.id), [1, 2, 3]);
});

test('spreadByAlbum defers a candidate matching an already-presented album in recentAlbumIds', () => {
  const candidates = [track({ id: 1, collectionId: 100 }), track({ id: 2, collectionId: 200 })];
  const result = spreadByAlbum(candidates, [100]);
  assert.deepEqual(result.map((t) => t.id), [2, 1]);
});

test('spreadByAlbum tier 2: falls back to any different album rather than repeat the immediately preceding one, once the full cap already can\'t be satisfied', () => {
  // Both albums already appear somewhere in the trailing window, so tier 1
  // (the full window/cap rule) fails for both candidates — but only one of
  // them equals the *immediately* preceding album, so tier 2 must prefer the
  // other one rather than falling all the way back to "just take the first".
  const recentAlbumIds = [200, 100]; // last presented album is 100
  const candidates = [track({ id: 1, collectionId: 100 }), track({ id: 2, collectionId: 200 })];
  const result = spreadByAlbum(candidates, recentAlbumIds);
  assert.deepEqual(result.map((t) => t.id), [2, 1]);
});

test('spreadByAlbum tier 3: places every candidate even when they are all the same over-represented album', () => {
  const candidates = [
    track({ id: 1, collectionId: 100 }),
    track({ id: 2, collectionId: 100 }),
    track({ id: 3, collectionId: 100 }),
  ];
  // Nothing to interleave with — every remaining candidate is the same album
  // as the one just placed, so a repeat is unavoidable. All three still get
  // placed; none are dropped.
  assert.deepEqual(spreadByAlbum(candidates, []).map((t) => t.id), [1, 2, 3]);
});

test('spreadByAlbum tolerates undefined entries in recentAlbumIds (pre-migration history) without crashing or false-matching', () => {
  const candidates = [track({ id: 1, collectionId: 100 }), track({ id: 2, collectionId: 100 })];
  // Two undefined slots (simulating old SwipeEntry rows with no collectionId)
  // must not block placement of a real album, and must not be mistaken for
  // one another or for a real id.
  const result = spreadByAlbum(candidates, [undefined, undefined]);
  assert.deepEqual(result.map((t) => t.id), [1, 2]);
});

test('spreadByAlbum returns an empty array for empty candidates', () => {
  assert.deepEqual(spreadByAlbum([], []), []);
});

test('describeListeners formats the count and says how rare the find is', () => {
  assert.deepEqual(describeListeners(900), { count: '900', verdict: 'Almost nobody has heard this.' });
  assert.deepEqual(describeListeners(12_400), { count: '12.4K', verdict: 'Almost nobody has heard this.' });
  assert.deepEqual(describeListeners(48_000), { count: '48K', verdict: 'Under the radar.' });
  assert.deepEqual(describeListeners(640_000), { count: '640K', verdict: 'Known, not famous.' });
  assert.deepEqual(describeListeners(3_250_000), { count: '3.3M', verdict: 'Everyone knows this one.' });
});

test('describeGrowth: percent change since the find, and whether it at least doubled', () => {
  assert.deepEqual(describeGrowth(10_000, 38_700), { pct: 287, calledIt: true });
  assert.deepEqual(describeGrowth(10_000, 10_400), { pct: 4, calledIt: false });
  assert.deepEqual(describeGrowth(10_000, 9_000), { pct: -10, calledIt: false });
});

test('summarizeFinds: count, median found-at, called-it count and best call', () => {
  const finds = [
    { artistName: 'A', found: 1_000, now: 3_000 },
    { artistName: 'B', found: 50_000, now: 55_000 },
    { artistName: 'C', found: 8_000, now: undefined },
    { artistName: 'D', found: undefined, now: 90_000 },
  ];
  assert.deepEqual(summarizeFinds(finds), {
    count: 4,
    medianFound: 8_000,
    calledIt: 1,
    best: { artistName: 'A', pct: 200 },
  });
});

test('summarizeFinds: no best call until something has actually grown', () => {
  const s = summarizeFinds([{ artistName: 'A', found: 1_000, now: 900 }]);
  assert.equal(s.best, null);
  assert.equal(summarizeFinds([]).medianFound, null);
});

test('withLikedAt backfills a missing like date from the latest like in swipe history', () => {
  const t = (id: number, likedAt?: number) => ({ id, likedAt }) as unknown as DiscoveryTrack;
  const history = [
    { trackId: 1, action: 'like', timestamp: 100 },
    { trackId: 1, action: 'like', timestamp: 300 },
    { trackId: 2, action: 'skip', timestamp: 200 },
  ] as unknown as SwipeEntry[];
  const out = withLikedAt([t(1), t(2), t(3, 50)], history);
  assert.deepEqual(out.map((x) => x.likedAt), [300, undefined, 50]);
});

test('keepDropEntries puts drop swipes back into an undo snapshot taken before them', () => {
  const feed = swipe({ trackId: 1, action: 'like', timestamp: 100 });
  const drop1 = { ...swipe({ trackId: 9, action: 'skip', timestamp: 200 }), source: 'drop' as const };
  const drop2 = { ...swipe({ trackId: 8, action: 'like', timestamp: 300 }), source: 'drop' as const };
  assert.deepEqual(keepDropEntries([], [feed, drop1, drop2]), [drop1, drop2]);
  assert.deepEqual(keepDropEntries([drop1], [feed, drop1, drop2]), [drop1, drop2]);
});

test('likedGenres lists genres by how often they appear, and filterByGenre keeps order', () => {
  const tr = (id: number, g: string) => ({ ...track({ id }), primaryGenreName: g });
  const liked = [tr(1, 'Jazz'), tr(2, 'Rock'), tr(3, 'Jazz'), tr(4, '')];
  assert.deepEqual(likedGenres(liked), ['Jazz', 'Rock']);
  assert.deepEqual(filterByGenre(liked, 'Jazz').map((t) => t.id), [1, 3]);
  assert.deepEqual(filterByGenre(liked, null).map((t) => t.id), [1, 2, 3, 4]);
});
