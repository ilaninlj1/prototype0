// lib/daily-drop.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crowdLabel,
  dropToDiscoveryTracks,
  nextDropIndex,
  pickHeadline,
  shareText,
  todayKey,
  type Drop,
  type DropSong,
} from './daily-drop.ts';

const song = (slot: DropSong['slot'], artist: string, listeners: number, id: number): DropSong => ({
  slot, artist, listeners, itunesTrackId: id, itunesArtistId: id + 1000, title: `Song ${id}`,
  artworkUrl: 'https://x/100x100bb.jpg', previewUrl: `https://p/${id}.m4a`, genre: 'Jazz',
});
const drop: Drop = {
  day: '2026-10-01',
  number: 3,
  songs: [song('radar', 'R', 40_000, 1), song('famous', 'F', 3_200_000, 2), song('buried', 'B', 900, 3), song('known', 'K', 300_000, 4), song('tiny', 'T', 8_000, 5)],
};

test('todayKey uses the local calendar date', () => {
  assert.equal(todayKey(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.equal(todayKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});

test('nextDropIndex resumes after the last vote', () => {
  assert.equal(nextDropIndex([]), 0);
  assert.equal(nextDropIndex([{ position: 0, liked: true }, { position: 1, liked: false }]), 2);
});

test('crowdLabel shows counts under 20 voters and percent from 20', () => {
  assert.equal(crowdLabel(undefined), 'No votes yet');
  assert.equal(crowdLabel({ position: 0, voters: 6, likes: 4 }), '4 of 6 liked');
  assert.equal(crowdLabel({ position: 0, voters: 19, likes: 19 }), '19 of 19 liked');
  assert.equal(crowdLabel({ position: 0, voters: 20, likes: 13 }), '65% liked');
});

test('pickHeadline prefers a lonely like (lowest share wins)', () => {
  const votes = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position !== 1 }));
  const results = [
    { position: 0, voters: 10, likes: 2 },
    { position: 1, voters: 10, likes: 6 },
    { position: 2, voters: 10, likes: 1 },
    { position: 3, voters: 10, likes: 9 },
    { position: 4, voters: 10, likes: 5 },
  ];
  assert.equal(pickHeadline(drop, votes, results), "You're one of only 10% who liked B.");
});

test('pickHeadline falls back to the famous slot, with and without enough voters', () => {
  const skippedFamous = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position === 3 }));
  const results = [{ position: 1, voters: 8, likes: 3 }];
  assert.equal(pickHeadline(drop, skippedFamous, results), 'You skipped a song with 3.2M listeners — so did 63% of people.');
  assert.equal(pickHeadline(drop, skippedFamous, [{ position: 1, voters: 3, likes: 1 }]), 'You skipped a song with 3.2M listeners.');
  const likedFamous = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position === 1 }));
  assert.equal(pickHeadline(drop, likedFamous, []), 'You spotted it — 3.2M listeners.');
});

test('shareText has no artist names and counts buried likes', () => {
  const votes = [true, false, true, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, votes), 'Blindspot Daily #3\n💜🖤💜💜🖤\nLiked 3 blind · 1 under 5K listeners');
  const none = [false, false, false, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, none), 'Blindspot Daily #3\n🖤🖤🖤💜🖤\nLiked 1 blind');
});

test('dropToDiscoveryTracks keeps drop order and found-at listeners', () => {
  const tracks = dropToDiscoveryTracks(drop);
  assert.deepEqual(tracks.map((t) => t.id), [1, 2, 3, 4, 5]);
  assert.equal(tracks[2].artistListeners, 900);
  assert.equal(tracks[0].artistId, 1001);
});
