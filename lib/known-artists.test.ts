import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artistsIn, isKnown, knownArtists } from './known-artists.ts';

const song = (artist: string, source?: 'file') => ({
  id: artist,
  name: '',
  artist,
  art: '',
  addedAt: 0,
  from: '',
  ...(source ? { source } : {}),
});

test('artistsIn splits every credited artist, the way iTunes and Spotify write them', () => {
  assert.deepEqual(artistsIn('Drake & Future'), ['drake', 'future']);
  assert.deepEqual(artistsIn('Ajebutter22 feat. Wizkid'), ['ajebutter22', 'wizkid']);
  assert.deepEqual(artistsIn('A ft. B, C x D'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(artistsIn('The Weeknd'), ['weeknd'], 'a leading The does not matter');
  assert.deepEqual(artistsIn('Simon & Garfunkel'), ['simon', 'garfunkel']);
});

test('knownArtists comes only from imported files, never the login (Spotify Developer Policy)', () => {
  const known = knownArtists([song('Drake, Future', 'file'), song('Adele')]);
  assert.deepEqual([...known].sort(), ['drake', 'future']);
});

test('isKnown: any credited artist you already have makes it not truly blind', () => {
  const known = knownArtists([song('Future', 'file')]);
  assert.equal(isKnown('Drake & Future', known), true);
  assert.equal(isKnown('Drake', known), false);
  assert.equal(isKnown('the future', known), true);
});
