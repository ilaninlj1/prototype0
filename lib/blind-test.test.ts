import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listGenres,
  pickTestSongs,
  scoreTest,
  songToTrack,
  testComparison,
  testHeadline,
  testShareText,
  testSongs,
  testVerdict,
} from './blind-test.ts';
import type { PoolSong } from './game-pool.ts';

const genres = ['Country', 'Metal', 'Jazz', 'Pop', 'Rock', 'House', 'Salsa'];
const pool: PoolSong[] = genres.flatMap((g) =>
  Array.from({ length: 6 }, (_, i) => ({ artist: `${g}${i}`, title: `t${i}`, previewUrl: '', artworkUrl: '', listeners: 1000, genre: g, itunesTrackId: 1 }))
);

test('pickTestSongs deals 5 never + 5 other with distinct artists', () => {
  for (let k = 0; k < 20; k++) {
    const items = pickTestSongs(pool, ['Country', 'Metal']);
    assert.equal(items.length, 10);
    assert.equal(items.filter((x) => x.isNever).length, 5);
    assert.ok(items.filter((x) => x.isNever).every((x) => ['Country', 'Metal'].includes(x.song.genre)));
    assert.ok(items.filter((x) => !x.isNever).every((x) => !['Country', 'Metal'].includes(x.song.genre)));
    assert.equal(new Set(items.map((x) => x.song.artist)).size, 10);
  }
});

test('pickTestSongs spreads the never half across the chosen genres', () => {
  const items = pickTestSongs(pool, ['Country', 'Metal']).filter((x) => x.isNever);
  const country = items.filter((x) => x.song.genre === 'Country').length;
  assert.ok(country === 2 || country === 3);
});

test('pickTestSongs returns [] when a half cannot be filled', () => {
  assert.deepEqual(pickTestSongs(pool.filter((s) => s.genre !== 'Country' || s.artist === 'Country0'), ['Country']), []);
});

test('scoreTest counts likes on each half', () => {
  const items = pickTestSongs(pool, ['Jazz']);
  const liked = items.map((x) => x.isNever);
  assert.deepEqual(scoreTest(items, liked), { neverLiked: 5, otherLiked: 0 });
});

test('result wording', () => {
  assert.equal(testHeadline(['Country'], 4), 'You said never Country. You liked 4 of 5 blind.');
  assert.equal(testHeadline(['Country', 'Metal', 'Jazz'], 1), 'You said never Country, Metal & Jazz. You liked 1 of 5 blind.');
  assert.equal(testComparison(2), '…and 2 of 5 of everything else.');
  assert.equal(testVerdict(3, 3), 'Your blind spot is real.');
  assert.equal(testVerdict(1, 3), 'Fair, your ears agree with you.');
  assert.equal(testShareText(['Country', 'Metal'], 4), 'My Blindspot: said never Country & Metal, liked 4/5 blind 👀');
});

test('songToTrack uses the real iTunes id and an Apple Music link, and keeps the listener count', () => {
  const a = songToTrack({ ...pool[0], itunesTrackId: 555 });
  assert.equal(a.id, 555);
  assert.equal(a.trackViewUrl, 'https://music.apple.com/us/song/555');
  assert.equal(a.artistListeners, 1000);
});

test('testSongs keeps each song with whether it was a never and whether you liked it', () => {
  const song = (id: number, genre: string): PoolSong => ({ artist: `A${id}`, title: `T${id}`, previewUrl: `p${id}`, artworkUrl: `a${id}`, listeners: 1000, genre, itunesTrackId: id });
  const items = [
    { song: song(1, 'Country'), isNever: true },
    { song: song(2, 'Jazz'), isNever: false },
  ];
  assert.deepEqual(testSongs(items, [true, false]), [
    { trackId: 1, title: 'T1', artist: 'A1', genre: 'Country', previewUrl: 'p1', artworkUrl: 'a1', isNever: true, liked: true },
    { trackId: 2, title: 'T2', artist: 'A2', genre: 'Jazz', previewUrl: 'p2', artworkUrl: 'a2', isNever: false, liked: false },
  ]);
});

test('listGenres joins like the headline', () => {
  assert.equal(listGenres(['Country']), 'Country');
  assert.equal(listGenres(['Country', 'Metal', 'Jazz']), 'Country, Metal & Jazz');
});
