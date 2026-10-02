import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { Baselines, Cuts, GenreSound } from './genre-sound.ts';
import {
  acrossFindings,
  decodedSaves,
  genreFindings,
  isFullyMeasured,
  MEASURES,
  parseSongFeel,
  position,
  SIDE_WORDS,
  sideOf,
  songGenre,
  type DecodedSong,
  type Measure,
} from './taste-decoded.ts';
import type { SongFeel } from './tasteform.ts';

// A real answer, 2026-10-02, for Heidi Newfield's "Johnny And June" preview.
const RECCO = {
  acousticness: 0.6226,
  danceability: 0.5692,
  energy: 0.462,
  instrumentalness: 0.0038,
  liveness: 0.1187,
  loudness: -8.9531,
  speechiness: 0.0401,
  tempo: 138.2334,
  valence: 0.3772,
};

test('parseSongFeel keeps all 9 numbers ReccoBeats returns', () => {
  assert.deepEqual(parseSongFeel(RECCO), RECCO);
});

test('parseSongFeel rejects answers without energy or valence', () => {
  assert.equal(parseSongFeel(null), null);
  assert.equal(parseSongFeel({ error: 'bad file' }), null);
  assert.equal(parseSongFeel({ energy: 0.5 }), null);
  assert.equal(parseSongFeel({ energy: 'high', valence: 0.2 }), null);
});

test('parseSongFeel drops non-number extras instead of keeping junk', () => {
  assert.deepEqual(parseSongFeel({ energy: 0.5, valence: 0.2, tempo: 120, liveness: 'n/a' }), { energy: 0.5, valence: 0.2, tempo: 120 });
});

test('isFullyMeasured needs all 8 measures; songs measured before 2026-10-02 are not', () => {
  assert.equal(isFullyMeasured(parseSongFeel(RECCO)!), true);
  assert.equal(isFullyMeasured({ energy: 0.5, valence: 0.2, tempo: 120 }), false);
  assert.equal(isFullyMeasured(undefined), false);
});

test('every measure has a word for each side', () => {
  for (const m of MEASURES) {
    assert.ok(SIDE_WORDS[m].low);
    assert.ok(SIDE_WORDS[m].high);
  }
});

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const EVEN: Cuts = [0.1, 0.25, 0.5, 0.75, 0.9];
const sound = (cuts: Cuts = EVEN): GenreSound => ({ n: 30, cuts: Object.fromEntries(MEASURES.map((m) => [m, cuts])) as GenreSound['cuts'] });
const B: Baselines = { measuredAt: '2026-10-02', genres: { Country: sound(), Jazz: sound(), Metal: sound(), Soul: sound() }, all: sound() };
const middle = () => Object.fromEntries(MEASURES.map((m) => [m, 0.5])) as Record<Measure, number>;
const feel = (o: Partial<Record<Measure, number>> = {}): SongFeel => ({ tempo: 120, ...middle(), ...o });
const song = (id: number, genre: string | null, o: Partial<Record<Measure, number>> = {}): DecodedSong => ({
  id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  artworkUrl: '',
  previewUrl: '',
  genre,
  feel: { ...middle(), ...o },
});
const save = (id: number, genre: string): DiscoveryTrack => ({
  id,
  trackName: `Song ${id}`,
  artistId: id,
  artistName: `Artist ${id}`,
  artworkUrl100: `art${id}`,
  primaryGenreName: genre,
  previewUrl: `clip${id}`,
  trackViewUrl: '',
  collectionName: null,
});

test('position reads straight-line between cut points', () => {
  near(position(0.375, EVEN), 37.5);
  near(position(0.25, EVEN), 25);
  near(position(0.8, EVEN), 80);
});

test('position is 5 below the 10th and 95 above the 90th', () => {
  assert.equal(position(0.01, EVEN), 5);
  assert.equal(position(0.99, EVEN), 95);
});

test('a value tied across several cut points takes their middle, so typical never reads as extreme', () => {
  const flat: Cuts = [0, 0, 0, 0.1, 0.5];
  assert.equal(position(0, flat), 30);
  assert.equal(sideOf(position(0, flat)), null);
  near(position(0.05, flat), 62.5);
});

test('sideOf: 25 and below is low, 75 and above is high', () => {
  assert.equal(sideOf(25), 'low');
  assert.equal(sideOf(25.1), null);
  assert.equal(sideOf(74.9), null);
  assert.equal(sideOf(75), 'high');
});

test('songGenre takes the first candidate the baselines know', () => {
  assert.equal(songGenre(['Country', 'Jazz'], B), 'Country');
  assert.equal(songGenre([undefined, 'Jazz'], B), 'Jazz');
  assert.equal(songGenre(['Hip-Hop/Rap'], B), null);
});

test('decodedSaves keeps fully measured saves; genre from the swipe log first, then the label; iTunes labels get none', () => {
  const liked = [save(1, 'Hip-Hop/Rap'), save(2, 'Jazz'), save(3, 'Hip-Hop/Rap'), save(4, 'Country')];
  const history = [{ trackId: 1, artistId: 1, genre: 'Country', action: 'like', timestamp: 1 }] as SwipeEntry[];
  const feels: Record<number, SongFeel> = { 1: feel(), 2: feel(), 3: feel(), 4: { energy: 0.5, valence: 0.5, tempo: 120 } };
  assert.deepEqual(
    decodedSaves(liked, history, feels, B).map((s) => [s.id, s.genre]),
    [
      [1, 'Country'],
      [2, 'Jazz'],
      [3, null],
    ]
  );
});

test('genre twist speaks at 3 saves on one side, with every save in the genre as evidence', () => {
  const f = genreFindings([song(1, 'Jazz', { loudness: 0.95 }), song(2, 'Jazz', { loudness: 0.8 }), song(3, 'Jazz', { loudness: 0.92 })], B);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, 'genre:Jazz:loudness:high');
  assert.equal(f[0].sentence, "You don't just like Jazz. You like loud Jazz.");
  assert.deepEqual(
    f[0].evidence.map((e) => e.song.id),
    [1, 2, 3]
  );
  assert.equal(f[0].strength, 3 / 8);
});

test('genre twist stays quiet one save below the bar, and under 75% on a side', () => {
  assert.deepEqual(genreFindings([song(1, 'Jazz', { loudness: 0.95 }), song(2, 'Jazz', { loudness: 0.95 })], B), []);
  const half = [0.95, 0.95, 0.5, 0.5].map((l, i) => song(i + 1, 'Jazz', { loudness: l }));
  assert.deepEqual(genreFindings(half, B), []);
  const threeOfFour = [0.95, 0.95, 0.95, 0.5].map((l, i) => song(i + 1, 'Jazz', { loudness: l }));
  assert.equal(genreFindings(threeOfFour, B)[0].strength, 0.75 * (4 / 8));
});

test('songs without a genre never form a genre twist', () => {
  assert.deepEqual(genreFindings([1, 2, 3].map((id) => song(id, null, { loudness: 0.95 })), B), []);
});

test('a genre the baselines left out is placed against the all row', () => {
  const b: Baselines = { ...B, all: sound([0.6, 0.7, 0.8, 0.9, 0.95]) };
  assert.equal(genreFindings([1, 2, 3].map((id) => song(id, 'Polka')), b)[0]?.id, 'genre:Polka:energy:low');
});

const acoustic = (genres: (string | null)[]) => genres.map((g, i) => song(i + 1, g, { acousticness: 0.95 }));

test('across everything needs 6 saves over 3 genres; songs without a genre still count toward the 6', () => {
  const f = acrossFindings(acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal', null]), B);
  assert.equal(f[0].id, 'across:*:acousticness:high');
  assert.equal(f[0].sentence, '3 genres, one habit: everything you save is acoustic.');
  assert.deepEqual(acrossFindings(acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal']), B), [], '5 saves');
  assert.deepEqual(acrossFindings(acoustic(['Jazz', 'Jazz', 'Jazz', 'Country', 'Country', null]), B), [], '2 genres');
});

test('across everything says "almost" below 100%', () => {
  const songs = [...acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal', 'Metal', 'Soul']), song(8, 'Soul')];
  assert.equal(acrossFindings(songs, B)[0].sentence, '4 genres, one habit: almost everything you save is acoustic.');
});
