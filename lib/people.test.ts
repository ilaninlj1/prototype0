import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chanceSentence,
  deckProgressLine,
  heartRate,
  isAdult,
  isInTune,
  matchScore,
  newlyInTune,
  modeLabel,
  parseDeck,
  parsePeople,
  personPrintSeeds,
  rarityWeight,
  sortPeople,
  type PersonRow,
} from './people.ts';

const row = (over: Partial<PersonRow> = {}): PersonRow => ({
  person: 'a',
  name: 'Maya',
  mode: 'friends',
  shared_tracks: [1, 2, 3, 4, 5],
  both_rated: 20,
  they_hearted_i_rated: 8,
  i_hearted_they_rated: 8,
  my_hearts: 5,
  my_cards: 20,
  their_hearts: 5,
  their_cards: 20,
  i_waved: false,
  they_waved: false,
  print: [],
  min_score: 1.25,
  ...over,
});
const none = () => null;

test('age: someone who may not have turned 18 yet is not an adult', () => {
  const now = new Date(2026, 10, 2); // Nov 2 2026
  assert.equal(isAdult(2008, 10, now), true); // Oct 2008 is 18 whatever the day
  assert.equal(isAdult(2008, 11, now), false); // Nov 2008 could still be 17
  assert.equal(isAdult(2008, 12, now), false);
  assert.equal(isAdult(1990, 6, now), true);
  assert.equal(isAdult(2012, 1, now), false);
});

test('age: nonsense dates do not pass', () => {
  const now = new Date(2026, 10, 2);
  assert.equal(isAdult(1990, 13, now), false);
  assert.equal(isAdult(1990, 0, now), false);
  assert.equal(isAdult(1890, 1, now), false);
  assert.equal(isAdult(NaN, 1, now), false);
});

test('a new member starts near a one-in-five heart rate', () => {
  assert.equal(heartRate(0, 0), 0.2);
  assert.ok(Math.abs(heartRate(1, 5) - 0.2) < 1e-9);
  assert.ok(heartRate(90, 100) > 0.85);
});

test('rare songs count up to double, and unknown ones count once', () => {
  assert.equal(rarityWeight(5_000_000), 1);
  assert.equal(rarityWeight(1_000_000), 1);
  assert.ok(Math.abs(rarityWeight(10_000) - 5 / 3) < 1e-9);
  assert.equal(rarityWeight(1_000), 2);
  assert.equal(rarityWeight(12), 2);
  assert.equal(rarityWeight(null), 1);
  assert.equal(rarityWeight(0), 1);
});

test('someone who hearts everything scores chance, not a match', () => {
  const shared = Array.from({ length: 18 }, (_, i) => i);
  const r = row({ shared_tracks: shared, they_hearted_i_rated: 20, i_hearted_they_rated: 18, my_hearts: 19, my_cards: 20, their_hearts: 5, their_cards: 20 });
  const s = matchScore(r, none);
  assert.ok(s.score < 1.25, `score ${s.score}`);
  assert.equal(isInTune(r, s), false);
});

test('two picky people sharing hearts beat chance', () => {
  const r = row();
  const s = matchScore(r, none);
  assert.ok(s.score >= 1.25, `score ${s.score}`);
  assert.equal(isInTune(r, s), true);
});

test('the larger direction sets what chance would give', () => {
  const generous = matchScore(row({ my_hearts: 18, my_cards: 20 }), none);
  const picky = matchScore(row({ my_hearts: 2, my_cards: 20 }), none);
  assert.ok(generous.expected > picky.expected);
});

test('the same overlap on rare songs scores higher', () => {
  const rare = matchScore(row(), () => 500);
  const hits = matchScore(row(), () => 5_000_000);
  assert.ok(rare.score > hits.score);
  assert.ok(Math.abs(hits.weighted - 5) < 1e-9);
  assert.ok(Math.abs(rare.weighted - 10) < 1e-9);
});

test('the bar comes from the server, so it can be tuned without a new build', () => {
  const r = row({ min_score: 3 });
  assert.equal(isInTune(r, { ...matchScore(r, none), score: 2.9 }), false);
  assert.equal(isInTune(r, { ...matchScore(r, none), score: 3 }), true);
});

test('only people who just crossed the bar get the moment', () => {
  assert.deepEqual(newlyInTune(new Set(['a']), ['a', 'b']), ['b']);
  assert.deepEqual(newlyInTune(new Set(['a', 'b']), ['a']), []);
});

test('a wave keeps someone on the list once the score drops', () => {
  const low = row({ shared_tracks: [1], both_rated: 2, i_waved: true });
  assert.equal(isInTune(low, { ...matchScore(low, none), score: 0.5 }), true);
  const theirs = row({ shared_tracks: [1], both_rated: 2, they_waved: true });
  assert.equal(isInTune(theirs, { ...matchScore(theirs, none), score: 0.5 }), true);
});

test('the sentence is plain and honest about small numbers', () => {
  const s = (shared: number, expected: number) => chanceSentence(shared, expected);
  assert.equal(s(5, 2.2), 'You both hearted 5 of the same songs. Chance says about 2.');
  assert.equal(s(3, 0.3), 'You both hearted 3 of the same songs. Chance says less than 1.');
  assert.equal(s(1, 0), 'You both hearted the same song. Chance says less than 1.');
});

test('someone who waved comes first, then the best score', () => {
  const list = sortPeople([
    { row: row({ person: 'low' }), score: { shared: 3, weighted: 3, expected: 2, score: 1.3 } },
    { row: row({ person: 'high' }), score: { shared: 5, weighted: 5, expected: 2, score: 2 } },
    { row: row({ person: 'waved', they_waved: true }), score: { shared: 3, weighted: 3, expected: 2, score: 1.26 } },
  ]);
  assert.deepEqual(list.map((p) => p.row.person), ['waved', 'high', 'low']);
});

test('someone who already answered your wave does not hold the waved-at-you spot', () => {
  const list = sortPeople([
    { row: row({ person: 'done', they_waved: true, i_waved: true }), score: { shared: 3, weighted: 3, expected: 2, score: 1.3 } },
    { row: row({ person: 'new', they_waved: true }), score: { shared: 3, weighted: 3, expected: 2, score: 1.26 } },
  ]);
  assert.deepEqual(list.map((p) => p.row.person), ['new', 'done']);
});

test('mode labels', () => {
  assert.equal(modeLabel('friends'), 'Friends');
  assert.equal(modeLabel('dating'), 'Dating');
  assert.equal(modeLabel('either'), 'Friends or dating');
});

test('a server row with the wrong shape is dropped, not trusted', () => {
  assert.deepEqual(parsePeople(null), []);
  assert.deepEqual(parsePeople('x'), []);
  assert.deepEqual(parsePeople([{ person: 'a' }]), []);
  assert.deepEqual(parsePeople([{ ...row(), mode: 'stalker' }]), []);
  assert.deepEqual(parsePeople([{ ...row(), shared_tracks: 'all' }]), []);
  const good = parsePeople([row(), { nonsense: true }]);
  assert.equal(good.length, 1);
  assert.equal(good[0].name, 'Maya');
});

test('print numbers from the server are clamped, and junk rings are dropped', () => {
  const [p] = parsePeople([row({ print: [{ key: 3, mode: 1, energy: 9, tempo: 9000 }, 'junk', { key: 99, mode: 7, energy: -1, tempo: -5 }] as any })]);
  assert.equal(p.print.length, 2);
  assert.deepEqual(p.print[0], { key: 3, mode: 1, energy: 1, tempo: 250 });
  assert.deepEqual(p.print[1], { key: null, mode: null, energy: 0, tempo: 30 });
});

test('a long print is cut to twelve rings', () => {
  const many = Array.from({ length: 40 }, () => ({ key: 1, mode: 1, energy: 0.5, tempo: 100 }));
  assert.equal(parsePeople([row({ print: many as any })])[0].print.length, 12);
});

test('deck rows must be whole positive track ids, and repeats go', () => {
  assert.deepEqual(parseDeck(null), []);
  assert.deepEqual(
    parseDeck([{ track_id: 5, hearted_by: 2 }, { track_id: 5, hearted_by: 2 }, { track_id: -1, hearted_by: 1 }, { track_id: 'x', hearted_by: 1 }, { track_id: 7 }]),
    [{ trackId: 5, heartedBy: 2 }, { trackId: 7, heartedBy: 0 }]
  );
});

test('your print is your most recent hearts with sound, newest last, at most twelve', () => {
  const liked = Array.from({ length: 20 }, (_, i) => ({ id: i, likedAt: i }));
  const seeds = personPrintSeeds(liked, (id) => (id % 2 ? null : { key: id % 12, mode: 1 as const, energy: 0.5, tempo: 100 }));
  assert.equal(seeds.length, 10);
  assert.equal(personPrintSeeds(liked, (id) => ({ key: id % 12, mode: 1 as const, energy: 0.5, tempo: 100 })).length, 12);
  assert.equal(personPrintSeeds(liked, (id) => ({ key: id % 12, mode: 1 as const, energy: 0.5, tempo: 100 })).at(-1)?.key, 19 % 12);
});

test('the empty row says how close you are', () => {
  assert.equal(deckProgressLine({ close: 0, judged: 0 }), 'Your first songs start here.');
  assert.equal(deckProgressLine({ close: 0, judged: 12 }), '12 songs judged so far.');
  assert.equal(deckProgressLine({ close: 0, judged: 1 }), '1 song judged so far.');
  assert.equal(deckProgressLine({ close: 1, judged: 12 }), '1 person is getting close.');
  assert.equal(deckProgressLine({ close: 3, judged: 12 }), '3 people are getting close.');
});
