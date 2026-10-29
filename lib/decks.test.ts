import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allDecks, deckCounts, deckKey, deckLabel, deckMatches, pickDeck, SOUND_DECKS, soundTiles, TEMPO_BANDS, type Deck, type DeckCandidate } from './decks.ts';
import type { DiscoveryTrack } from './discovery.ts';
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
const cand = (id: number, artist: string, sound: SoundFeatures): DeckCandidate => ({ track: track(id), artist, sound });

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
