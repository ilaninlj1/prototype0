import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupTalkedAbout, parseCredits, pickLesserKnown, replayScore, wikiMatches } from './song-facts.ts';

test('parseCredits groups who played what, the crew, writers and remixes', () => {
  const rec = {
    'first-release-date': '1997-05-21',
    relations: [
      { type: 'instrument', artist: { name: 'Jonny Greenwood' }, attributes: ['piano'] },
      { type: 'instrument', artist: { name: 'Jonny Greenwood' }, attributes: ['glockenspiel'] },
      { type: 'vocal', artist: { name: 'Thom Yorke' }, attributes: ['lead vocals'] },
      { type: 'producer', artist: { name: 'Nigel Godrich' }, attributes: [] },
      { type: 'engineer', artist: { name: 'Jon Bailey' }, attributes: ['assistant'] },
      { type: 'remix', recording: { title: 'No Surprises (remix)' } },
      {
        type: 'performance',
        work: { relations: [{ type: 'writer', artist: { name: 'Thom Yorke' } }, { type: 'composer', artist: { name: 'Jonny Greenwood' } }] },
      },
    ],
  };
  assert.deepEqual(parseCredits(rec), {
    firstRelease: '1997-05-21',
    players: [
      { name: 'Jonny Greenwood', roles: ['piano', 'glockenspiel'] },
      { name: 'Thom Yorke', roles: ['lead vocals'] },
    ],
    crew: [
      { name: 'Nigel Godrich', roles: ['producer'] },
      { name: 'Jon Bailey', roles: ['assistant engineer'] },
    ],
    writers: ['Thom Yorke', 'Jonny Greenwood'],
    versions: ['No Surprises (remix)'],
  });
});

test('parseCredits copes with an empty record', () => {
  assert.deepEqual(parseCredits({}), { firstRelease: null, players: [], crew: [], writers: [], versions: [] });
});

test('replayScore is plays per listener, rounded', () => {
  assert.equal(replayScore(57_412_569, 3_471_323), 16.5);
  assert.equal(replayScore(10, 0), null);
});

test('wikiMatches only accepts an article that is really about this artist', () => {
  assert.equal(wikiMatches('"No Surprises" is a song by the English rock band Radiohead', 'Radiohead'), true);
  assert.equal(wikiMatches('No Surprises is a 2007 film.', 'Radiohead'), false);
});

test('pickLesserKnown skips the top hits but falls back when a catalog is short', () => {
  const songs = Array.from({ length: 30 }, (_, i) => i);
  const picked = pickLesserKnown(songs, 3, () => 0);
  assert.equal(picked.length, 3);
  assert.ok(picked.every((i) => i >= 5));
  assert.equal(pickLesserKnown([1, 2], 3, () => 0).length, 2);
});

test('groupTalkedAbout orders songs by their newest comment and counts them', () => {
  const rows = [
    { track_id: 1, created_at: '2026-09-30T10:00:00Z' },
    { track_id: 2, created_at: '2026-09-30T12:00:00Z' },
    { track_id: 1, created_at: '2026-09-30T09:00:00Z' },
  ];
  assert.deepEqual(groupTalkedAbout(rows), [
    { trackId: 2, count: 1 },
    { trackId: 1, count: 2 },
  ]);
});
