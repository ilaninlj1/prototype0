import assert from 'node:assert/strict';
import { test } from 'node:test';

import { importHeadline, leftOutLine, mergeIntoLibrary, parseWhen, readImport, type ImportReport } from './import-file.ts';
import { IMPORT_SAMPLES } from './import-samples.ts';

const NOW = Date.UTC(2026, 10, 3);
const read = (name: string, text: string) => readImport([{ name, text }], NOW);
const group = (r: ImportReport, reason: string) => r.skipped.find((g) => g.reason === reason);

const EXPORTIFY =
  'Track URI,Track Name,Artist URI(s),Artist Name(s),Album URI,Album Name,Album Artist URI(s),Album Artist Name(s),Album Release Date,Album Image URL,Disc Number,Track Number,Track Duration (ms),Track Preview URL,Explicit?,Popularity,ISRC,Added By,Added At';
const exportify = (uri: string, name: string, artist: string, addedBy: string, addedAt: string) =>
  [uri, name, 'a', artist, 'b', 'Album', 'a', artist, '2014', 'https://i/x', 1, 1, 200000, '', false, 41, 'I', addedBy, addedAt].join(',');

// ---------- Dates ----------

test('parseWhen reads the date formats real exports use, as UTC when no zone is given', () => {
  assert.equal(parseWhen('2021-03-14T10:00:00Z', NOW), Date.UTC(2021, 2, 14, 10));
  assert.equal(parseWhen('2023-01-05 14:33', NOW), Date.UTC(2023, 0, 5, 14, 33));
  assert.equal(parseWhen('2021-03-14', NOW), Date.UTC(2021, 2, 14));
  assert.equal(parseWhen('5/6/2019', NOW), Date.UTC(2019, 4, 6));
  assert.equal(parseWhen('05 Jan 2023, 14:33', NOW), Date.UTC(2023, 0, 5, 14, 33));
  assert.equal(parseWhen('1672929180', NOW), 1672929180000);
  assert.equal(parseWhen(1672929180000, NOW), 1672929180000);
  assert.equal(parseWhen({ uts: '1672929180' }, NOW), 1672929180000);
});

test('parseWhen refuses text, impossible days, the future and the epoch zero', () => {
  for (const bad of ['not a date', '2021-13-45', '2023-02-30', '13/45/2020', '2099-01-01', '1970-01-01', 0, null, {}, 'Jan'])
    assert.equal(parseWhen(bad, NOW), null, String(bad));
});

// ---------- Exportify ----------

test('an Exportify file: good rows come in, and each bad row is named by its spreadsheet row and reason', () => {
  const csv = [
    EXPORTIFY,
    exportify('spotify:track:T1', 'Good', 'A', '', '2019-04-02T21:15:00Z'),
    exportify('spotify:track:T2', '', 'A', '', '2019-04-02T21:15:00Z'),
    exportify('spotify:track:T3', 'No artist', '', '', '2019-04-02T21:15:00Z'),
    exportify('spotify:track:T4', 'Bad date', 'A', '', 'soon'),
    exportify('spotify:local:x', 'My demo', 'A', '', '2019-04-02T21:15:00Z'),
  ].join('\n');
  const r = read('Liked_Songs.csv', csv);
  assert.deepEqual(r.songs.map((s) => s.id), ['T1']);
  assert.equal(r.songs[0].source, 'file');
  assert.equal(r.songs[0].popularity, 41);
  assert.equal(r.skippedCount, 4);
  assert.deepEqual(group(r, 'no-title')!.rows, ['Row 3 · by A']);
  assert.deepEqual(group(r, 'no-artist')!.rows, ['Row 4 · “No artist”']);
  assert.deepEqual(group(r, 'bad-date')!.rows, ['Row 5 · “Bad date” by A']);
  assert.deepEqual(group(r, 'no-link')!.rows, ['Row 6 · “My demo” by A']);
  assert.equal(r.files[0].kind, 'Exportify export');
});

test('songs someone else added to a followed playlist are left out on purpose, not called errors', () => {
  const csv = (rows: string[]) => [EXPORTIFY, ...rows].join('\n');
  const r = readImport(
    [
      {
        name: 'Mine.csv',
        text: csv([
          exportify('spotify:track:M1', 'One', 'A', 'me', '2020-01-01T00:00:00Z'),
          exportify('spotify:track:M2', 'Two', 'B', 'me', '2020-01-01T00:00:00Z'),
        ]),
      },
      { name: 'Followed.csv', text: csv([exportify('spotify:track:F1', 'Three', 'C', 'dj', '2020-01-01T00:00:00Z')]) },
    ],
    NOW
  );
  assert.equal(r.songs.length, 2);
  assert.equal(r.skippedCount, 0);
  assert.equal(r.leftOut.notYours, 1);
});

// ---------- Spotify's own JSON ----------

test('Spotify listening history: plays become songs dated at their first play', () => {
  const r = read(
    'StreamingHistory_music_0.json',
    JSON.stringify([
      { endTime: '2023-02-01 10:00', artistName: 'Sade', trackName: 'Smooth Operator', msPlayed: 240000 },
      { endTime: '2023-01-05 14:33', artistName: 'Sade', trackName: 'Smooth Operator', msPlayed: 240000 },
    ])
  );
  assert.equal(r.songs.length, 1);
  assert.equal(r.songs[0].addedAt, Date.UTC(2023, 0, 5, 14, 33));
  assert.equal(r.songs[0].undated, undefined);
  assert.equal(r.leftOut.repeats, 1);
  assert.equal(r.files[0].kind, 'Spotify listening history');
});

test('listening history: plays under 30 seconds do not count as knowing a song', () => {
  const r = read(
    'StreamingHistory_music_0.json',
    JSON.stringify([{ endTime: '2023-01-05 14:33', artistName: 'Sade', trackName: 'Skipped', msPlayed: 4000 }])
  );
  assert.equal(r.songs.length, 0);
  assert.equal(r.skippedCount, 0);
  assert.equal(r.leftOut.shortPlays, 1);
});

test('listening history: podcasts and Spotify’s Unknown Track placeholders are named as not coming in', () => {
  const r = read(
    'history.json',
    JSON.stringify([
      { endTime: '2023-01-05 14:33', podcastName: 'A Show', episodeName: 'Ep 1', msPlayed: 900000 },
      { endTime: '2023-01-05 14:33', artistName: 'Unknown Artist', trackName: 'Unknown Track', msPlayed: 900000 },
    ])
  );
  assert.deepEqual(group(r, 'not-a-song')!.rows, ['Item 1 · “Ep 1”']);
  assert.deepEqual(group(r, 'empty')!.rows, ['Item 2']);
});

test('extended history: the track URI becomes the id, and podcast rows are named', () => {
  const r = read(
    'Streaming_History_Audio_2019.json',
    JSON.stringify([
      {
        ts: '2019-06-01T12:00:00Z',
        ms_played: 180000,
        master_metadata_track_name: 'Blackbird',
        master_metadata_album_artist_name: 'The Beatles',
        spotify_track_uri: 'spotify:track:BB',
        episode_name: null,
      },
      { ts: '2019-06-01T13:00:00Z', ms_played: 900000, master_metadata_track_name: null, episode_name: 'Ep 9' },
    ])
  );
  assert.deepEqual(r.songs.map((s) => [s.id, s.name, s.artist]), [['BB', 'Blackbird', 'The Beatles']]);
  assert.equal(group(r, 'not-a-song')!.count, 1);
});

test('Spotify’s YourLibrary.json has no dates: songs come in marked undated, on today', () => {
  const r = read(
    'YourLibrary.json',
    JSON.stringify({
      tracks: [{ artist: 'Björk', album: 'Post', track: 'Hyperballad', uri: 'spotify:track:HB' }],
      albums: [{ artist: 'Björk', album: 'Post', uri: 'spotify:album:P' }],
    })
  );
  assert.equal(r.songs[0].id, 'HB');
  assert.equal(r.songs[0].undated, true);
  assert.equal(r.songs[0].addedAt, NOW);
});

// ---------- Any list of songs ----------

test('any CSV with song and artist columns works, whatever they call them, and a song with no id gets a stable one', () => {
  const a = read('mine.csv', 'SONG NAME,Artist Name,Album\nDreams,Fleetwood Mac,Rumours\n').songs;
  const b = read('other.csv', 'artist,title\nfleetwood mac,DREAMS\n').songs;
  assert.equal(a[0].name, 'Dreams');
  assert.equal(a[0].artist, 'Fleetwood Mac');
  assert.equal(a[0].undated, true);
  assert.equal(a[0].id, b[0].id);
  assert.ok(a[0].id.startsWith('song:'));
});

test('a CSV saved with semicolons or tabs still reads', () => {
  assert.equal(read('a.csv', 'Artist;Song\nSade;Jezebel\n').songs.length, 1);
  assert.equal(read('a.tsv', 'Artist\tSong\nSade\tJezebel\n').songs.length, 1);
});

test('a broken date is named, a blank one just makes the song undated', () => {
  const r = read('a.csv', 'Artist,Song,Date\nA,Broken,later\nB,Blank,\n');
  assert.deepEqual(r.songs.map((s) => [s.name, s.undated]), [['Blank', true]]);
  assert.deepEqual(group(r, 'bad-date')!.rows, ['Row 2 · “Broken” by A']);
});

test('fields of the wrong type count as missing, and an item that is not an object is named', () => {
  const r = read(
    'a.json',
    JSON.stringify([{ artist: 12, title: 'Num' }, { artist: 'A', title: null }, 'just text', { artist: 'A', title: 'Fine' }])
  );
  assert.deepEqual(r.songs.map((s) => s.name), ['Fine']);
  assert.equal(group(r, 'no-artist')!.count, 1);
  assert.equal(group(r, 'no-title')!.count, 1);
  assert.deepEqual(group(r, 'not-an-entry')!.rows, ['Item 3']);
});

test('a group counts every bad row but keeps only the first 50 to show', () => {
  const rows = Array.from({ length: 80 }, (_, i) => `,Song ${i}`).join('\n');
  const g = group(read('a.csv', `Artist,Song\n${rows}\nA,Good`), 'no-artist')!;
  assert.equal(g.count, 80);
  assert.equal(g.rows.length, 50);
});

// ---------- Whole files that can't be used ----------

test('whole-file problems say what is wrong in plain words and bring in nothing', () => {
  const problem = (name: string, text: string) => {
    const r = read(name, text);
    assert.equal(r.songs.length, 0, name);
    return r.files[0].problem!;
  };
  assert.match(problem('expenses.csv', 'date,amount,category\n2021-01-01,4,food'), /It has: date, amount, category/);
  assert.match(problem('songs.csv', 'Song,Album\nDreams,Rumours'), /no artist column/);
  assert.match(problem('empty.csv', ''), /empty/);
  assert.match(problem('head.csv', 'Artist,Song\n'), /no songs/);
  assert.match(problem('photo.csv', 'PNG\u0000\u0000\u0000'), /isn’t a text file/);
  assert.match(problem('broken.json', '{"a": oops'), /broken/);
  assert.match(problem('settings.json', '{"theme":"dark","volume":4}'), /no list of songs/);
  assert.match(problem('nums.json', '[{"a":1},{"a":2}]'), /no list of songs/);
});

test('a file that could not be opened is reported without stopping the good one beside it', () => {
  const r = readImport(
    [
      { name: 'bad.zip', failed: 'unreadable' },
      { name: 'big.json', failed: 'too-big' },
      { name: 'good.csv', text: 'Artist,Song\nSade,Jezebel\n' },
    ],
    NOW
  );
  assert.equal(r.songs.length, 1);
  assert.match(r.files[0].problem!, /Couldn’t open/);
  assert.match(r.files[1].problem!, /too big/);
  assert.equal(r.files[2].found, 1);
});

test('a JSON file cut off partway keeps the songs before the cut and says so', () => {
  const whole = JSON.stringify([
    { endTime: '2023-01-05 14:33', artistName: 'Sade', trackName: 'One', msPlayed: 90000 },
    { endTime: '2023-01-05 15:33', artistName: 'Sade', trackName: 'Two', msPlayed: 90000 },
    { endTime: '2023-01-05 16:33', artistName: 'Sade', trackName: 'Three', msPlayed: 90000 },
  ]);
  const r = read('history.json', whole.slice(0, whole.indexOf('Three') - 6));
  assert.deepEqual(r.songs.map((s) => s.name).sort(), ['One', 'Two']);
  assert.match(r.files[0].note!, /cut off/);
  assert.equal(r.files[0].problem, undefined);
});

test('files inside a ZIP that hold no songs stay quiet once another file in it worked', () => {
  const quiet = readImport(
    [
      { name: 'Userdata.json', text: '{"username":"x"}', fromZip: true },
      { name: 'history.json', text: JSON.stringify([{ artistName: 'A', trackName: 'B', msPlayed: 90000 }]), fromZip: true },
    ],
    NOW
  );
  assert.deepEqual(quiet.files.map((f) => f.name), ['history.json']);
  const nothing = readImport([{ name: 'Userdata.json', text: '{"username":"x"}', fromZip: true }], NOW);
  assert.equal(nothing.files.length, 1);
});

test('no files at all is a report too', () => {
  const r = readImport([], NOW);
  assert.equal(r.songs.length, 0);
  assert.equal(importHeadline(r), 'Nothing came in.');
});

// ---------- What the sheet says ----------

test('the headline counts songs and rows in plain words', () => {
  const base: ImportReport = { songs: [], skipped: [], skippedCount: 0, leftOut: { shortPlays: 0, notYours: 0, repeats: 0 }, files: [] };
  const song = { id: 'a', name: 'a', artist: 'a', art: '', addedAt: 1, from: '' };
  assert.equal(importHeadline({ ...base, songs: [song] }), '1 song came in.');
  assert.equal(importHeadline({ ...base, songs: Array(4812).fill(song), skippedCount: 23 }), '4,812 songs came in. 23 didn’t.');
  assert.equal(importHeadline({ ...base, skippedCount: 3 }), 'Nothing came in. 3 rows couldn’t be used.');
  assert.equal(importHeadline({ ...base, songs: [song], saveFailed: true }), 'Nothing was saved. What you had before is still here.');
});

test('the left-out line only names what happened', () => {
  const base = { shortPlays: 0, notYours: 0, repeats: 0 };
  const line = (leftOut: ImportReport['leftOut']) =>
    leftOutLine({ songs: [], skipped: [], skippedCount: 0, leftOut, files: [] });
  assert.equal(line(base), null);
  assert.equal(line({ ...base, repeats: 1 }), 'Left out on purpose: 1 repeat.');
  assert.equal(
    line({ shortPlays: 1200, notYours: 3, repeats: 50 }),
    'Left out on purpose: 1,200 plays under 30 seconds, 3 songs someone else added, 50 repeats.'
  );
});

test('a new import joins what you already had and counts only what is new', () => {
  const old = { id: 'o', name: 'Old', artist: 'A', art: '', addedAt: 5, from: '', source: 'file' as const };
  const fresh = { id: 'n', name: 'New', artist: 'B', art: '', addedAt: 9, from: '', source: 'file' as const };
  const again = { ...old, id: 'other', addedAt: 7 };
  const { likes, newCount } = mergeIntoLibrary([old], [fresh, again]);
  assert.deepEqual(likes.map((l) => l.id), ['n', 'o']);
  assert.equal(newCount, 1);
});

// ---------- The class demo samples go through the real reader ----------

test('a comma nobody quoted shifts the columns, so that row is named instead of coming in wrong', () => {
  const r = read('a.csv', 'Artist,Song,Date\nEarth, Wind & Fire,September,2020-01-01\nSade,Jezebel,2020-01-01,\n');
  assert.deepEqual(r.songs.map((s) => s.name), ['Jezebel']);
  assert.deepEqual(group(r, 'bad-columns')!.rows, ['Row 2 · “Wind & Fire” by Earth']);
});

test('a quote mark that never closes keeps the rows before it and says what was lost', () => {
  const r = read('a.csv', 'Artist,Song\nA,One\nB,"Two\nC,Three\nD,Four\n');
  assert.deepEqual(r.songs.map((s) => s.name), ['One']);
  assert.match(r.files[0].note!, /quote mark .* never closes around row 3/);
});

test('two picked files with the same name are both read', () => {
  const file = (uri: string, name: string) => ({
    name: 'Liked_Songs.csv',
    text: [EXPORTIFY, exportify(uri, name, 'A', '', '2019-04-02T21:15:00Z')].join('\n'),
  });
  const r = readImport([file('spotify:track:O', 'One'), file('spotify:track:W', 'Two')], NOW);
  assert.deepEqual(r.songs.map((s) => s.name).sort(), ['One', 'Two']);
});

test('a list of artist objects is read too, as other apps export it', () => {
  const r = read('a.json', JSON.stringify([{ name: 'Song', artists: [{ name: 'A' }, { name: 'B' }] }]));
  assert.equal(r.songs[0].artist, 'A, B');
});

test('a song really called Unknown stays a song; only Spotify’s stand-ins count as blank', () => {
  assert.equal(read('a.csv', 'Artist,Song\nSade,Unknown\n').songs.length, 1);
  assert.equal(read('a.csv', 'Artist,Song\nUnknown Artist,Song\n').songs.length, 0);
});

test('a strange date object in valid JSON is a named row, and never stops the file beside it', () => {
  const r = readImport(
    [
      { name: 'odd.json', text: '[{"track":"Odd","artist":"A","date":{"uts":{"toString":null}}}]' },
      { name: 'good.csv', text: 'Artist,Song\nSade,Jezebel\n' },
    ],
    NOW
  );
  assert.deepEqual(r.songs.map((s) => s.name), ['Jezebel']);
  assert.deepEqual(group(r, 'bad-date')!.rows, ['Item 1 · “Odd” by A']);
});

test('a link that is not Spotify’s gives no Spotify id, so two songs on one site stay two songs', () => {
  const r = read(
    'a.json',
    JSON.stringify([
      { track: 'Song One', artist: 'A', uri: 'https://a.bandcamp.com/track/song-one' },
      { track: 'Song Two', artist: 'A', uri: 'https://a.bandcamp.com/track/song-two' },
      { track: 'Three', artist: 'A', uri: 'https://open.spotify.com/track/ID3' },
      { track: 'Four', artist: 'A', uri: 'spotify:track:ID4' },
    ])
  );
  assert.deepEqual(r.songs.map((s) => s.id).sort(), ['ID3', 'ID4', 'song:a|song one', 'song:a|song two']);
});

test('a quote mark that never closes in an Exportify file is reported too', () => {
  const head = 'Track URI,Track Name,Artist Name(s),Added At,Extra';
  const r = read(
    'Liked_Songs.csv',
    [
      head,
      'spotify:track:A,First,Artist,2020-01-01T00:00:00Z,x',
      'spotify:track:B,Second,Artist,2020-01-01T00:00:00Z,"unclosed',
      'spotify:track:C,Third,Artist,2021-01-01T00:00:00Z,x',
    ].join('\n')
  );
  assert.deepEqual(r.songs.map((s) => s.name), ['First']);
  assert.match(r.files[0].note!, /never closes around row 3/);
});

test('a broken song file inside a ZIP is still reported after another file worked', () => {
  const r = readImport(
    [
      { name: 'good.csv', text: 'Song,Artist\nGood,A', fromZip: true },
      { name: 'history.json', text: '[{"trackName":"Lost","artistName":"A"', fromZip: true },
    ],
    NOW
  );
  assert.equal(r.songs.length, 1);
  assert.deepEqual(r.files.map((f) => f.name), ['good.csv', 'history.json']);
  assert.match(r.files[1].problem!, /broken/);
});

test('short plays are left out of a CSV too, where every cell is text', () => {
  const r = read('a.csv', 'track,artist,msPlayed\nQuick,A,1000\nLong,A,90000\n');
  assert.deepEqual(r.songs.map((s) => s.name), ['Long']);
  assert.equal(r.leftOut.shortPlays, 1);
});

test('if your earlier songs could not be put back after a failed save, the headline says so', () => {
  const base: ImportReport = { songs: [], skipped: [], skippedCount: 0, leftOut: { shortPlays: 0, notYours: 0, repeats: 0 }, files: [] };
  assert.match(importHeadline({ ...base, saveFailed: true, lostPrevious: true }), /couldn’t be put back/);
});

test('the messy sample: 4 songs in, 8 named, 1 repeat', () => {
  const r = readImport(IMPORT_SAMPLES.messy.files, NOW);
  assert.deepEqual(r.songs.map((s) => s.name).sort(), ['Blackbird', 'Karma Police', 'Smooth Operator', 'Superstition']);
  assert.equal(r.skippedCount, 8);
  assert.equal(group(r, 'bad-columns')!.count, 1);
  assert.equal(group(r, 'no-artist')!.count, 2);
  assert.equal(group(r, 'no-title')!.count, 1);
  assert.equal(group(r, 'bad-date')!.count, 3);
  assert.equal(group(r, 'empty')!.count, 1);
  assert.equal(r.leftOut.repeats, 1);
});

test('the cut-off sample keeps what came before the cut and names the podcast', () => {
  const r = readImport(IMPORT_SAMPLES.cutOff.files, NOW);
  assert.equal(r.songs.length, 3);
  assert.match(r.files[0].note!, /cut off/);
  assert.equal(group(r, 'not-a-song')!.count, 1);
  assert.equal(r.leftOut.shortPlays, 1);
});

test('the wrong-file sample brings in nothing and lists the columns it found', () => {
  const r = readImport(IMPORT_SAMPLES.wrong.files, NOW);
  assert.equal(r.songs.length, 0);
  assert.match(r.files[0].problem!, /It has: date, amount, category/);
});
