import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ABSORB_MS,
  CALM_RHYTHM,
  DRAW_MS,
  RUN_MS,
  SEA_BASE,
  SWELL_MS,
  TSUNAMI_MS,
  beatPulse,
  changeForSong,
  crestOf,
  restingSea,
  seaRhythm,
  seaY,
  startWave,
  stepSea,
  waveActive,
  type Rhythm,
  type SeaState,
} from './sea-beat.ts';
import type { SoundFeatures } from './sound.ts';

const W = 390;
const sound = (o: Partial<SoundFeatures>): SoundFeatures => ({
  tempo: 120, key: 0, mode: 1, energy: 0.5, danceability: 0.5, acousticness: 0.2, instrumentalness: 0,
  speechiness: 0.05, liveness: 0.1, valence: 0.5, loudness: -8, ...o,
});

function run(s: SeaState, ms: number, target: Rhythm, step = 16): SeaState {
  for (let t = 0; t < ms; t += step) s = stepSea(s, step, target, t / 1000, 1);
  return s;
}

function heights(s: SeaState): number[] {
  const ys: number[] = [];
  for (let x = 0; x <= W; x += 6) ys.push(seaY(x, s, W));
  return ys;
}

const tallest = (s: SeaState) => SEA_BASE - Math.min(...heights(s));
const spread = (s: SeaState) => Math.max(...heights(s)) - Math.min(...heights(s));

test('loud songs swell, quiet acoustic songs go almost glassy', () => {
  const loud = seaRhythm(sound({ energy: 0.92, acousticness: 0.05 }));
  const quiet = seaRhythm(sound({ energy: 0.25, acousticness: 0.9 }));
  assert.ok(loud.amp > 8);
  assert.ok(quiet.amp < 2.5);
});

test('the beat is the print beat: BPM folded into 70–140', () => {
  assert.equal(seaRhythm(sound({ tempo: 160 })).tempo, 80);
  assert.equal(seaRhythm(sound({ tempo: 60 })).tempo, 120);
  assert.deepEqual(seaRhythm(null), CALM_RHYTHM);
});

test('each beat lifts the water and falls away before the next', () => {
  assert.equal(beatPulse(0, 120), 1);
  assert.ok(beatPulse(0.45, 120) < 0.01);
  assert.ok(Math.abs(beatPulse(0.5, 120) - 1) < 1e-9);
});

test('a next song rolls one swell in from the right and leaves its rhythm behind', () => {
  const quiet: Rhythm = { tempo: 80, amp: 1.5 };
  const loud: Rhythm = { tempo: 128, amp: 9 };
  let s = run(restingSea(quiet), 500, quiet);
  s = startWave(s, 'song');
  assert.equal(s.kind, 1);
  s = run(s, 300, loud);
  // The swell's front is partway across: still quiet water ahead of it on the left.
  const leftEdge = heights(s).slice(0, 10);
  assert.ok(Math.max(...leftEdge) - Math.min(...leftEdge) < 5, 'water ahead of the swell keeps the old rhythm');
  s = run(s, SWELL_MS, loud);
  assert.equal(waveActive(s), false);
  assert.ok(spread(s) > 12, 'behind it, the loud song');
});

test('a new genre: the sea pulls back flat, then a crest about three times the swell curls in', () => {
  const r: Rhythm = { tempo: 100, amp: 6 };
  let s = startWave(run(restingSea(r), 400, r), 'genre');
  assert.equal(s.kind, 2);
  s = run(s, DRAW_MS * 0.65, r);
  assert.ok(spread(s) < r.amp, 'drawn back, it is nearly flat');
  assert.equal(crestOf(s, W), null);
  s = run(s, DRAW_MS * 0.35 + RUN_MS * 0.3, r);
  const crest = crestOf(s, W);
  assert.ok(crest && crest.height >= 3 * r.amp, 'the crest stands about three times the song');
  assert.ok(tallest(s) >= 3 * r.amp - 1);
});

test('the crest breaks on the left edge and the new rhythm settles', () => {
  const r: Rhythm = { tempo: 100, amp: 6 };
  let s = startWave(restingSea(r), 'genre');
  s = run(s, DRAW_MS + RUN_MS - 40, r);
  const crest = crestOf(s, W);
  assert.ok(crest && crest.x < 40, 'by the end of its run it is at the left edge');
  s = run(s, TSUNAMI_MS, r);
  assert.equal(waveActive(s), false);
  assert.ok(tallest(s) < r.amp * 1.5 + 1, 'settled back to the song');
});

test('skipping fast stacks swells into chop instead of firing wave after wave', () => {
  const r: Rhythm = { tempo: 100, amp: 4 };
  let s = startWave(restingSea(r), 'song');
  s = run(s, 200, r);
  const again = startWave(s, 'song');
  assert.equal(again.since, s.since, 'no second swell');
  assert.ok(again.chop > 0);
  const choppy = startWave(startWave(again, 'song'), 'song');
  assert.ok(choppy.chop > again.chop);
});

test('a jump still breaks through a swell, but not through a tsunami', () => {
  const r: Rhythm = { tempo: 100, amp: 4 };
  const swelling = run(startWave(restingSea(r), 'song'), 200, r);
  assert.equal(startWave(swelling, 'genre').kind, 2);
  const crashing = run(startWave(restingSea(r), 'genre'), 300, r);
  const twice = startWave(crashing, 'genre');
  assert.equal(twice.since, crashing.since);
  assert.ok(twice.chop > 0);
});

test('steering retunes the tide over a couple of seconds, with no wave', () => {
  const from: Rhythm = { tempo: 80, amp: 2 };
  const to: Rhythm = { tempo: 130, amp: 9 };
  let s = run(restingSea(from), 300, from);
  s = run(s, 600, to);
  assert.equal(s.kind, 0);
  assert.ok(s.live.amp > 4 && s.live.amp < 8, 'partway there after 0.6 s');
  s = run(s, 2000, to);
  assert.ok(Math.abs(s.live.amp - to.amp) < 0.3, 'there after a couple of seconds');
});

test('the song after a jump or a steer takes the tide it set instead of its own swell', () => {
  assert.equal(changeForSong(null, 1000), 'swell');
  assert.equal(changeForSong({ kind: 'genre', at: 1000 }, 1400), 'tide');
  assert.equal(changeForSong({ kind: 'steer', at: 1000 }, 2000), 'tide');
  assert.equal(changeForSong({ kind: 'genre', at: 1000 }, 1000 + ABSORB_MS + 1), 'swell');
});

test('the water stays inside the sea, even under the tallest crest and the hardest chop', () => {
  const loud: Rhythm = { tempo: 140, amp: 10 };
  let s = startWave(run(restingSea(loud), 300, loud), 'genre');
  s = { ...s, chop: 1.6 };
  for (let t = 0; t < TSUNAMI_MS; t += 16) {
    s = stepSea(s, 16, loud, t / 1000, 1);
    for (const y of heights(s)) assert.ok(y > 0 && y < 74, `y ${y.toFixed(1)} at ${t} ms`);
  }
});
