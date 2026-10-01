import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DiscoveryTrack } from './discovery.ts';
import { BIN_MAX, NOTE_MAX, cleanNote, deleteSongs, restoreSongs, saveSong, setNote, type Saved } from './saved-songs.ts';

function track(id: number, likedAt?: number, note?: string): DiscoveryTrack {
  return {
    id,
    trackName: `Song ${id}`,
    artistId: id * 10,
    artistName: `Artist ${id}`,
    artworkUrl100: '',
    primaryGenreName: 'Alternative',
    previewUrl: '',
    trackViewUrl: '',
    collectionName: null,
    likedAt,
    note,
  };
}
const ids = (s: Saved) => s.liked.map((t) => t.id);
const empty: Saved = { liked: [], bin: [] };

test('saveSong adds a song once, newest at the end', () => {
  let s = saveSong(empty, track(1, 100));
  s = saveSong(s, track(2, 200));
  assert.deepEqual(ids(s), [1, 2]);
  const again = saveSong(s, track(1, 300));
  assert.equal(again, s, 'saving a song that is already saved changes nothing');
});

test('deleteSongs moves songs to Recently deleted, newest deletion first', () => {
  let s: Saved = { liked: [track(1, 100), track(2, 200), track(3, 300)], bin: [] };
  s = deleteSongs(s, [2], 1000);
  assert.deepEqual(ids(s), [1, 3]);
  s = deleteSongs(s, [1], 2000);
  assert.deepEqual(ids(s), [3]);
  assert.deepEqual(
    s.bin.map((d) => [d.track.id, d.deletedAt]),
    [
      [1, 2000],
      [2, 1000],
    ]
  );
});

test('deleting the last song leaves an empty list, and nothing is lost', () => {
  const s = deleteSongs({ liked: [track(1, 100)], bin: [] }, [1], 5);
  assert.equal(s.liked.length, 0);
  assert.equal(s.bin.length, 1);
});

test('deleteSongs with no matching ids changes nothing', () => {
  const s: Saved = { liked: [track(1)], bin: [] };
  assert.equal(deleteSongs(s, [99], 1), s);
});

test('restoreSongs puts songs back in their old spots, note and all', () => {
  let s: Saved = { liked: [track(1, 100), track(2, 200, 'the bass at 0:40'), track(3, 300), track(4, 400)], bin: [] };
  s = deleteSongs(s, [2], 1);
  s = deleteSongs(s, [3], 2);
  s = restoreSongs(s, [2, 3]);
  assert.deepEqual(ids(s), [1, 2, 3, 4]);
  assert.equal(s.liked[1].note, 'the bass at 0:40');
  assert.equal(s.bin.length, 0);
});

test('restoreSongs falls back to the old position for songs saved before likedAt existed', () => {
  let s: Saved = { liked: [track(1), track(2), track(3)], bin: [] };
  s = deleteSongs(s, [2], 1);
  s = restoreSongs(s, [2]);
  assert.deepEqual(ids(s), [1, 2, 3]);
});

test('restoreSongs restores in deletion-independent order', () => {
  let s: Saved = { liked: [track(1), track(2), track(3), track(4)], bin: [] };
  s = deleteSongs(s, [3], 1);
  s = deleteSongs(s, [2], 2);
  s = restoreSongs(s, [2, 3]);
  assert.deepEqual(ids(s), [1, 2, 3, 4]);

  s = deleteSongs(s, [2], 3);
  s = deleteSongs(s, [3], 4);
  s = restoreSongs(s, [2, 3]);
  assert.deepEqual(ids(s), [1, 2, 3, 4]);

  s = deleteSongs(s, [4, 1, 3], 5);
  s = restoreSongs(s, [1, 3, 4]);
  assert.deepEqual(ids(s), [1, 2, 3, 4]);
});

test('restoreSongs only restores the songs asked for', () => {
  let s: Saved = { liked: [track(1, 1), track(2, 2)], bin: [] };
  s = deleteSongs(s, [1, 2], 9);
  s = restoreSongs(s, [2]);
  assert.deepEqual(ids(s), [2]);
  assert.deepEqual(
    s.bin.map((d) => d.track.id),
    [1]
  );
});

test('saving a song again takes it out of Recently deleted and keeps its note', () => {
  let s: Saved = { liked: [track(1, 100, 'late night')], bin: [] };
  s = deleteSongs(s, [1], 1);
  s = saveSong(s, track(1, 500));
  assert.deepEqual(ids(s), [1]);
  assert.equal(s.liked[0].note, 'late night');
  assert.equal(s.bin.length, 0);
});

test('Recently deleted keeps at most BIN_MAX songs, dropping the oldest deletions', () => {
  const liked = Array.from({ length: BIN_MAX + 5 }, (_, i) => track(i + 1));
  let s: Saved = { liked, bin: [] };
  for (const t of liked) s = deleteSongs(s, [t.id], t.id);
  assert.equal(s.bin.length, BIN_MAX);
  assert.equal(s.bin[0].track.id, BIN_MAX + 5, 'the newest deletion is kept');
});

test('setNote adds, edits and clears a note on one saved song', () => {
  let liked = [track(1), track(2)];
  liked = setNote(liked, 2, '  the   bass at 0:40 ');
  assert.equal(liked[1].note, 'the bass at 0:40');
  assert.equal(liked[0].note, undefined);
  liked = setNote(liked, 2, 'changed my mind');
  assert.equal(liked[1].note, 'changed my mind');
  liked = setNote(liked, 2, '   ');
  assert.equal('note' in liked[1], false, 'an empty note removes it');
});

test('setNote leaves the list alone when nothing changes', () => {
  const liked = [track(1, 1, 'same')];
  assert.equal(setNote(liked, 1, 'same'), liked);
  assert.equal(setNote(liked, 99, 'not saved'), liked);
});

test('cleanNote trims, joins lines and caps the length', () => {
  assert.equal(cleanNote(' a\n\nb '), 'a b');
  assert.equal(cleanNote('x'.repeat(NOTE_MAX + 20)).length, NOTE_MAX);
});
