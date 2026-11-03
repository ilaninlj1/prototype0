import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { allDecks, deckCounts, deckKey, deckLabel, deckMatches, pickDeck, SOUND_DECKS, soundTiles, TEMPO_BANDS, type Deck, type DeckCandidate } from './decks.ts';
import type { DiscoveryTrack } from './discovery.ts';
import type { Depth, Species } from './ocean-map.ts';
import { describeSound, type SoundFeatures } from './sound.ts';

const f = (over: Partial<SoundFeatures> = {}): SoundFeatures => ({
  tempo: 113,
  key: 6,
  mode: 1,
  energy: 0.5,
  danceability: 0.5,
  acousticness: 0.2,
  instrumentalness: 0,
  speechiness: 0.05,
  liveness: 0.1,
  valence: 0.5,
  loudness: -10,
  ...over,
});

test('every Details tile reads exactly as before and starts its own deck', () => {
  const samples = [
    f(),
    f({ energy: 0.2, tempo: 70, instrumentalness: 0.8, acousticness: 0.9 }),
    f({ energy: 0.9, loudness: -5, tempo: 150, speechiness: 0.5 }),
    f({ key: null, mode: null }),
  ];
  for (const s of samples) {
    const tiles = soundTiles(s);
    assert.deepEqual(
      tiles.map((t) => t.label),
      describeSound(s)
    );
    for (const t of tiles) assert.ok(deckMatches(t.deck, s), `${t.label} should match its own song`);
  }
});

test('the BPM tile opens the tempo band around it', () => {
  const [tempo] = soundTiles(f({ tempo: 113 }));
  assert.deepEqual(tempo.deck, { kind: 'tempo', lo: 110, hi: 120 });
  assert.equal(deckLabel(tempo.deck), '110–120 BPM');
});

test('the key tile opens that key', () => {
  const key = soundTiles(f({ key: 6, mode: 1 })).find((t) => t.deck.kind === 'key')!;
  assert.deepEqual(key.deck, { kind: 'key', key: 6, mode: 1 });
  assert.equal(deckLabel(key.deck), 'F♯ major');
});

test('quiet and sparse is the same rule as its tile', () => {
  const quiet: Deck = { kind: 'sound', id: 'quiet' };
  assert.equal(deckLabel(quiet), 'Quiet and sparse');
  assert.equal(deckMatches(quiet, f({ energy: 0.2 })), true);
  assert.equal(deckMatches(quiet, f({ energy: 0.5 })), false);
});

test('tempo bands cover 60 to 180 BPM without gaps', () => {
  for (let i = 1; i < TEMPO_BANDS.length; i++) assert.equal(TEMPO_BANDS[i][0], TEMPO_BANDS[i - 1][1]);
  assert.equal(TEMPO_BANDS[0][0], 60);
  assert.equal(TEMPO_BANDS[TEMPO_BANDS.length - 1][1], 180);
});

const track = (id: number): DiscoveryTrack => ({
  id,
  trackName: `S${id}`,
  artistId: id,
  artistName: `A${id}`,
  artworkUrl100: '',
  primaryGenreName: 'g',
  previewUrl: 'p',
  trackViewUrl: '',
  collectionName: null,
});
const cand = (id: number, artist: string, sound: SoundFeatures, depth: Depth = 'popular'): DeckCandidate => ({ track: track(id), artist, sound, depth });

test('a deck skips songs you heard, artists you excluded, and repeats no artist', () => {
  const quiet: Deck = { kind: 'sound', id: 'quiet' };
  const pool = [cand(1, 'x', f({ energy: 0.1 })), cand(2, 'x', f({ energy: 0.1 })), cand(3, 'y', f({ energy: 0.1 })), cand(4, 'z', f({ energy: 0.1 })), cand(5, 'w', f({ energy: 0.9 }))];
  const picked = pickDeck(pool, quiet, { heard: new Set([3]), keep: (a) => a !== 'z', n: 10, rand: () => 0.5 });
  assert.deepEqual(
    picked.map((t) => t.id),
    [1]
  );
});

test('a like deck brings the closest-sounding songs first', () => {
  const like: Deck = { kind: 'like', trackId: 99, label: 'Kaya', sound: f({ tempo: 100, energy: 0.4 }) };
  const pool = [cand(1, 'a', f({ tempo: 160, energy: 0.95 })), cand(2, 'b', f({ tempo: 101, energy: 0.42 })), cand(99, 'c', f({ tempo: 100, energy: 0.4 }))];
  const picked = pickDeck(pool, like, { heard: new Set(), keep: () => true, n: 1, rand: () => 0.5 });
  assert.deepEqual(
    picked.map((t) => t.id),
    [2]
  );
  assert.equal(deckLabel(like), 'Like “Kaya”');
});

test('counts say how many unheard songs each deck has left', () => {
  const pool = [cand(1, 'a', f({ energy: 0.1 })), cand(2, 'b', f({ energy: 0.1 })), cand(3, 'c', f({ energy: 0.9, loudness: -5 }))];
  const counts = deckCounts(pool, SOUND_DECKS.map((d) => ({ kind: 'sound' as const, id: d.id })), new Set([2]));
  assert.equal(counts.get(deckKey({ kind: 'sound', id: 'quiet' })), 1);
  assert.equal(counts.get(deckKey({ kind: 'sound', id: 'loud' })), 1);
});

test('the page lists every sound, all 24 keys and every tempo band, each once', () => {
  const decks = allDecks();
  assert.equal(decks.length, SOUND_DECKS.length + 24 + TEMPO_BANDS.length);
  assert.equal(new Set(decks.map(deckKey)).size, decks.length);
});

test('an ocean deck stays in its water and depth, with one unheard song per kept artist', () => {
  const ocean: Deck = { kind: 'ocean', water: 'midnight', depth: 'buried' };
  const dark = f({ valence: 0.2 });
  const pool = [
    cand(1, 'a', dark, 'buried'), cand(2, 'a', dark, 'buried'),
    cand(3, 'b', dark, 'gems'), cand(4, 'c', f(), 'buried'),
    cand(5, 'heard', dark, 'buried'), cand(6, 'excluded', dark, 'buried'),
    cand(7, 'd', dark, 'buried'),
  ];
  const picked = pickDeck(pool, ocean, { heard: new Set([5]), keep: (a) => a !== 'excluded', n: 10, rand: () => 0.99 });
  assert.deepEqual(picked.map((t) => t.id), [1, 7]);
});

test('an ocean species filter picks only that first-match species', () => {
  const ocean: Deck = { kind: 'ocean', water: 'midnight', depth: 'buried', species: 'darter' };
  const pool = [
    cand(1, 'fast', f({ valence: 0.2, tempo: 125 }), 'buried'),
    cand(2, 'loud', f({ valence: 0.2, tempo: 125, energy: 0.88 }), 'buried'),
    cand(3, 'quiet', f({ valence: 0.2, tempo: 125, energy: 0.39 }), 'buried'),
    cand(4, 'slow', f({ valence: 0.2, tempo: 94 }), 'buried'),
    cand(5, 'in-between', f({ valence: 0.2 }), 'buried'),
    cand(6, 'wrong-depth', f({ valence: 0.2, tempo: 125 }), 'popular'),
  ];
  assert.deepEqual(pickDeck(pool, ocean, { heard: new Set(), keep: () => true, n: 10, rand: () => 0.99 }).map((t) => t.id), [1]);
});

test('an instrumental acoustic song never matches a kelp ocean deck', () => {
  const s = f({ instrumentalness: 0.6, acousticness: 0.9 });
  assert.equal(deckMatches({ kind: 'ocean', water: 'kelp', depth: 'popular' }, s, 'popular'), false);
  assert.equal(deckMatches({ kind: 'ocean', water: 'blue', depth: 'popular' }, s, 'popular'), true);
  assert.equal(deckMatches({ kind: 'sound', id: 'acoustic' }, s), true);
});

test('ocean matching requires the candidate depth', () => {
  const ocean: Deck = { kind: 'ocean', water: 'reef', depth: 'popular' };
  assert.equal(deckMatches(ocean, f()), false);
  assert.equal(deckMatches(ocean, f(), 'buried'), false);
  assert.equal(deckMatches(ocean, f(), 'popular'), true);
});

test('ocean labels describe the place and optional species in plain words', () => {
  const ocean: Deck = { kind: 'ocean', water: 'midnight', depth: 'buried' };
  assert.equal(deckLabel(ocean), 'Midnight · Buried');
  const labels: [Species, string][] = [
    ['jelly', 'Quiet'], ['turtle', 'Slow'], ['puffer', 'Loud'], ['darter', 'Fast'], ['clown', 'In between'],
  ];
  for (const [species, label] of labels) assert.equal(deckLabel({ ...ocean, species }), `${label} songs in Midnight · Buried`);
});

test('ocean keys distinguish water, depth and species from every existing deck', () => {
  const ocean: Deck = { kind: 'ocean', water: 'midnight', depth: 'buried' };
  const keys = [
    deckKey(ocean), deckKey({ ...ocean, water: 'blue' }), deckKey({ ...ocean, depth: 'gems' }),
    deckKey({ ...ocean, species: 'darter' }), deckKey({ ...ocean, species: 'puffer' }),
    ...allDecks().map(deckKey),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(deckKey({ ...ocean }), deckKey(ocean));
});

test('deck counts honor ocean depth and species', () => {
  const ocean: Deck = { kind: 'ocean', water: 'reef', depth: 'gems' };
  const fast: Deck = { ...ocean, species: 'darter' };
  const pool = [
    cand(1, 'a', f(), 'gems'), cand(2, 'b', f({ tempo: 125 }), 'gems'),
    cand(3, 'c', f({ tempo: 125 }), 'popular'), cand(4, 'd', f({ tempo: 125 }), 'gems'),
  ];
  const counts = deckCounts(pool, [ocean, fast], new Set([4]));
  assert.equal(counts.get(deckKey(ocean)), 2);
  assert.equal(counts.get(deckKey(fast)), 1);
});

test('ocean remaining counts separate songs from artists after all filters', async () => {
  const { oceanDeckLeft } = await import('./decks.ts');
  const ocean: Deck = { kind: 'ocean', water: 'reef', depth: 'gems' };
  const pool = [
    cand(1, 'a', f({ tempo: 125 }), 'gems'), cand(2, 'a', f({ tempo: 125 }), 'gems'),
    cand(3, 'b', f(), 'gems'), cand(4, 'heard', f(), 'gems'),
    cand(5, 'excluded', f(), 'gems'), cand(6, 'wrong-depth', f(), 'popular'),
    cand(7, 'wrong-water', f({ acousticness: 0.9 }), 'gems'),
  ];
  const heard = new Set([4]);
  const keep = (artist: string) => artist !== 'excluded';
  assert.deepEqual(oceanDeckLeft(pool, ocean, heard, keep), { songs: 3, artists: 2 });
  assert.deepEqual(oceanDeckLeft(pool, { ...ocean, species: 'darter' }, heard, keep), { songs: 2, artists: 1 });
  assert.deepEqual(oceanDeckLeft([], ocean, heard, keep), { songs: 0, artists: 0 });
});

test('catalog depths survive the run/deck pool and saved-track lookup', async (t) => {
  // Metro's bundled JSON require, backed by real catalog files in Node.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'require');
  Object.defineProperty(globalThis, 'require', { value: createRequire(import.meta.url), configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'require', previous);
    else Reflect.deleteProperty(globalThis, 'require');
  });
  const { catalogTrackById, deckPool, depthOfTrack, runCandidates } = await import('./pool.ts');

  await t.test('catalog lookup uses band and rank even without sound data or saved popularity', () => {
    // Pop: Rihanna hit/deep cut, Sterling Knight hit/mixed-only track.
    const examples: [number, Depth][] = [[1441154439, 'popular'], [1443061969, 'deepcuts'], [1440624405, 'gems'], [1440624406, 'buried']];
    for (const [id, depth] of examples) {
      assert.ok(catalogTrackById(id));
      assert.equal(depthOfTrack(track(id)), depth);
    }
  });

  await t.test('genre-relative catalog bands beat the live listener cutoff', () => {
    const known = catalogTrackById(6787082268)!; // Uncle Waffles, popular in Amapiano at 58,881 listeners.
    assert.ok(known.artistListeners! <= 100_000);
    assert.equal(depthOfTrack(known), 'popular');
    assert.equal(depthOfTrack({ ...known, artistListeners: 1, trackRank: 100 }), 'popular');
  });

  await t.test('every measured deck candidate carries the same depth as its saved track', () => {
    const candidates = runCandidates();
    const pool = deckPool();
    assert.ok(pool.length > 0);
    assert.equal(pool.length, candidates.length);
    assert.equal(new Set(pool.map((c) => c.track.id)).size, pool.length);
    for (let i = 0; i < pool.length; i++) {
      assert.equal(pool[i].depth, depthOfTrack(pool[i].track));
      assert.equal(pool[i].depth, candidates[i].depth);
    }
  });

  await t.test('songs outside the catalog use live bands and default unknowns to Popular', () => {
    assert.equal(catalogTrackById(-1), null);
    assert.equal(depthOfTrack(track(-1)), 'popular');
    assert.equal(depthOfTrack({ ...track(-1), artistListeners: 100_000, trackRank: 3 }), 'gems');
    assert.equal(depthOfTrack({ ...track(-1), artistListeners: 100_001, trackRank: 4 }), 'deepcuts');
  });
});
