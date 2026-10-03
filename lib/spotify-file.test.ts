import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { fileSongs, filesFromZip, parseCsv, readExport } from './spotify-file.ts';

const HEADER =
  'Track URI,Track Name,Artist URI(s),Artist Name(s),Album URI,Album Name,Album Artist URI(s),Album Artist Name(s),Album Release Date,Album Image URL,Disc Number,Track Number,Track Duration (ms),Track Preview URL,Explicit?,Popularity,ISRC,Added By,Added At';

const row = (id: string, name: string, artists: string, released: string, popularity: number, addedBy: string, addedAt: string) =>
  [
    `spotify:track:${id}`,
    name,
    'spotify:artist:x',
    artists,
    'spotify:album:y',
    'Album',
    'spotify:artist:x',
    artists,
    released,
    'https://i.scdn.co/image/abc',
    1,
    1,
    200000,
    '',
    false,
    popularity,
    'ISRC1',
    addedBy,
    addedAt,
  ]
    .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
    .join(',');

test('parseCsv handles quotes, commas, escaped quotes and newlines inside quotes', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"x, y","say ""hi"""\n2,"two\nlines",z\n'), [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', 'two\nlines', 'z'],
  ]);
  assert.deepEqual(
    parseCsv('a,b\r\n1,2\r\n'),
    [
      ['a', 'b'],
      ['1', '2'],
    ],
    'Windows line endings'
  );
});

test('a liked-songs file: every row, with popularity and release year kept for stats', () => {
  const csv = [HEADER, row('T1', 'Song One', 'Ajebutter22,Wizkid', '2014-05-02', 41, '', '2019-04-02T21:15:00Z')].join('\n');
  const songs = fileSongs([{ name: 'Liked_Songs.csv', text: csv }]);
  assert.deepEqual(songs, [
    {
      id: 'T1',
      name: 'Song One',
      artist: 'Ajebutter22, Wizkid',
      art: 'https://i.scdn.co/image/abc',
      addedAt: Date.UTC(2019, 3, 2, 21, 15),
      from: '',
      source: 'file',
      popularity: 41,
      released: 2014,
    },
  ]);
});

test('playlist files keep only the songs you added: you are whoever added the most', () => {
  const mine = 'spotify:user:me';
  const road = [
    HEADER,
    row('A', 'Mine 1', 'X', '2020', 10, mine, '2021-01-01T00:00:00Z'),
    row('B', 'Mine 2', 'Y', '2021-03', 20, mine, '2021-02-01T00:00:00Z'),
    row('C', 'Friend', 'Z', '2022', 30, 'spotify:user:friend', '2021-03-01T00:00:00Z'),
  ].join('\n');
  const followed = [HEADER, row('D', 'Curated', 'W', '2023', 90, 'spotify:user:spotify', '2024-01-01T00:00:00Z')].join('\n');
  const songs = fileSongs([
    { name: 'Road_Trip.csv', text: road },
    { name: 'Todays_Top_Hits.csv', text: followed },
  ]);
  assert.deepEqual(
    songs.map((s) => [s.id, s.from, s.released]),
    [
      ['B', 'Road Trip', 2021],
      ['A', 'Road Trip', 2020],
    ]
  );
});

test('rows without a usable id or date are skipped; local files have no Spotify id', () => {
  const csv = [
    HEADER,
    row('', 'Local file', 'X', '2020', 0, '', '2021-01-01T00:00:00Z'),
    row('E', 'No date', 'X', '2020', 0, '', ''),
  ].join('\n');
  assert.deepEqual(fileSongs([{ name: 'Liked_Songs.csv', text: csv }]), []);
});

test('readExport says what it found, or why it found nothing', () => {
  const liked = [HEADER, row('T1', 'Song', 'A', '2014', 41, '', '2019-04-02T21:15:00Z')].join('\n');
  assert.equal(readExport([{ name: 'Liked_Songs.csv', text: liked }]).songs.length, 1);
  assert.equal(readExport([{ name: 'notes.csv', text: 'hello,world\n1,2' }]).problem, 'not-exportify');
  assert.equal(readExport([]).problem, 'empty');
});

test('a ZIP of every playlist opens into its CSV files', () => {
  const liked = [HEADER, row('T1', 'Song', 'A', '2014', 41, '', '2019-04-02T21:15:00Z')].join('\n');
  const zip = zipSync({
    'Liked_Songs.csv': strToU8(liked),
    '__MACOSX/._Liked_Songs.csv': strToU8('junk'),
    'readme.txt': strToU8('x'),
  });
  assert.deepEqual(
    filesFromZip(zip).map((f) => f.name),
    ['Liked_Songs.csv']
  );
});
