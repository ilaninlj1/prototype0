import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DiscoveryTrack } from './discovery.ts';
import { foundLine, libraryView, searchLibrary } from './library.ts';

const song = (id: number, trackName: string, artistName: string, collectionName: string | null, primaryGenreName: string) =>
  ({ id, trackName, artistName, collectionName, primaryGenreName }) as DiscoveryTrack;

// Stored oldest first, as the liked list is.
const saved = [
  song(1, 'Alone Together', 'Daley', 'Days + Nights', 'R&B'),
  song(2, 'Nothing I’d Rather Be', 'Marva Whitney', 'It’s My Thing', 'Funk'),
  song(3, 'Love Went Without Saying', 'Tigerskin', 'Love Went', 'Electronic'),
  song(4, 'Halo', 'Beyoncé', 'I Am... Sasha Fierce', 'R&B'),
];

test('search finds songs by title, artist or album, any case', () => {
  assert.deepEqual(
    searchLibrary(saved, 'alone').map((t) => t.id),
    [1]
  );
  assert.deepEqual(
    searchLibrary(saved, 'MARVA').map((t) => t.id),
    [2]
  );
  assert.deepEqual(
    searchLibrary(saved, 'sasha fierce').map((t) => t.id),
    [4]
  );
});

test('search ignores accents and needs every word', () => {
  assert.deepEqual(
    searchLibrary(saved, 'beyonce').map((t) => t.id),
    [4]
  );
  assert.deepEqual(
    searchLibrary(saved, 'love tigerskin').map((t) => t.id),
    [3]
  );
  assert.deepEqual(searchLibrary(saved, 'love daley'), []);
});

test('an empty search keeps everything', () => {
  assert.equal(searchLibrary(saved, '   ').length, 4);
});

test('the grid shows the newest save first, then narrows by genre and search', () => {
  assert.deepEqual(
    libraryView(saved, { query: '', genre: null }).map((t) => t.id),
    [4, 3, 2, 1]
  );
  assert.deepEqual(
    libraryView(saved, { query: '', genre: 'R&B' }).map((t) => t.id),
    [4, 1]
  );
  assert.deepEqual(
    libraryView(saved, { query: 'halo', genre: 'R&B' }).map((t) => t.id),
    [4]
  );
  // A chip for a genre you no longer have falls back to all.
  assert.deepEqual(
    libraryView(saved, { query: '', genre: 'Jazz' }).map((t) => t.id),
    [4, 3, 2, 1]
  );
});

test('the found line says how the artist grew since you found them', () => {
  const today = new Date(2026, 9, 28, 15).getTime();
  assert.deepEqual(foundLine(97_300, 98_600, undefined, today), { text: 'Found at 97.3K → now 98.6K', change: '↑ 1%', up: true });
  assert.deepEqual(foundLine(88_400, 80_000, undefined, today), { text: 'Found at 88.4K → now 80K', change: '↓ 10%', up: false });
  assert.deepEqual(foundLine(98_600, 98_600, new Date(2026, 9, 28, 9).getTime(), today), {
    text: 'Found at 98.6K · today',
    change: null,
    up: false,
  });
  assert.deepEqual(foundLine(98_600, undefined, new Date(2026, 9, 20).getTime(), today), {
    text: 'Found at 98.6K',
    change: null,
    up: false,
  });
  assert.deepEqual(foundLine(undefined, 1_200_000, undefined, today), { text: '1.2M listeners', change: null, up: false });
  assert.equal(foundLine(undefined, undefined, undefined, today), null);
});
