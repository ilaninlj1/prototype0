import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { SpotifyLike } from './spotify.ts';
import {
  biggest,
  calledStories,
  decades,
  decisionSpeed,
  findClock,
  hitRate,
  iceberg,
  listenerType,
  listeningAge,
  mainstream,
  newToYou,
  range,
  receipt,
  streaks,
  topArtists,
} from './you-stats.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function find(id: number, artist: string, listeners: number | undefined, likedAt: number, genre = 'Pop'): DiscoveryTrack {
  return {
    id,
    trackName: `Song ${id}`,
    artistId: id,
    artistName: artist,
    artworkUrl100: '',
    primaryGenreName: genre,
    previewUrl: '',
    trackViewUrl: '',
    collectionName: null,
    artistListeners: listeners,
    likedAt,
  };
}

const swipe = (trackId: number, action: SwipeEntry['action'], listenMs?: number, timestamp = 0, genre = 'Pop'): SwipeEntry => ({
  trackId,
  artistId: trackId,
  genre,
  action,
  timestamp,
  listenMs,
});

const song = (artist: string, released?: number, popularity?: number, addedAt = at(2021, 1, 1)): SpotifyLike => ({
  id: `${artist}${released}${addedAt}`,
  name: 'x',
  artist,
  art: '',
  addedAt,
  from: '',
  source: 'file',
  popularity,
  released,
});

// ---------- Blindspot ----------

test('hitRate: one in how many songs you hear you save, and whether you got pickier', () => {
  const history = [
    ...Array.from({ length: 30 }, (_, i) => swipe(i, i % 3 === 0 ? 'like' : 'skip', 5000, i)),
    ...Array.from({ length: 30 }, (_, i) => swipe(100 + i, i % 10 === 0 ? 'like' : 'skip', 5000, 100 + i)),
  ];
  const r = hitRate(history);
  assert.equal(r.heard, 60);
  assert.equal(r.saved, 13);
  assert.equal(r.oneIn, 5);
  assert.equal(r.trend, 'pickier', 'saved 1 in 3 early on, 1 in 10 lately');
  assert.equal(hitRate([swipe(1, 'skip')]).oneIn, null, 'nothing saved yet');
  assert.equal(hitRate(history.slice(0, 10)).trend, null, 'too few songs to call a trend');
});

test('iceberg: artists you found, by how many listeners they had when you found them', () => {
  const tiers = iceberg([
    find(1, 'Big', 3_000_000, 1),
    find(2, 'Mid', 400_000, 2),
    find(3, 'Small', 40_000, 3),
    find(4, 'Tiny', 900, 4),
    find(5, 'Tiny', 1_200, 5),
    find(6, 'Unknown', undefined, 6),
  ]);
  assert.deepEqual(
    tiers.map((t) => [t.name, t.artists.map((a) => a.artist)]),
    [
      ['Famous', ['Big']],
      ['Known', ['Mid']],
      ['Deep', ['Small']],
      ['Buried', ['Tiny']],
    ],
    'each artist once, and artists with no count left out'
  );
});

test('decisionSpeed: median seconds before you swipe, and how long songs you keep get', () => {
  const r = decisionSpeed([
    swipe(1, 'skip', 3000),
    swipe(2, 'skip', 5000),
    swipe(3, 'skip', 7000),
    swipe(4, 'like', 20000),
    swipe(5, 'steer-artist', 99000),
  ]);
  assert.equal(r?.median, 6, 'steering is not a decision');
  assert.equal(r?.skip, 5);
  assert.equal(r?.keep, 20);
  assert.equal(decisionSpeed([]), null);
});

test('findClock: when in the day you save songs, as 24 hours and a plain name for the peak', () => {
  const finds = [23, 23, 0, 1, 14].map((h, i) => find(i, 'A', 1, new Date(2026, 8, 1, h).getTime()));
  const c = findClock(finds);
  assert.equal(c.hours.length, 24);
  assert.equal(c.hours[23], 2);
  assert.equal(c.peak, 'late at night');
  assert.equal(findClock([]).peak, null);
});

test('streaks: days in a row you found something, now and at best', () => {
  const now = at(2026, 10, 3, 18);
  const finds = [at(2026, 9, 20), at(2026, 9, 21), at(2026, 9, 22), at(2026, 9, 23), at(2026, 10, 2), at(2026, 10, 3)].map(
    (t, i) => find(i, 'A', 1, t)
  );
  assert.deepEqual(streaks(finds, now), { current: 2, longest: 4, days: 6 });
  assert.equal(streaks([find(1, 'A', 1, at(2026, 9, 30))], now).current, 0, 'a gap since then breaks it');
});

test('range: genres you liked blind out of the ones you heard', () => {
  const finds = [find(1, 'A', 1, 1, 'Pop'), find(2, 'B', 1, 2, 'Jazz'), find(3, 'C', 1, 3, 'Pop')];
  const history = ['Pop', 'Jazz', 'Rock', 'Folk'].map((g, i) => swipe(i, 'skip', 1000, i, g));
  assert.deepEqual(range(finds, history), { liked: 2, heard: 4, top: 'Pop' });
});

test('listenerType picks one label, with the reason', () => {
  const base = {
    medianFound: 500_000,
    genresLiked: 2,
    peak: 'in the afternoon',
    oneIn: 6,
    decideSeconds: 12,
    called: 0,
    finds: 10,
  };
  assert.equal(listenerType({ ...base, called: 2 }).name, 'The Prophet');
  assert.equal(listenerType({ ...base, medianFound: 20_000 }).name, 'The Digger');
  assert.equal(listenerType({ ...base, genresLiked: 7 }).name, 'The Wanderer');
  assert.equal(listenerType({ ...base, peak: 'late at night' }).name, 'The Night Owl');
  assert.equal(listenerType({ ...base, oneIn: 15 }).name, 'The Critic');
  assert.equal(listenerType({ ...base, oneIn: 2 }).name, 'The Open Ear');
  assert.equal(listenerType({ ...base, decideSeconds: 3 }).name, 'The Quick Draw');
  assert.equal(listenerType(base).name, 'The Explorer');
  assert.equal(listenerType({ ...base, finds: 1, medianFound: 20_000 }).name, 'New Here', 'too early to tell');
  assert.match(listenerType({ ...base, medianFound: 20_000 }).why, /20K/);
});

test('receipt: your latest finds, priced in listeners', () => {
  const r = receipt(
    [find(1, 'A', 4_800, at(2026, 9, 1)), find(2, 'B', 1_200_000, at(2026, 9, 2)), find(3, 'C', undefined, at(2026, 9, 3))],
    10
  );
  assert.deepEqual(
    r.lines.map((l) => [l.artist, l.price]),
    [
      ['C', '?'],
      ['B', '1.2M'],
      ['A', '4.8K'],
    ]
  );
  assert.equal(r.total, 3);
});

// ---------- Spotify file ----------

test('listeningAge: the year your library sounds like, and where half of it sits', () => {
  const songs = [2004, 2009, 2014, 2016, 2019, 2021, 2024].map((y) => song('A', y));
  assert.deepEqual(listeningAge(songs), { year: 2016, from: 2009, to: 2021 });
  assert.equal(listeningAge([song('A')]), null, 'no release years, no age');
});

test('decades: how your library splits, biggest first', () => {
  const d = decades([song('A', 1999), song('A', 2014), song('A', 2016), song('A', 1975)]);
  assert.deepEqual(d, [
    { decade: '2010s', count: 2, share: 0.5 },
    { decade: '1990s', count: 1, share: 0.25 },
    { decade: '1970s', count: 1, share: 0.25 },
  ]);
});

test('biggest: your biggest year and day of saving', () => {
  const songs = [at(2021, 3, 3), at(2021, 3, 3, 15), at(2021, 3, 3, 18), at(2021, 6, 1), at(2019, 1, 1)].map((t) =>
    song('A', 2000, 50, t)
  );
  const b = biggest(songs);
  assert.deepEqual(b.year, { year: 2021, count: 4 });
  assert.equal(b.day?.count, 3);
  assert.equal(new Date(b.day!.at).getDate(), 3);
  assert.equal(biggest([song('A', 2000, 50, at(2021, 1, 1))]).day, null, 'one song is not a big day');
});

test('mainstream: median Spotify popularity, in words', () => {
  assert.deepEqual(mainstream([80, 70, 75].map((p) => song('A', 2000, p))), { score: 75, label: 'very mainstream' });
  assert.equal(mainstream([20, 25].map((p) => song('A', 2000, p)))?.label, 'deep cuts');
  assert.equal(mainstream([song('A')]), null);
});

test('topArtists: most-saved artists first, by everyone credited', () => {
  const t = topArtists([song('Drake, Future'), song('Drake'), song('Adele'), song('Drake')], 2);
  assert.deepEqual(t, [
    { artist: 'Drake', count: 3 },
    { artist: 'Adele', count: 1 },
  ]);
});

test('newToYou: share of blind finds whose artists are nowhere in your Spotify', () => {
  const finds = [find(1, 'Drake', 1, 1), find(2, 'Tiny Band', 1, 2), find(3, 'Other', 1, 3), find(4, 'Drake', 1, 4)];
  assert.deepEqual(newToYou(finds, [song('Drake')]), { fresh: 2, of: 4, share: 0.5 });
  assert.equal(newToYou(finds, []), null, 'no Spotify file, nothing to compare');
});

// ---------- The Called It story ----------

test('calledStories: finds that grew since you found them, biggest growth first', () => {
  const finds = [
    find(1, 'Grew A Lot', 26_400, at(2026, 9, 30)),
    find(2, 'Grew A Little', 10_000, at(2026, 9, 1)),
    find(3, 'Shrank', 50_000, at(2026, 8, 1)),
    find(4, 'No Count Then', undefined, at(2026, 8, 1)),
    find(5, 'No Count Now', 1_000, at(2026, 8, 1)),
    find(6, 'Grew A Lot', 26_400, at(2026, 10, 1)),
  ];
  const now = { 'Grew A Lot': 68_500, 'Grew A Little': 10_500, Shrank: 40_000, 'No Count Then': 9_999 };
  const stories = calledStories(finds, now);
  assert.deepEqual(
    stories.map((s) => [s.track.artistName, s.pct]),
    [
      ['Grew A Lot', 159],
      ['Grew A Little', 5],
    ],
    'one story per artist, from the first time you found them'
  );
  assert.equal(stories[0].track.id, 1);
  assert.equal(stories[0].found, 26_400);
  assert.equal(stories[0].now, 68_500);
  assert.deepEqual(calledStories([], {}), []);
});
