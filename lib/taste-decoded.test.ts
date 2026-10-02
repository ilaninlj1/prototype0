import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFullyMeasured, MEASURES, parseSongFeel, SIDE_WORDS } from './taste-decoded.ts';

// A real answer, 2026-10-02, for Heidi Newfield's "Johnny And June" preview.
const RECCO = {
  acousticness: 0.6226,
  danceability: 0.5692,
  energy: 0.462,
  instrumentalness: 0.0038,
  liveness: 0.1187,
  loudness: -8.9531,
  speechiness: 0.0401,
  tempo: 138.2334,
  valence: 0.3772,
};

test('parseSongFeel keeps all 9 numbers ReccoBeats returns', () => {
  assert.deepEqual(parseSongFeel(RECCO), RECCO);
});

test('parseSongFeel rejects answers without energy or valence', () => {
  assert.equal(parseSongFeel(null), null);
  assert.equal(parseSongFeel({ error: 'bad file' }), null);
  assert.equal(parseSongFeel({ energy: 0.5 }), null);
  assert.equal(parseSongFeel({ energy: 'high', valence: 0.2 }), null);
});

test('parseSongFeel drops non-number extras instead of keeping junk', () => {
  assert.deepEqual(parseSongFeel({ energy: 0.5, valence: 0.2, tempo: 120, liveness: 'n/a' }), { energy: 0.5, valence: 0.2, tempo: 120 });
});

test('isFullyMeasured needs all 8 measures; songs measured before 2026-10-02 are not', () => {
  assert.equal(isFullyMeasured(parseSongFeel(RECCO)!), true);
  assert.equal(isFullyMeasured({ energy: 0.5, valence: 0.2, tempo: 120 }), false);
  assert.equal(isFullyMeasured(undefined), false);
});

test('every measure has a word for each side', () => {
  for (const m of MEASURES) {
    assert.ok(SIDE_WORDS[m].low);
    assert.ok(SIDE_WORDS[m].high);
  }
});
