// The moment you hit the water. Three things happen, and how hard you swiped sets the mix (the user's call, 2026-11-03):
// a slow slide is mostly the view wobbling, with a small crown and gentle bubbles; a hard flick is mostly a big crown of
// water, with some wobble and bubbles behind it. Coming back up, drops run down the glass. Every part is a pure function
// of time since the moment, so the frame worklet keeps no particles. Sizes are in the 270-wide units the art is drawn in.

export type Splash = {
  /** 0 nothing, 1 going under, 2 coming back up. */
  kind: 0 | 1 | 2;
  /** Seconds since it started. */
  e: number;
  /** 0 a slow slide to 1 a hard flick. */
  power: number;
  /** Where the surface was on screen when it started. */
  y0: number;
};

export const NO_SPLASH: Splash = { kind: 0, e: 0, power: 0, y0: 0 };
export const SPLASH_IN_S = 2.2;
export const SPLASH_OUT_S = 2.6;
export const DROP_COUNT = 90;
export const RUSH_COUNT = 90;
export const GLASS_COUNT = 26;
/** The dive crosses this going down to start a splash, and this going up to start the drops on the glass. */
export const DIVE_IN_AT = 0.02;
export const DIVE_OUT_AT = 0.14;

function unit(i: number, salt: number): number {
  'worklet';
  const v = Math.sin((i + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/** How hard the swipe was, from how many screens a second the water was moving. */
export function splashPower(screensPerSecond: number): number {
  'worklet';
  const v = (Math.abs(screensPerSecond) - 0.25) / 2.15;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The mix at a given swipe. Bubbles stay about the same; the crown and the wobble trade places. */
export function splashMix(power: number): { crown: number; wobble: number; rush: number; drops: number } {
  'worklet';
  return { crown: 0.3 + 0.7 * power, wobble: 1 - 0.5 * power, rush: 0.55 + 0.1 * power, drops: 0.28 + 0.72 * power };
}

export function splashOver(s: Splash): boolean {
  'worklet';
  return s.kind === 0 || s.e >= (s.kind === 1 ? SPLASH_IN_S : SPLASH_OUT_S);
}

/** How far the view bends, in art units. It starts strong and settles in about a second. */
export function wobbleAt(e: number, power: number): number {
  'worklet';
  if (e > 1.5) return 0;
  return 11 * splashMix(power).wobble * Math.exp(-e * 2.8);
}

/** How much the surface itself heaves at a point across the screen, in art units. */
export function kickAt(x: number, e: number, power: number): number {
  'worklet';
  const k = (0.35 + 0.75 * power) * Math.exp(-e * 2.6);
  return (Math.sin(x * 0.055 - e * 11) * 9 + Math.sin(x * 0.13 + e * 8) * 4) * k;
}

/** The crown's height at a point across the screen (fx 0 to 1), in art units: it jumps up and falls back in about half a second. */
export function crownAt(fx: number, e: number, power: number): number {
  'worklet';
  if (e <= 0 || e >= 0.62) return 0;
  const tall = Math.sin((e / 0.62) * Math.PI) * 74 * splashMix(power).crown;
  const c = Math.cos((fx - 0.5) * Math.PI * 1.15);
  const shape = Math.pow(c > 0 ? c : 0, 1.2);
  const spikes = 0.55 + 0.45 * Math.abs(Math.sin(fx * 23 + 1.4)) * Math.abs(Math.sin(fx * 9));
  return tall * shape * spikes;
}

/** One thrown drop, relative to the middle of the screen and where the surface was. `on` is false once it's fallen back. */
export function dropAt(i: number, e: number, power: number): { x: number; y: number; r: number; on: boolean } {
  'worklet';
  const mix = splashMix(power);
  if (i >= DROP_COUNT * mix.drops) return { x: 0, y: 0, r: 0, on: false };
  const spread = (unit(i, 1) + unit(i, 2) - 1) * 0.62 * 270;
  const vx = spread * (0.5 + unit(i, 3));
  const vy = -(170 + unit(i, 4) * (70 + 420 * power));
  const y = vy * e + 525 * e * e;
  return { x: spread + vx * e, y, r: 0.8 + unit(i, 5) * 2.4, on: y <= 0 || e < 0.05 };
}

/** One rushing bubble: it starts below you and streams up past, big ones close and quick. */
export function rushAt(i: number, e: number, power: number, h: number): { x: number; y: number; r: number; alpha: number; on: boolean } {
  'worklet';
  const mix = splashMix(power);
  const life = 0.9 + unit(i, 6) * 1.1;
  if (i >= RUSH_COUNT * mix.rush || e >= life) return { x: 0, y: 0, r: 0, alpha: 0, on: false };
  const r = Math.pow(unit(i, 7), 3.2) * 9 + 0.9;
  const speed = (170 + unit(i, 8) * 420) * (0.6 + power * 0.5) * (0.7 + r * 0.05);
  // The speed eases off as it goes: integrated, it's this curve instead of a straight line.
  const y = unit(i, 9) * (h + 240) + 40 - speed * (1 - Math.exp(-e * 0.5)) * 2;
  const fade = Math.min(e * 6, (life - e) * 2.5);
  return { x: unit(i, 10), y, r, alpha: fade < 0 ? 0 : fade > 1 ? 1 : fade, on: true };
}

/** Rings spreading on the surface where you went in. */
export function ringAt(i: number, e: number, power: number): { radius: number; alpha: number } {
  'worklet';
  const age = e - i * 0.14;
  if (age <= 0) return { radius: 0, alpha: 0 };
  const a = (0.65 - age * 0.7) * splashMix(power).crown;
  return { radius: 20 + age * 170, alpha: a < 0 ? 0 : a };
}

/** A drop on the glass as you come back up: it clings, then runs down, leaving a thin trail. Only ever goes down. */
export function glassAt(i: number, e: number, power: number): { x: number; y: number; r: number; tail: number; run: number; alpha: number } {
  'worklet';
  const life = 1 + unit(i, 11) * 1.4;
  if (i >= GLASS_COUNT * (0.5 + 0.5 * power) || e >= life) return { x: 0, y: 0, r: 0, tail: 0, run: 0, alpha: 0 };
  const v = 16 + unit(i, 12) * 74;
  const run = v * e + 17 * e * e;
  const fade = Math.min(e * 8, (life - e) * 2.2);
  return { x: 0.015 + unit(i, 13) * 0.97, y: unit(i, 14) * 0.72, r: 1.6 + unit(i, 15) * 3.4, tail: run < 46 ? run : 46, run, alpha: fade < 0 ? 0 : fade > 1 ? 1 : fade };
}
