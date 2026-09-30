import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanHandle, handleUrl, isTwin, matchPercent, rankTwins, sessionNeedsRefresh, twinSummary, type Counts, type TwinRow } from './twins.ts';

const c = (over: Partial<Counts> = {}): Counts => ({ bothLiked: 0, bothSkipped: 0, disagreed: 0, sameSongs: 0, sameArtists: 0, ...over });
const row = (twin: string, over: Partial<TwinRow> = {}): TwinRow => ({
  twin, name: twin, both_liked: 0, both_skipped: 0, disagreed: 0, same_songs: 0, same_artists: 0,
  i_waved: false, they_waved: false, can_wave: true, ...over,
});

test('matchPercent: agreement raises it, disagreement lowers it, two lucky overlaps are not 100%', () => {
  assert.equal(matchPercent(c({ bothLiked: 1, sameSongs: 1 })), 56); // 5 / (5 + 4)
  assert.ok(matchPercent(c({ bothLiked: 6, sameSongs: 2 })) > 80);
  assert.ok(matchPercent(c({ bothLiked: 2, disagreed: 6 })) < 40);
  assert.equal(matchPercent(c()), 0);
});

test('isTwin: needs 3 overlapping data points and 40%', () => {
  assert.equal(isTwin(c({ sameSongs: 2 })), false); // only 2 points
  assert.equal(isTwin(c({ bothLiked: 2, sameSongs: 1 })), true);
  assert.equal(isTwin(c({ bothLiked: 1, disagreed: 5 })), false);
});

test('rankTwins: best match first, non-twins dropped, at most 5', () => {
  const rows = [
    row('a', { both_liked: 2, same_songs: 1 }),
    row('b', { both_liked: 6, same_songs: 3 }),
    row('c', { same_songs: 1 }),
    ...['d', 'e', 'f', 'g', 'h'].map((t) => row(t, { both_liked: 3 })),
  ];
  const twins = rankTwins(rows);
  assert.equal(twins.length, 5);
  assert.equal(twins[0].id, 'b');
  assert.ok(!twins.some((t) => t.id === 'c'));
  assert.equal(twins[0].summary, 'you both liked 9 songs blind');
});

test('twinSummary: says what you actually share', () => {
  assert.equal(twinSummary(c({ bothLiked: 1 })), 'you both liked 1 song blind');
  assert.equal(twinSummary(c({ bothSkipped: 4 })), 'you skip the same songs');
  assert.equal(twinSummary(c({ sameArtists: 3 })), 'you save the same artists');
});

test('cleanHandle: accepts @names and profile links, rejects junk', () => {
  assert.equal(cleanHandle(' @maya.b ', 'instagram'), 'maya.b');
  assert.equal(cleanHandle('https://www.instagram.com/maya_b/', 'instagram'), 'maya_b');
  assert.equal(cleanHandle('snapchat.com/add/maya-b', 'snapchat'), 'maya-b');
  assert.equal(cleanHandle('tiktok.com/@maya', 'tiktok'), 'maya');
  assert.equal(cleanHandle('maya b', 'instagram'), null);
  assert.equal(cleanHandle('', 'instagram'), null);
  assert.equal(cleanHandle('x'.repeat(31), 'instagram'), null);
});

test('handleUrl: opens the right profile', () => {
  assert.equal(handleUrl('instagram', 'maya.b'), 'https://instagram.com/maya.b');
  assert.equal(handleUrl('snapchat', 'maya-b'), 'https://snapchat.com/add/maya-b');
  assert.equal(handleUrl('tiktok', 'maya'), 'https://tiktok.com/@maya');
});

test('sessionNeedsRefresh: refresh within 5 minutes of expiry', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(sessionNeedsRefresh(now / 1000 + 3600, now), false);
  assert.equal(sessionNeedsRefresh(now / 1000 + 200, now), true);
  assert.equal(sessionNeedsRefresh(now / 1000 - 10, now), true);
});
