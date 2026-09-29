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
  likedDropTracks,
  guessLine,
  dropStreak,
  rankByListeners,
  rankLabel,
  addPending,
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

test('likedDropTracks returns only liked songs, stamped with the like time and found-at count', () => {
  const votes = [true, false, true, false, false].map((liked, position) => ({ position, liked }));
  const liked = likedDropTracks(drop, votes, 1234);
  assert.deepEqual(liked.map((t) => t.id), [1, 3]);
  assert.equal(liked[1].likedAt, 1234);
  assert.equal(liked[1].artistListeners, 900);
});

test('addPending replaces an entry for the same day instead of duplicating it', () => {
  const a = { day: '2026-10-01', votes: [{ position: 0, liked: true }] };
  const b = { day: '2026-10-01', votes: [{ position: 0, liked: false }] };
  const c = { day: '2026-10-02', votes: [] };
  assert.deepEqual(addPending([a, c], b), [c, b]);
});

test('guessLine: right or wrong, with the share of people who found it', () => {
  const guesses = [
    { position: 1, count: 3 },
    { position: 0, count: 5 },
  ];
  assert.equal(guessLine(drop, 1, guesses), 'You found the famous one ✓ · 38% of people did');
  assert.equal(guessLine(drop, 0, guesses), 'Nope — it was #2 · 38% of people found it');
  assert.equal(guessLine(drop, 1, []), 'You found the famous one ✓');
  assert.equal(guessLine(drop, undefined, guesses), null);
});

test('shareText adds the guess line when a guess was made', () => {
  const votes = [true, false, true, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, votes, 1), 'Blindspot Daily #3\n💜🖤💜💜🖤\nLiked 3 blind · 1 under 5K listeners\n🎯 Found the famous one');
  assert.equal(shareText(drop, votes, 0).split('\n')[3], '❌ Missed the famous one');
});

test('rankByListeners orders fewest to most and keeps drop positions', () => {
  const ranked = rankByListeners(drop);
  assert.deepEqual(ranked.map((r) => r.song.artist), ['B', 'T', 'R', 'K', 'F']);
  assert.deepEqual(ranked.map((r) => r.position), [2, 4, 0, 3, 1]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

test('rankLabel names the ends of the ladder', () => {
  assert.equal(rankLabel(1), '#1 · fewest listeners');
  assert.equal(rankLabel(3), '#3');
  assert.equal(rankLabel(5), '#5 · most listeners');
});

test('dropStreak counts consecutive finished days ending today, or yesterday if today is not played', () => {
  assert.equal(dropStreak([], '2026-10-05'), 0);
  assert.equal(dropStreak(['2026-10-03', '2026-10-04', '2026-10-05'], '2026-10-05'), 3);
  assert.equal(dropStreak(['2026-10-03', '2026-10-04'], '2026-10-05'), 2);
  assert.equal(dropStreak(['2026-10-01', '2026-10-03', '2026-10-04'], '2026-10-04'), 2);
  assert.equal(dropStreak(['2026-10-02'], '2026-10-05'), 0);
  assert.equal(dropStreak(['2026-09-30', '2026-10-01'], '2026-10-01'), 2);
});

test('shareText adds a streak line from 2 days', () => {
  const votes = [true, false, true, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, votes, 1, 4).split('\n').at(-1), '🔥 4-day streak');
  assert.equal(shareText(drop, votes, 1, 1).includes('streak'), false);
});
