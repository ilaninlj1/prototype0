import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanTitle, deezerQuery, featuresByIsrc, normName, pickDeezerMatch, sameArtist, type DeezerHit } from './sound-match.ts';

test('cleanTitle drops brackets and trailing dash parts', () => {
  assert.equal(cleanTitle('Spider (Original Mix)'), 'Spider');
  assert.equal(cleanTitle('Maracaueira (Incognito Remix) - Marc Mac Re-Edit'), 'Maracaueira');
  assert.equal(cleanTitle('How Far [Prod. Wu Lu]'), 'How Far');
  assert.equal(cleanTitle('  Two   Spaces '), 'Two Spaces');
});

test('normName folds case, accents, & and punctuation', () => {
  assert.equal(normName('Beyoncé'), 'beyonce');
  assert.equal(normName('Simon & Garfunkel'), 'simon and garfunkel');
  assert.equal(normName('The Notorious B.I.G.'), 'the notorious big');
});

test('sameArtist', () => {
  assert.ok(sameArtist('Leila Pinheiro', 'leila pinheiro'));
  assert.ok(sameArtist('Sigur Rós', 'Sigur Ros'));
  assert.ok(!sameArtist('Sigma', 'Sigur Ros'));
});

test('deezerQuery uses the cleaned title then the artist', () => {
  assert.equal(deezerQuery('Hi Top (Ed Rush & Optical Remix)', 'Sigma'), 'Hi Top Sigma');
});

const hit = (title: string, artist: string, isrc?: string): DeezerHit => ({ title, title_short: cleanTitle(title), isrc, artist: { name: artist } });

test('picks the exact artist and title, skipping other artists', () => {
  const hits = [hit('The Chauffeur', 'Duran Duran', 'A'), hit('The Chauffeur', 'Deftones', 'B')];
  assert.equal(pickDeezerMatch('The Chauffeur', 'Deftones', hits)?.isrc, 'B');
});

test('rejects a live or remix version when ours is not one, and the reverse', () => {
  const hits = [hit('Mr. Brightside (Live From The Royal Albert Hall)', 'The Killers', 'L'), hit('Mr. Brightside', 'The Killers', 'S')];
  assert.equal(pickDeezerMatch('Mr. Brightside', 'The Killers', hits)?.isrc, 'S');
  assert.equal(pickDeezerMatch('Lorena (Live From Van Nuys, CA / 2025)', 'LA LOM', [hit('Lorena', 'LA LOM', 'X')]), null);
  assert.equal(pickDeezerMatch('Lorena (Live From Van Nuys, CA / 2025)', 'LA LOM', [hit('Lorena (Live)', 'LA LOM', 'Y')])?.isrc, 'Y');
});

test('falls back to a containing title, and needs an ISRC', () => {
  assert.equal(pickDeezerMatch('Who Shot Ya?', 'The Notorious B.I.G.', [hit('Who Shot Ya? (2007 Remaster)', 'The Notorious B.I.G.', 'R')])?.isrc, 'R');
  assert.equal(pickDeezerMatch('Wena', 'Titom', [hit('Wena', 'Titom')]), null);
  assert.equal(pickDeezerMatch('Wena', 'Titom', []), null);
});

test('featuresByIsrc keeps the first parseable row per ISRC', () => {
  const base = { acousticness: 0.1, danceability: 0.5, energy: 0.5, instrumentalness: 0, key: 2, liveness: 0.1, loudness: -6, mode: 0, speechiness: 0.05, valence: 0.4 };
  const rows = [
    { ...base, isrc: 'gbffp0300052', tempo: 120 },
    { ...base, isrc: 'GBFFP0300052', tempo: 99 },
    { isrc: 'BROKEN' },
  ];
  const m = featuresByIsrc(rows);
  assert.equal(m.get('GBFFP0300052')?.tempo, 120);
  assert.equal(m.has('BROKEN'), false);
});

test('a title that cleans to nothing never contain-matches', () => {
  assert.equal(pickDeezerMatch('(Intro)', 'Sigma', [hit('Hi Top', 'Sigma', 'Z')]), null);
});
