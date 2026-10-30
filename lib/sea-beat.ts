// The beat sea (mock board "Beat", 2026-10-30): the sea along the bottom of Home keeps the playing song's beat, and
// how the song changed decides how the water changes. A next song rolls one swell in from the right; a new genre is a
// mini tsunami (the sea pulls back, a tall crest curls in and breaks on the left edge); steering only retunes the tide.
// Pure, and worklet-safe, so components/bottles/sea-line.tsx draws every frame from it.

import { visualTempo } from './print-recipe.ts';
import type { SoundFeatures } from './sound.ts';

export type Rhythm = { tempo: number; amp: number };
export type SeaChange = 'song' | 'genre' | 'steer';

/** Where the surface rests, in px from the top of the sea, and the sea's full height (room above for a crest). */
export const SEA_BASE = 57;
export const SEA_TALL = 74;
/** One crest every two beats, a crest's length on screen. */
const K = (2 * Math.PI) / 130;

/** A song we can't hear yet rides a middling sea, not a flat one. */
export const CALM_RHYTHM: Rhythm = { tempo: 96, amp: 4.5 };

/** The song's rhythm on the water: its visual tempo (as the prints fold it), and a height from its energy. */
export function seaRhythm(sound: SoundFeatures | null): Rhythm {
  if (!sound) return CALM_RHYTHM;
  // Quiet acoustic songs go almost glassy; loud ones swell.
  const drive = Math.max(0, Math.min(1, sound.energy * (1 - 0.45 * sound.acousticness)));
  return { tempo: visualTempo(sound.tempo), amp: 1 + 9 * drive };
}

/** A next song's swell, in ms. */
export const SWELL_MS = 900;
/** The tsunami: the pull back, the crest's run in, its break on the left edge, then the new rhythm settles. */
export const DRAW_MS = 380;
export const RUN_MS = 640;
export const BREAK_MS = 460;
export const TSUNAMI_MS = DRAW_MS + RUN_MS + BREAK_MS;

/** A second wave this soon after the last one stacks into chop instead of firing again. */
export const STACK_MS = 1200;
/** After a jump or a steer, the song that arrives takes the tide it set, so it doesn't roll its own swell. */
export const ABSORB_MS = 6000;

/** What a song change does to the sea, given the last jump or steer before it. */
export function changeForSong(pending: { kind: SeaChange; at: number } | null, now: number): 'swell' | 'tide' {
  return pending && pending.kind !== 'song' && now - pending.at < ABSORB_MS ? 'tide' : 'swell';
}

export type SeaState = {
  /** Phase of the water you're hearing now, and of the water still ahead of a wave. */
  phase: number;
  phaseOld: number;
  live: Rhythm;
  old: Rhythm;
  /** 0 none, 1 swell, 2 tsunami; and ms since the last one started. */
  kind: number;
  since: number;
  /** Leftover energy from stacked waves. */
  chop: number;
  /** 0–1: a lift on each beat of the song's clock. */
  pulse: number;
};

export function ease(p: number): number {
  'worklet';
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The lift on each beat, from the song's clock in seconds (the print breathes on the same beat). */
export function beatPulse(clock: number, tempo: number): number {
  'worklet';
  const beat = 60 / tempo;
  const into = clock / beat - Math.floor(clock / beat);
  return Math.exp(-into * 6);
}

function water(x: number, phase: number, r: Rhythm, pulse: number): number {
  'worklet';
  return r.amp * (1 + 0.45 * pulse) * Math.sin(K * x + phase);
}

function chopAt(x: number, s: SeaState): number {
  'worklet';
  if (s.chop < 0.01) return 0;
  return s.chop * 2.4 * Math.sin(K * 2.7 * x - s.phase * 2.3 + 1.3) * Math.sin(K * 0.9 * x + s.phase * 1.1);
}

/** The tsunami's crest: where it is, how tall, or null outside its run. Its face (the left) is steep, its back long. */
export function crestOf(s: SeaState, width: number): { x: number; height: number } | null {
  'worklet';
  if (s.kind !== 2 || s.since < DRAW_MS * 0.7) return null;
  const run = clamp01((s.since - DRAW_MS * 0.7) / (RUN_MS + DRAW_MS * 0.3));
  const broke = clamp01((s.since - DRAW_MS - RUN_MS) / (BREAK_MS * 0.5));
  if (broke >= 1) return null;
  // About three times the bigger of the two songs' swells, never a ripple, never off the top.
  const full = Math.min(SEA_BASE - 12, Math.max(18, 3 * Math.max(s.old.amp, s.live.amp) + 6));
  // It rises out of the drained sea at the right, then speeds up toward the left edge.
  const x = width + 40 - (width + 40) * Math.pow(run, 1.35);
  return { x, height: full * Math.min(1, 0.55 + run * 2.2) * (1 - broke) * (1 - broke) };
}

/** A next song's swell: where its front is, and how strong its foam still is (1 → 0), or null. */
export function swellFront(s: SeaState, width: number): { x: number; foam: number } | null {
  'worklet';
  if (s.kind !== 1 || s.since >= SWELL_MS) return null;
  const p = s.since / SWELL_MS;
  return { x: width * (1 - ease(p)), foam: 1 - p };
}

/** Where the break's spray starts, in ms after the jump: just as the crest reaches the left edge. */
export const SPLASH_AT = DRAW_MS + RUN_MS - 40;

/** The surface's height (px from the top of the sea) at x. */
export function seaY(x: number, s: SeaState, width: number): number {
  'worklet';
  const now = water(x, s.phase, s.live, s.pulse);
  let y = 0;
  if (s.kind === 1) {
    // A next song: one clean swell rolls in from the right and leaves the new song's rhythm behind it.
    const p = clamp01(s.since / SWELL_MS);
    const front = width * (1 - ease(p));
    const behind = clamp01((x - (front - 36)) / 72);
    const ahead = water(x, s.phaseOld, s.old, s.pulse);
    const d = (x - front) / 30;
    const swell = (3 + 1.1 * s.live.amp) * Math.exp(-d * d) * Math.sin(Math.PI * Math.min(1, p * 1.15));
    y = (1 - behind) * ahead + behind * now - swell;
  } else if (s.kind === 2) {
    // A new genre. First the sea pulls back: the old water drains left and goes nearly flat, lower at the right.
    const draw = ease(clamp01(s.since / DRAW_MS));
    const ahead = water(x, s.phaseOld, s.old, s.pulse) * (1 - 0.85 * draw) + 6 * draw * (0.4 + (0.6 * x) / width);
    const crest = crestOf(s, width);
    if (crest) {
      // Behind the crest the new genre's rhythm builds back up; ahead it's still drained, sucked lower at its foot.
      const behind = clamp01((x - crest.x - 20) / 150);
      const d = x - crest.x;
      const shape = d < 0 ? Math.exp(-(d / 15) * (d / 15)) : Math.exp(-(d / 58) * (d / 58));
      const foot = (crest.x - 26 - x) / 24;
      y = (1 - behind) * (ahead + 3 * Math.exp(-foot * foot)) + behind * now - crest.height * shape;
    } else if (s.since < DRAW_MS + RUN_MS) y = ahead;
    else {
      // It broke on the left edge: the drained water fills back in from the right as the new rhythm settles.
      const fill = ease(clamp01((s.since - DRAW_MS - RUN_MS) / BREAK_MS));
      y = (1 - fill) * ahead * (1 - 0.6 * fill) + fill * now;
    }
  } else y = now;
  return SEA_BASE + y + chopAt(x, s);
}

/** Is a swell or the tsunami still crossing? */
export function waveActive(s: SeaState): boolean {
  'worklet';
  return (s.kind === 1 && s.since < SWELL_MS) || (s.kind === 2 && s.since < TSUNAMI_MS);
}

/**
 * One frame on: the water flows a beat's worth, the rhythm glides toward the song's (fast behind a wave, as a slow
 * tide otherwise), stacked chop dies down, and the beat lifts with the song's clock.
 */
export function stepSea(s: SeaState, dt: number, target: Rhythm, clock: number, playing: number): SeaState {
  'worklet';
  const active = waveActive(s);
  const glide = 1 - Math.exp(-dt / (active ? 80 : 650));
  const live = { tempo: s.live.tempo + (target.tempo - s.live.tempo) * glide, amp: s.live.amp + (target.amp - s.live.amp) * glide };
  // While the sea pulls back for a tsunami, the old water hurries left.
  const pull = s.kind === 2 && s.since < DRAW_MS + RUN_MS ? 0.006 * ease(clamp01(s.since / DRAW_MS)) : 0;
  return {
    phase: (s.phase + (dt * Math.PI * live.tempo) / 60000) % 1e6,
    phaseOld: (s.phaseOld + (dt * Math.PI * s.old.tempo) / 60000 + dt * pull) % 1e6,
    live,
    old: s.old,
    kind: active ? s.kind : 0,
    since: s.since + dt,
    chop: s.chop * Math.exp(-dt / 900),
    pulse: playing * beatPulse(clock, live.tempo),
  };
}

/**
 * A wave starts. The water ahead of it keeps the old rhythm. A swell or a jump while one is still crossing doesn't
 * fire again: it stacks into chop, so skipping fast makes a choppy sea, not a tsunami after a tsunami.
 */
export function startWave(s: SeaState, kind: 'song' | 'genre'): SeaState {
  'worklet';
  // A jump still breaks through a song's swell; only a jump on a jump, or a song on anything, stacks.
  const stacks = kind === 'genre' ? s.kind === 2 && waveActive(s) : waveActive(s) || s.since < STACK_MS;
  if (stacks) return { ...s, chop: Math.min(1.6, s.chop + (kind === 'genre' ? 0.9 : 0.5)) };
  return { ...s, kind: kind === 'genre' ? 2 : 1, since: 0, old: s.live, phaseOld: s.phase };
}

export function restingSea(r: Rhythm): SeaState {
  return { phase: 0, phaseOld: 0, live: r, old: r, kind: 0, since: 1e9, chop: 0, pulse: 0 };
}
