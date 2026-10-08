import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CalledShot } from './called-shots.ts';
import type { DiscoveryTrack } from './discovery.ts';
import {
  buildFindsNews,
  cleanReleaseTitle,
  describeRelease,
  markNewsSeen,
  type ReleaseChecks,
} from './finds-news.ts';

const track = (
  id = 1,
  artistName = 'Mabe Fratti',
  artistId = 100,
  artistListeners: number | undefined = 4_800,
  likedAt = 10_000
): DiscoveryTrack => ({
  id,
  trackName: `Song ${id}`,
  artistId,
  artistName,
  artworkUrl100: 'https://example.com/art.jpg',
  primaryGenreName: 'Experimental',
  previewUrl: 'https://example.com/audio.mp3',
  trackViewUrl: 'https://example.com/track',
  collectionName: 'Album 1',
  artistListeners,
  likedAt,
});

const call = (trackId = 1, artistName = 'Mabe Fratti'): CalledShot => ({
  trackId,
  trackName: `Song ${trackId}`,
  artistName,
  artistId: 100,
  listenersAtCall: 4_800,
  calledAt: 10_000,
});

test('buildFindsNews returns empty array with no tracks or no growth', () => {
  assert.deepEqual(buildFindsNews({ likedTracks: [], newsSeen: {} }), []);

  const items = buildFindsNews({
    likedTracks: [track()],
    newsSeen: {},
    listenersNow: { 'Mabe Fratti': 4_800 },
  });
  assert.equal(items.length, 0);
});

test('buildFindsNews detects milestone crossings and substantial growth', () => {
  const milestoneItem = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800)],
    newsSeen: {},
    listenersNow: { 'Mabe Fratti': 52_000 },
  });
  assert.equal(milestoneItem.length, 1);
  assert.equal(milestoneItem[0].type, 'milestone');
  assert.equal(milestoneItem[0].sentence, 'Mabe Fratti passed 50K listeners. You found them at 4.8K.');

  const growthItem = buildFindsNews({
    likedTracks: [track(2, 'Laurel Halo', 200, 4_000)],
    newsSeen: {},
    listenersNow: { 'Laurel Halo': 5_200 },
  });
  assert.equal(growthItem.length, 1);
  assert.equal(growthItem[0].sentence, 'Laurel Halo grew to 5.2K listeners. You found them at 4K.');
});

test('buildFindsNews uses newsSeen listeners as baseline when present', () => {
  const items = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800)],
    newsSeen: {
      'Mabe Fratti': { listeners: 25_000, seenAt: 20_000 },
    },
    listenersNow: { 'Mabe Fratti': 110_000 },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].sentence, 'Mabe Fratti passed 100K listeners. You found them at 4.8K.');

  // If already seen at 100K, 100K -> 100K is not news
  const seenAt100 = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800)],
    newsSeen: {
      'Mabe Fratti': { listeners: 100_000, seenAt: 20_000 },
    },
    listenersNow: { 'Mabe Fratti': 100_000 },
  });
  assert.equal(seenAt100.length, 0);
});

test('buildFindsNews detects releases dated after song save and after last seen', () => {
  const releaseChecks: ReleaseChecks = {
    100: {
      checkedAt: 50_000,
      releases: [
        {
          collectionId: 999,
          collectionName: 'Sentir que no es',
          releaseDate: new Date(25_000).toISOString(),
        },
      ],
    },
  };

  const items = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800, 10_000)],
    newsSeen: {
      'Mabe Fratti': { listeners: 4_800, seenAt: 20_000 },
    },
    releaseChecks,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'release');
  assert.equal(items[0].sentence, 'Mabe Fratti released Sentir que no es.');

  // Already seen release (seenAt > releaseDate) is not news
  const seenRelease = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800, 10_000)],
    newsSeen: {
      'Mabe Fratti': { listeners: 4_800, seenAt: 30_000 },
    },
    releaseChecks,
  });
  assert.equal(seenRelease.length, 0);

  // Release before song was saved is not news
  const oldRelease = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800, 30_000)],
    newsSeen: {},
    releaseChecks,
  });
  assert.equal(oldRelease.length, 0);
});

test('called artists come first in ordering', () => {
  const likedTracks = [
    track(1, 'Uncalled Artist', 101, 1_000, 10_000),
    track(2, 'Called Artist', 102, 1_000, 10_000),
  ];
  const calls = [call(2, 'Called Artist')];
  const listenersNow = {
    'Uncalled Artist': 50_000,
    'Called Artist': 50_000,
  };

  const items = buildFindsNews({
    likedTracks,
    newsSeen: {},
    listenersNow,
    calls,
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].artistName, 'Called Artist');
  assert.equal(items[0].called, true);
  assert.equal(items[1].artistName, 'Uncalled Artist');
  assert.equal(items[1].called, false);
});

test('cleanReleaseTitle and describeRelease remove parentheses and format sentences', () => {
  assert.equal(cleanReleaseTitle('Sentir que no es (Deluxe Edition)'), 'Sentir que no es');
  assert.equal(cleanReleaseTitle('Song Title - Single'), 'Song Title');
  assert.equal(describeRelease('Mabe Fratti', 'Sentir que no es (Deluxe)'), 'Mabe Fratti released Sentir que no es.');
  assert.equal(describeRelease('Mabe Fratti'), 'Mabe Fratti released new music.');
});

test('markNewsSeen updates listener baseline and timestamp for seen items', () => {
  const items = buildFindsNews({
    likedTracks: [track(1, 'Mabe Fratti', 100, 4_800)],
    newsSeen: {},
    listenersNow: { 'Mabe Fratti': 50_000 },
  });

  const nextSeen = markNewsSeen({}, items, { 'Mabe Fratti': 50_000 }, 99_999);
  assert.deepEqual(nextSeen, {
    'Mabe Fratti': { listeners: 50_000, seenAt: 99_999 },
  });
});
