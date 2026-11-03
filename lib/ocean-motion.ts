// How creatures move. A pose is a pure function of time, so the canvas (a worklet) and the tap test (JS) agree without
// sharing any state. They wander near a home spot and turn around rather than crossing the screen, each kind in its own
// way, and now and then one does its own move. Only motion here: nothing about how a creature looks.

import { floorAt } from './ocean-scene.ts';

export type Mover = { seed: number; pace: number; band: number; x: number; look: string; reach?: number };
export type Pose = {
  x: number;
  y: number;
  /** -1 to 1: which way it faces. Passing through 0 is the turn itself, seen edge on. */
  face: number;
  tail: number;
  tilt: number;
  /** A full roll during a flourish, in radians. */
  spin: number;
  /** A puffer's size swell. */
  puff: number;
  /** 0 to 1: how far into its move. */
  flash: number;
};

const TOP = 0.2;
const BOTTOM = 0.72;
const HOME_LEFT = 0.18;
const HOME_SPAN = 0.64;

/** The x and band that make a creature's home a given spot on screen, in shares of its width and height. */
export function homeAt(fx: number, fy: number): { x: number; band: number } {
  'worklet';
  return { x: (fx - HOME_LEFT) / HOME_SPAN, band: (fy - TOP) / (BOTTOM - TOP) };
}
const TAU = 6.2831853;

function unit(seed: number, salt: number): number {
  'worklet';
  const v = Math.sin((seed + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

function faceOf(c: number): number {
  'worklet';
  const v = c * 5;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Every 22 to 44 seconds a creature does its move: 0 most of the time, rising to 1 and back over 1.8 seconds. */
export function flourish(seed: number, t: number): number {
  'worklet';
  const period = 22 + unit(seed, 8) * 22;
  const p = ((t + unit(seed, 9) * period) % period + period) % period;
  return p > 1.8 ? 0 : Math.sin((Math.PI * p) / 1.8);
}

/** The same tempo, or half or double it, within 4%: close enough to dance to. */
export function tempoMatches(mine: number, song: number): boolean {
  'worklet';
  if (!(mine > 0) || !(song > 0)) return false;
  const near = (a: number, b: number) => {
    'worklet';
    return Math.abs(a - b) / b <= 0.04;
  };
  return near(mine, song) || near(mine * 2, song) || near(mine, song * 2);
}

export function swimPose(m: Mover, t: number, w: number, h: number): Pose {
  'worklet';
  const ph = unit(m.seed, 1) * TAU;
  const ph2 = unit(m.seed, 2) * TAU;
  const fl = flourish(m.seed, t);
  const hx = (HOME_LEFT + HOME_SPAN * m.x) * w;
  const r = m.reach ?? 1;
  const hy = (TOP + (BOTTOM - TOP) * Math.max(0, Math.min(1, m.band))) * h;
  const p = m.pace;
  switch (m.look) {
    case 'darter': {
      // Dash and pause: its pace surges and stalls.
      const u = t * 0.22 * p + 0.55 * Math.sin(t * 0.9 * p + ph);
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.22 * r, y: hy + Math.sin(u * 0.7 + ph2) * 38 * r, face: faceOf(c), tail: Math.sin(t * 11 + ph), tilt: Math.cos(u * 0.7 + ph2) * 0.1 * (c >= 0 ? 1 : -1), spin: 0, puff: 1, flash: fl };
    }
    case 'turtle': {
      const u = t * 0.07 * p;
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.2 * r, y: hy + Math.sin(u * 0.8 + ph2) * 42 * r, face: faceOf(c), tail: Math.sin(t * 2.2 + ph), tilt: Math.cos(u * 0.8 + ph2) * 0.12 * (c >= 0 ? 1 : -1), spin: fl > 0 ? TAU * ((1 - Math.cos(Math.PI * fl)) / 2) * 0 : 0, puff: 1, flash: fl };
    }
    case 'jelly': {
      const pulse = Math.sin(t * 1.3 * p + ph);
      return { x: hx + Math.sin(t * 0.1 + ph) * w * 0.12, y: hy + Math.sin(t * 0.22 + ph2) * 40 - pulse * 6 - fl * 26, face: 1, tail: pulse, tilt: Math.sin(t * 0.21 + ph) * 0.12, spin: 0, puff: 1, flash: fl };
    }
    case 'puffer': {
      const u = t * 0.12 * p;
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.1 * r, y: hy + Math.sin(u * 1.4 + ph2) * 24 * r, face: faceOf(c), tail: Math.sin(t * 5 + ph), tilt: 0, spin: 0, puff: 1 + 0.55 * fl, flash: fl };
    }
    case 'manta': {
      // A wide figure of eight, and now and then a full loop.
      const u = t * 0.09 * p;
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.24 * r, y: hy + Math.sin(2 * (u + ph)) * 40 * r, face: faceOf(c), tail: Math.sin(t * 1.6 + ph), tilt: Math.cos(2 * (u + ph)) * 0.18 * (c >= 0 ? 1 : -1), spin: fl > 0 ? TAU * (1 - Math.cos((Math.PI * fl) / 2)) : 0, puff: 1, flash: fl };
    }
    case 'seahorse': {
      return { x: hx + Math.sin(t * 0.09 + ph) * 18, y: hy + Math.sin(t * 0.5 * p + ph2) * 14, face: Math.sin(t * 0.05 + ph) >= 0 ? 1 : -1, tail: Math.sin(t * 3 * p + ph), tilt: Math.sin(t * 0.5 + ph) * 0.08 + fl * 0.3, spin: 0, puff: 1, flash: fl };
    }
    case 'eel': {
      const u = t * 0.13 * p;
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.18 * r, y: hy + Math.sin(u * 1.7 + ph2) * 22 * r, face: faceOf(c), tail: Math.sin(t * 4 + ph), tilt: 0, spin: 0, puff: 1, flash: fl };
    }
    default: {
      // Clownfish and drifters potter about, and sometimes turn a roll.
      const u = t * 0.16 * p;
      const c = Math.cos(u + ph);
      return { x: hx + Math.sin(u + ph) * w * 0.14 * r, y: hy + Math.sin(u * 1.3 + ph2) * 30 * r, face: faceOf(c), tail: Math.sin(t * 9 * p + ph), tilt: Math.cos(u * 1.3 + ph2) * 0.08 * (c >= 0 ? 1 : -1), spin: fl > 0 ? TAU * (1 - Math.cos((Math.PI * fl) / 2)) : 0, puff: 1, flash: fl };
    }
  }
}

/**
 * Where a sleeper rests or a bottle lies. On the sea floor it lies spread across the sand. Above that there's no ground,
 * so it hangs still in the water at its own spot. Never a pile.
 */
export function restSpot(seed: number, i: number, n: number, col: number, row: number, w: number, h: number): { x: number; y: number } {
  'worklet';
  const slot = (i + 0.5) / Math.max(1, n);
  const jitter = (unit(seed, 2) - 0.5) * (0.5 / Math.max(1, n));
  const fx = 0.08 + (slot + jitter) * 0.84;
  if (row >= 3) return { x: fx * w, y: h - floorAt(col, fx) * h - 5 - unit(seed, 3) * 6 };
  return { x: fx * w, y: (0.3 + unit(seed, 3) * 0.42) * h };
}

/** How far up a bubble is, 0 to 1. The beat adds a tiny nudge on top; it must never multiply the clock, or bubbles jerk. */
export function bubbleProgress(i: number, t: number, beat: number): number {
  'worklet';
  const speed = 0.035 + ((i * 37) % 11) * 0.0055;
  const v = t * speed + ((i * 0.618) % 1) + beat * 0.004;
  return v - Math.floor(v);
}

/** The tiny submarine, puttering slowly back and forth. It turns around at each end. */
export function subPose(t: number, w: number, h: number, fx: number, fy: number): Pose {
  'worklet';
  const u = t * 0.05;
  const c = Math.cos(u);
  return { x: fx * w + Math.sin(u) * w * 0.3, y: fy * h + Math.sin(t * 0.4) * 7, face: faceOf(c), tail: Math.sin(t * 7), tilt: Math.sin(t * 0.4) * 0.03, spin: 0, puff: 1, flash: 0 };
}

/** The squid moves the way squid do: a squeeze and a push up, then a slow sink. */
export function squidPose(t: number, w: number, h: number, fx: number, fy: number): Pose {
  'worklet';
  const cycle = 5;
  const p = (t % cycle) / cycle;
  // A quick push for the first fifth of each cycle, drifting back down over the rest.
  const lift = p < 0.2 ? Math.sin((p / 0.2) * (Math.PI / 2)) : 1 - (p - 0.2) / 0.8;
  const squeeze = p < 0.2 ? Math.sin((p / 0.2) * Math.PI) : 0;
  return { x: fx * w + Math.sin(t * 0.07) * w * 0.14, y: fy * h - lift * 46, face: 1, tail: squeeze * 2 - 1, tilt: Math.sin(t * 0.07) * 0.14, spin: 0, puff: 1, flash: 0 };
}

export const MAX_BOTTLES = 10;

/** Bottles float, so they all bob along near the top of Popular, spread in a loose line. */
export function bottleSpot(i: number, n: number, w: number, h: number): { x: number; y: number } {
  'worklet';
  return { x: (0.08 + ((i + 0.5) / Math.max(1, n)) * 0.84) * w, y: (0.17 + ((i % 3) / 2) * 0.05) * h };
}

/** Two creatures closer than this push each other apart, so nothing sits on top of anything else. Nothing outside it. */
export function separation(ax: number, ay: number, bx: number, by: number, reach: number): [number, number] {
  'worklet';
  const dx = ax - bx;
  const dy = ay - by;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= reach) return [0, 0];
  const f = 1 - d / reach;
  const push = f * f * reach * 0.5;
  if (d < 0.001) return [push, 0];
  return [(dx / d) * push, (dy / d) * push];
}

/** In Open blue everyone rides the same current: a slow shared drift and swell, so they move as one. */
export function currentDrift(x: number, t: number, w: number): [number, number] {
  'worklet';
  return [Math.sin(t * 0.06) * w * 0.1, Math.sin((x / w) * 6 + t * 0.4) * 12];
}

/** In Midnight creatures flash to find each other: 1 while it's lit, a few seconds apart; partners share a seed. */
export function blink(seed: number, t: number): number {
  'worklet';
  const period = 3 + unit(seed, 11) * 4;
  const p = ((t + unit(seed, 12) * period) % period) / period;
  return p < 0.18 ? Math.sin((p / 0.18) * Math.PI) : 0;
}

export function schoolOffset(i: number): [number, number] {
  'worklet';
  const dx = [0, -15, -11, -26, -22, -34, -38, -46];
  const dy = [0, -7, 8, 2, -13, 9, -5, 4];
  const k = i % dx.length;
  const lap = Math.floor(i / dx.length);
  return [dx[k] - lap * 18, dy[k] + lap * 3];
}

/** How far a point is pushed away from something passing: smooth to nothing at r. */
export function scatter(px: number, py: number, fromX: number, fromY: number, r: number): [number, number] {
  'worklet';
  const dx = px - fromX;
  const dy = py - fromY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= r) return [0, 0];
  const force = 1 - d / r;
  const push = force * force * r * 0.55;
  if (d < 0.001) return [push, 0];
  return [(dx / d) * push, (dy / d) * push];
}

export type StagedMover = Mover & { awake: boolean; leader: number; schoolIndex: number; restI: number; restN: number };

/** Where everyone in a place is right now. The drawing and the tap test both use this, so a tap lands on what you see. */
export function stagePoses(members: StagedMover[], col: number, row: number, t: number, w: number, h: number): Pose[] {
  'worklet';
  const k = w / 270;
  const out: Pose[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (!m.awake) {
      const r = restSpot(m.seed, m.restI, m.restN, col, row, w, h);
      out.push({ x: r.x, y: r.y + Math.sin(t * 0.4 + m.seed) * 1.2, face: m.seed % 2 === 0 ? 1 : -1, tail: 0, tilt: 0, spin: 0, puff: 1, flash: 0 });
      continue;
    }
    const lead = m.leader >= 0 ? members[m.leader] : m;
    const pose = swimPose({ seed: lead.seed, pace: lead.pace, band: lead.band, x: lead.x, look: lead.look, reach: lead.reach }, t, w, h);
    if (col === 2) {
      const drift = currentDrift(pose.x, t, w);
      pose.x += drift[0];
      pose.y += drift[1];
    }
    if (m.leader >= 0) {
      const o = schoolOffset(m.schoolIndex);
      pose.x += o[0] * (pose.face >= 0 ? 1 : -1) * k;
      pose.y += o[1] * k;
    }
    out.push(pose);
  }
  return out;
}
