import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DiscoveryTrack } from './discovery.ts';
import { hardestHitting, legsLiked, mileAt, paceSeries, routeXY, summarize } from './run-reveal.ts';
import type { RunPoint, RunRecord, RunSong, Steer } from './run-types.ts';

// Points every 5 s; speed(t) and spm(t) in seconds.
const track = (speed: (s: number) => number, toS: number, spm: (s: number) => number = () => 160, gps = true): RunPoint[] =>
  Array.from({ length: toS / 5 + 1 }, (_, i) => {
    const s = i * 5;
    return { t: s * 1000, lat: gps ? 32.84 + s * 0.00002 : null, lng: gps ? -96.78 : null, speed: speed(s), spm: spm(s) };
  });
const song = (startS: number, endS: number, o: Partial<RunSong> = {}): RunSong => ({
  track: { id: startS } as DiscoveryTrack, start: startS * 1000, end: endS * 1000, tempo: 160, energy: 0.6, beat: 160,
  blind: true, steer: 'hold' as Steer, liked: null, kept: false, ...o,
});
const run = (points: RunPoint[], played: RunSong[], o: Partial<RunRecord> = {}): RunRecord => ({
  id: 'r', startedAt: 0, endedAt: points[points.length - 1].t, goal: 'easy', songs: 'blind', typedPace: null, goalPace: 400,
  talk: null, naturalSpm: 160, distanceM: 2000, points, played, gaps: [], ...o,
});

test('a song with 5 % lift is legs liked', () => {
  const pts = track((s) => (s >= 120 && s < 150 ? 2.625 : 2.5), 300);
  const played = [song(90, 120), song(120, 150), song(150, 180)];
  assert.deepEqual([...legsLiked(played, pts, [])], [1]);
});

test('lift while lifting does not count', () => {
  const pts = track((s) => (s >= 120 && s < 150 ? 2.625 : 2.5), 300, () => 150);
  const played = [song(90, 120), song(120, 150, { steer: 'lift' }), song(150, 180)];
  assert.equal(legsLiked(played, pts, []).size, 0);
});

test('lock 75 % plus 2 % lift counts', () => {
  const pts = track((s) => (s >= 120 && s < 150 ? 2.56 : 2.5), 300, (s) => (s >= 120 && s < 150 ? 160 : 150));
  const played = [song(90, 120, { beat: 175 }), song(120, 150, { beat: 160 }), song(150, 180, { beat: 175 })];
  assert.deepEqual([...legsLiked(played, pts, [])], [1]);
});

test('at most 1 per 5', () => {
  // Every song speeds up 5 % over the minute before it: a steady climb.
  const pts = track((s) => 2 * 1.05 ** Math.floor(s / 30), 400);
  const played = Array.from({ length: 10 }, (_, i) => song(90 + i * 30, 120 + i * 30));
  assert.equal(legsLiked(played, pts, []).size, 2);
});

test('a song over a gap is skipped', () => {
  const pts = track((s) => (s >= 120 && s < 150 ? 2.7 : 2.5), 300);
  const played = [song(90, 120), song(120, 150), song(150, 180)];
  assert.equal(legsLiked(played, pts, [{ start: 125_000, end: 140_000 }]).size, 0);
});

test('a song you liked is not also legs liked', () => {
  const pts = track((s) => (s >= 120 && s < 150 ? 2.7 : 2.5), 300);
  assert.equal(legsLiked([song(90, 120), song(120, 150, { liked: 'you' })], pts, []).size, 0);
});

test('hardest-hitting needs 20 s of speed', () => {
  const pts = track((s) => (s >= 60 && s < 75 ? 4 : s >= 120 && s < 150 ? 3 : 2.5), 300);
  const played = [song(60, 75), song(90, 120), song(120, 150)];
  assert.equal(hardestHitting(played, pts), 2);
});

test('a 90 s run summarizes with "Short and sweet." and no hardest', () => {
  const pts = track(() => 2.5, 90);
  const played = [song(0, 30), song(30, 60), song(60, 90)];
  const r = run(pts, played, { distanceM: 225 });
  assert.equal(summarize(r).headline, 'Short and sweet.');
  assert.equal(hardestHitting(played.slice(0, 0), pts), null);
});

test('steady the whole way, and walks are walks', () => {
  const pts = track(() => 2.5, 600);
  assert.equal(summarize(run(pts, [])).headline, 'Steady the whole way.');
  assert.equal(summarize(run(pts, [])).onGoalPct, 1);
  const walk = track(() => 1.4, 600, () => 110);
  assert.equal(summarize(run(walk, [], { goalPace: 700 })).headline, 'A good walk.');
});

test('you found your pace at a mile mark', () => {
  // Too fast for the first 4 minutes, on the 400 s/km goal after.
  const pts = track((s) => (s < 240 ? 3.2 : 2.5), 600);
  const s = summarize(run(pts, [], { distanceM: 2400 }));
  assert.match(s.headline, /^You found your pace at mile 0\.\d\.$/);
});

test('summary skips locked minutes', () => {
  const pts = track(() => 2.5, 600);
  const s = summarize(run(pts, [], { gaps: [{ start: 100_000, end: 220_000 }] }));
  assert.equal(s.durationMs, 480_000);
});

test('pace series buckets and smooths', () => {
  const series = paceSeries(track(() => 2.5, 120));
  assert.equal(series.length, 9);
  assert.ok(series.every((p) => p.pace != null && Math.abs(p.pace - 400) < 1));
});

test('routeXY null without GPS', () => {
  assert.equal(routeXY(track(() => 2.5, 300, () => 160, false), 300, 300, 10), null);
  const xy = routeXY(track(() => 2.5, 300), 300, 300, 10);
  assert.ok(xy && xy.length === 61 && xy[0].y > xy[60].y, 'north is up');
});

test('mileAt integrates speed', () => {
  const pts = track(() => 1609.344 / 600, 600);
  assert.ok(Math.abs(mileAt(pts, 600_000) - 1) < 0.01);
  assert.ok(Math.abs(mileAt(pts, 300_000) - 0.5) < 0.01);
});
