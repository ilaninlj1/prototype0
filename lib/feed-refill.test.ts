// The four cases in testing.md, for getting the next blind song. Made up songs
// and a fake fetcher, so a result never depends on iTunes or the Wi-Fi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  refillQueueWithFallback,
  type DiscoveryTrack,
  type Strategy,
  type SwipeEntry,
} from './discovery.ts';
import { IDLE, fail, panel, start } from './feed-load.ts';

const rock: Strategy = { type: 'genre', genre: 'Rock' };

function song(id: number, genre = 'Rock'): DiscoveryTrack {
  return {
    id,
    trackName: `Song ${id}`,
    artistId: 1000 + id,
    artistName: `Artist ${id}`,
    artworkUrl100: 'https://example.com/art.jpg',
    primaryGenreName: genre,
    previewUrl: 'https://example.com/preview.m4a',
    trackViewUrl: 'https://music.apple.com/example',
    collectionName: null,
  };
}

function heard(ids: number[], genre = 'Rock'): SwipeEntry[] {
  return ids.map((trackId, i) => ({ trackId, artistId: 1000 + trackId, genre, action: 'skip', timestamp: i + 1 }));
}

function genreOf(strategy: Strategy): string {
  if (strategy.type !== 'genre') throw new Error('expected a genre strategy');
  return strategy.genre;
}

test('Case 1, ordinary: a normal refill takes the next 3 unheard songs and stays on the genre', async () => {
  const fetcher = async () => [1, 2, 3, 4, 5, 6].map((id) => song(id));

  const result = await refillQueueWithFallback([], rock, heard([1, 2]), ['Rock'], ['Rock', 'Jazz'], fetcher);

  assert.deepEqual(result.queue.map((t) => t.id), [3, 4, 5]);
  assert.deepEqual(result.strategy, rock);
});

test('Case 2, boundary: a genre with one song left gives that song, then fills up from another genre', async () => {
  const fetcher = async (strategy: Strategy) => {
    const genre = genreOf(strategy);
    if (genre === 'Rock') return [1, 2, 3, 4].map((id) => song(id));
    if (genre === 'Jazz') return [10, 11, 12].map((id) => song(id, 'Jazz'));
    throw new Error(`unexpected genre ${genre}`);
  };

  const result = await refillQueueWithFallback([], rock, heard([1, 2, 3]), ['Rock', 'Jazz'], ['Rock', 'Jazz'], fetcher);

  assert.deepEqual(result.queue.map((t) => t.id), [4, 10, 11]);
  assert.deepEqual(result.strategy, { type: 'genre', genre: 'Jazz' });
});

test("Case 3, boundary: when you've heard everything it finishes empty, within 30 fetches, and offers another genre", async () => {
  const genres = ['Rock', 'Jazz', 'Pop'];
  const songsIn: Record<string, number[]> = { Rock: [1, 2, 3], Jazz: [4, 5, 6], Pop: [7, 8, 9] };
  const asked = new Set<string>();
  let fetches = 0;
  const fetcher = async (strategy: Strategy) => {
    fetches += 1;
    if (fetches > 30) throw new Error('more than 30 fetches');
    const genre = genreOf(strategy);
    asked.add(genre);
    return songsIn[genre].map((id) => song(id, genre));
  };

  const result = await refillQueueWithFallback([], rock, heard([1, 2, 3, 4, 5, 6, 7, 8, 9]), genres, genres, fetcher);

  assert.deepEqual(result.queue, []);
  assert.ok(fetches <= 30, `used ${fetches} fetches`);
  assert.deepEqual([...asked].sort(), ['Jazz', 'Pop', 'Rock']);

  // An empty queue is what makes Home mark the load as 'empty'. This is what that state says.
  const said = panel(fail(start(IDLE, 'Rock', 0), 'empty'), 0);
  assert.match(said?.title ?? '', /^No songs left/);
  assert.deepEqual(said?.actions, ['another']);
});

test('Case 4, failure: when the connection dies halfway, the songs it already got stay in the queue', async () => {
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    if (fetches === 1) return [1, 2].map((id) => song(id));
    throw new Error('iTunes rate limited the app');
  };

  const result = await refillQueueWithFallback([], rock, [], ['Rock'], ['Rock', 'Jazz'], fetcher);

  assert.deepEqual(result.queue.map((t) => t.id), [1, 2]);
});
