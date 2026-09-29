import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPool, challenger, ratioBand, spotRound, type PoolSong } from './game-pool.ts';

const song = (artist: string, listeners: number): PoolSong => ({
  artist, listeners, title: `${artist} song`, previewUrl: `p/${artist}`, artworkUrl: '', genre: 'Pop',
});
const pool = [
  ...Array.from({ length: 6 }, (_, i) => song(`Star${i}`, 2_000_000 + i * 1_000_000)),
  ...Array.from({ length: 6 }, (_, i) => song(`Small${i}`, 60_000 + i * 10_000)),
  song('Mid', 500_000),
];

test('buildPool keeps one entry per song with a known count and drops unknown artists', () => {
  const entry = { title: 'T', rank: 1, playcount: 1, previewUrl: 'p', itunesTrackId: 1, artworkUrl: 'a', album: null };
  const catalogs = { Pop: { A: { hits: [entry], deepCuts: [], mixed: [entry], rankedTrackCount: 1 }, B: { hits: [entry], deepCuts: [], mixed: [], rankedTrackCount: 1 } } };
  const out = buildPool(catalogs, new Map([['A', 1234]]));
  assert.deepEqual(out.map((s) => [s.artist, s.listeners]), [['A', 1234]]);
});

test('ratioBand tightens with the streak', () => {
  assert.deepEqual(ratioBand(0), { min: 10, max: Infinity });
  assert.deepEqual(ratioBand(2), { min: 10, max: Infinity });
  assert.deepEqual(ratioBand(3), { min: 4, max: 10 });
  assert.deepEqual(ratioBand(6), { min: 2, max: 4 });
  assert.deepEqual(ratioBand(10), { min: 1.2, max: 2 });
});

test('spotRound has exactly one 1M+ song and low decoys early', () => {
  for (let i = 0; i < 50; i++) {
    const r = spotRound(pool, 0, new Set());
    assert.equal(r.length, 4);
    assert.equal(r.filter((s) => s.listeners >= 1_000_000).length, 1);
    assert.equal(r.some((s) => s.listeners >= 250_000 && s.listeners < 1_000_000), false);
  }
});

test('spotRound includes a near-miss decoy from streak 5', () => {
  for (let i = 0; i < 50; i++) {
    const r = spotRound(pool, 5, new Set());
    assert.equal(r.some((s) => s.artist === 'Mid'), true);
  }
});

test('spotRound skips used artists', () => {
  const used = new Set(['Star0', 'Star1', 'Star2', 'Star3', 'Star4']);
  assert.equal(spotRound(pool, 0, used).find((s) => s.listeners >= 1_000_000)?.artist, 'Star5');
});

test('challenger respects the band and falls back to the nearest band', () => {
  const champ = song('Champ', 1_000_000);
  const c = challenger(pool, champ, 0, new Set(['Champ']))!;
  const ratio = Math.max(c.listeners, champ.listeners) / Math.min(c.listeners, champ.listeners);
  assert.ok(ratio >= 10);
  // streak 10 wants 1.2–2x; nothing in the pool is that close to 100, so it falls back.
  assert.notEqual(challenger(pool, song('Tiny', 100), 10, new Set()), null);
  assert.equal(challenger([], champ, 0, new Set()), null);
});
