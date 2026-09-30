import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanNote, djLine, matchItunes, parsePlays, rankPicks, usefulNote, type DjPick } from './dj-picks.ts';

const play = (over: Record<string, unknown> = {}) => ({
  id: 1,
  play_type: 'trackplay',
  airdate: '2026-09-29T22:24:00-07:00',
  artist: 'GWEN',
  song: 'POP!',
  album: 'POP!',
  rotation_status: 'Heavy',
  comment: '',
  is_local: false,
  location_name: null,
  show: 67927,
  ...over,
});

test('parsePlays: keeps real song plays, drops air breaks and repeats', () => {
  const picks = parsePlays({
    results: [
      play(),
      play({ id: 2, play_type: 'airbreak', artist: null, song: null }),
      play({ id: 3 }), // the same song again later
      play({ id: 4, artist: 'Lime Garden', song: 'Moving Target', rotation_status: 'R/N', is_local: true }),
      play({ id: 5, artist: '', song: 'x' }),
    ],
  });
  assert.deepEqual(picks.map((p) => p.artist), ['GWEN', 'Lime Garden']);
  assert.equal(picks[1].isLocal, true);
  assert.equal(picks[0].showId, 67927);
});

test('rankPicks: songs with a DJ note or in rotation come first, one song per artist', () => {
  const picks = parsePlays({
    results: [
      play({ id: 1, artist: 'A', song: 'a', rotation_status: null, comment: '' }),
      play({ id: 2, artist: 'B', song: 'b', rotation_status: 'Heavy', comment: 'New record out Friday.' }),
      play({ id: 3, artist: 'C', song: 'c', rotation_status: 'Light', comment: '' }),
      play({ id: 4, artist: 'B', song: 'b2', rotation_status: 'Heavy', comment: 'Also great.' }),
    ],
  });
  const ranked = rankPicks(picks, () => 0.5);
  assert.equal(ranked[0].artist, 'B');
  assert.equal(ranked.filter((p) => p.artist === 'B').length, 1);
  assert.equal(ranked[ranked.length - 1].artist, 'A');
});

test('cleanNote: strips links, tidies space, and trims long notes at a word', () => {
  assert.equal(cleanNote('New record from the L.A. band out October 16th! https://notdummy.bandcamp.com'), 'New record from the L.A. band out October 16th!');
  assert.equal(cleanNote('  line one\n\nline   two '), 'line one line two');
  const long = cleanNote('word '.repeat(80));
  assert.ok(long.length <= 201 && long.endsWith('…'));
  assert.equal(cleanNote(null), '');
});

test('matchItunes: finds the same song by the same artist, ignoring "feat." and punctuation', () => {
  const results = [
    { wrapperType: 'track', trackId: 1, artistName: 'Gwen Stefani', trackName: 'Pop' },
    { wrapperType: 'track', trackId: 2, artistName: 'GWEN', trackName: 'POP! (feat. Someone)', previewUrl: 'x' },
  ];
  assert.equal(matchItunes(results, 'GWEN', 'POP!')?.trackId, 2);
  assert.equal(matchItunes(results, 'Lime Garden', 'Moving Target'), null);
});

test('matchItunes: a result without a preview is no use', () => {
  assert.equal(matchItunes([{ wrapperType: 'track', trackId: 3, artistName: 'GWEN', trackName: 'POP!' }], 'GWEN', 'POP!'), null);
});

test('djLine: who played it, how long ago, and how much they play it', () => {
  const pick = { airdate: '2026-09-29T22:24:00-07:00', rotation: 'Heavy' } as DjPick;
  const now = Date.parse('2026-09-30T08:24:00Z'); // 3 hours later
  assert.equal(djLine(pick, { host: 'Atticus', program: 'Variety Mix' }, now), 'Played 3h ago by Atticus on Variety Mix · heavy rotation');
  assert.equal(djLine({ ...pick, rotation: null }, null, Date.parse('2026-09-30T05:44:00Z')), 'Played 20m ago on KEXP');
  assert.equal(djLine({ ...pick, rotation: 'R/N' }, { host: 'Troy', program: null }, now), 'Played 3h ago by Troy · just added');
});

test('usefulNote: keeps what\'s new and when, drops "watch the video" filler', () => {
  assert.equal(
    usefulNote('New from Vancouver, BC\'s Art d\'Ecco. Check out the official video for "Disappear Here" below.'),
    'New from Vancouver, BC\'s Art d\'Ecco.'
  );
  assert.equal(
    usefulNote('New record from the L.A. band out October 16th! https://notdummy.bandcamp.com'),
    'New record from the L.A. band out October 16th!'
  );
  assert.equal(usefulNote('Watch the video here. Stream it on Spotify!'), '');
});

test('usefulNote: tour dates read as one line', () => {
  assert.equal(
    usefulNote('Playing: - Portland September 30 @ Polaris Hall - San Francisco Oct 4'),
    'Playing: Portland September 30 @ Polaris Hall, San Francisco Oct 4'
  );
});

test('usefulNote: at most two sentences and ~160 characters', () => {
  const note = usefulNote('One fact here. Second fact here. Third fact here that is extra.');
  assert.equal(note, 'One fact here. Second fact here.');
  assert.ok(usefulNote('word '.repeat(60)).length <= 161);
});

test('usefulNote: on-air shout-outs are dropped', () => {
  assert.equal(usefulNote('Welcome back, John!'), '');
  assert.equal(usefulNote('Dedicated to Christa Pike'), '');
});
