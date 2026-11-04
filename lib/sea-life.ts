// What lives on the water, drawn from a camera 1.5 m up, so size and speed come from real meters at a real distance: a
// far whale is small and slow and a close fish is big and fast. Every sighting is a pure function of time since it began
// and keeps no particles. These run on the UI thread every frame, so each one is a worklet (lib/sea-life.test.ts checks).

import { GLASS_COUNT, glassAt } from './ocean-splash.ts';

export const FOCAL = 300;
export const CAM = 1.5;

export type SeaLifeKind = 'fly' | 'bait' | 'seal' | 'pod' | 'hump' | 'sperm' | 'blue';
export type Sighting = {
  kind: SeaLifeKind;
  width: number;
  screenH: number;
  horizon: number;
  x: number;
  dir: 1 | -1;
  z: number;
  /** Dolphins: travel in leaps rather than rolling up to breathe. */
  leap: boolean;
  /** Whales: how many breaths, how far apart, and how they leave. */
  n: number;
  gap: number;
  ending: 'fluke' | 'dive' | 'breach';
  wind: number;
  members: number;
  duration: number;
};

export type Ink = { back: string; belly: string; wing: string; line: string; puffA: string; puffB: string; puffC: string; shade: string; drop: string; ring: string; ghost: string; eye: string; pupil: string };
export type Scene = { layers: [Ink, Ink, Ink]; fade: number; glassFill: string; glassRim: string; glassDot: string; glassTrail: string };

function emptyInk(): Ink {
  'worklet';
  return { back: '', belly: '', wing: '', line: '', puffA: '', puffB: '', puffC: '', shade: '', drop: '', ring: '', ghost: '', eye: '', pupil: '' };
}

export function emptyScene(): Scene {
  'worklet';
  return { layers: [emptyInk(), emptyInk(), emptyInk()], fade: 1, glassFill: '', glassRim: '', glassDot: '', glassTrail: '' };
}

/** Lengths in meters, from general references. The rest is how each one moves at the surface. */
export const WHALES = {
  blue: { L: 27, z: 75, hump: 0.04, w: 0.62, fin: 0.84, finH: 0.012, roll: 7, v: 1.5, flukeW: 6, under: false },
  hump: { L: 14, z: 55, hump: 0.075, w: 0.5, fin: 0.64, finH: 0.035, roll: 4.2, v: 1.8, flukeW: 4.5, under: true },
  sperm: { L: 15, z: 65, hump: 0.06, w: 0.5, fin: 0.66, finH: 0.014, roll: 4.4, v: 0.6, flukeW: 4.5, under: false },
};
const FLUKE_S = 5.2;
const BREACH_RISE = 0.75;
const BREACH_AIR = 1.47;
const FLY_START_Z = 45;
const FLY_SPEED = 7.5;
const FLY_END_Z = 1.25;
const FLY_FRONT_Z = 5.5;
const BLOWS = {
  blue: { n: 26, v: 15, tau: 0.6, sp: 0.7, ang: 0, life: 2.8, r: 0.42 },
  hump: { n: 22, v: 6.2, tau: 0.5, sp: 2.5, ang: 0, life: 2.4, r: 0.5 },
  sperm: { n: 20, v: 8.8, tau: 0.55, sp: 1.3, ang: 0.8, life: 2.4, r: 0.42 },
  seal: { n: 5, v: 1.1, tau: 0.4, sp: 0.35, ang: 0, life: 1, r: 0.07 },
  dolphin: { n: 6, v: 2.2, tau: 0.35, sp: 0.5, ang: 0.15, life: 0.9, r: 0.09 },
  mist: { n: 18, v: 5, tau: 0.5, sp: 3.4, ang: 0, life: 2.2, r: 0.6 },
};

function chaikin(points: number[][], rounds: number): number[][] {
  'worklet';
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = out;
  }
  return pts;
}

const HUMP_BODY = chaikin([[0.5, 0], [0.46, 0.035], [0.36, 0.07], [0.2, 0.09], [0.05, 0.098], [-0.06, 0.085], [-0.1, 0.112], [-0.15, 0.075], [-0.3, 0.045], [-0.42, 0.02], [-0.5, 0.008], [-0.5, -0.008], [-0.42, -0.02], [-0.3, -0.05], [-0.1, -0.08], [0.1, -0.1], [0.3, -0.1], [0.42, -0.07], [0.5, -0.03]], 1);
const HUMP_BELLY = chaikin([[0.5, -0.01], [0.42, -0.03], [0.2, -0.04], [-0.05, -0.03], [-0.3, -0.02], [-0.3, -0.05], [-0.1, -0.08], [0.1, -0.1], [0.3, -0.1], [0.42, -0.07], [0.5, -0.03]], 1);
const HUMP_FIN = chaikin([[0.26, -0.07], [0.12, -0.24], [-0.02, -0.33], [0.1, -0.2], [0.16, -0.075]], 1);
const HUMP_TAIL = [[-0.5, 0], [-0.53, 0.1], [-0.58, 0.14], [-0.55, 0.04], [-0.56, 0], [-0.55, -0.04], [-0.58, -0.14], [-0.53, -0.1]];
const DOLPHIN = chaikin([[0.5, -0.005], [0.42, 0.015], [0.37, 0.05], [0.24, 0.085], [0.08, 0.1], [-0.03, 0.098], [-0.07, 0.175], [-0.13, 0.095], [-0.3, 0.055], [-0.44, 0.02], [-0.5, 0], [-0.58, 0.07], [-0.55, 0], [-0.58, -0.07], [-0.5, 0], [-0.44, -0.02], [-0.25, -0.05], [-0.02, -0.08], [0.2, -0.07], [0.38, -0.035], [0.5, -0.012]], 1);
const DOLPHIN_BELLY = chaikin([[0.5, -0.012], [0.36, -0.012], [0.18, -0.015], [-0.1, -0.012], [-0.3, -0.015], [-0.25, -0.05], [-0.02, -0.08], [0.2, -0.07], [0.38, -0.035]], 1);
const DOLPHIN_FIN = [[0.16, -0.06], [0.06, -0.17], [0.04, -0.07]];
const SEAL = chaikin([[-0.2, 0], [-0.22, 0.25], [-0.17, 0.46], [-0.04, 0.56], [0.1, 0.55], [0.2, 0.47], [0.3, 0.43], [0.37, 0.34], [0.34, 0.25], [0.22, 0.22], [0.16, 0.12], [0.14, 0]], 1);
const SEAL_NOSE = chaikin([[0.2, 0.47], [0.3, 0.43], [0.37, 0.34], [0.3, 0.36], [0.15, 0.42]], 1);

function unit(i: number, salt: number): number {
  'worklet';
  const v = Math.sin((i + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function circle(x: number, y: number, r: number): string {
  'worklet';
  return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
}
function poly(pts: number[][]): string {
  'worklet';
  if (pts.length < 3) return '';
  let d = '';
  for (let i = 0; i < pts.length; i++) d += `${i ? 'L' : 'M'}${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  return `${d}Z`;
}
/** Keeps the part of a shape above the water (or below it), so nothing needs a clip on screen. */
function cut(pts: number[][], y: number, above: boolean): number[][] {
  'worklet';
  const out: number[][] = [];
  const keep = (p: number[]) => (above ? p[1] <= y : p[1] >= y);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ka = keep(a);
    const kb = keep(b);
    if (ka) out.push(a);
    if (ka !== kb) {
      const t = (y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out;
}
/** A unit outline at a place: length L, turned by `ang` (up is positive), facing `dir`, squashed by `sq` for a spin. */
function place(outline: number[][], L: number, x: number, y: number, ang: number, dir: number, sq: number): number[][] {
  'worklet';
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const out: number[][] = [];
  for (let i = 0; i < outline.length; i++) {
    const X = outline[i][0] * L;
    const Y = -outline[i][1] * L;
    out.push([x + dir * (X * c + Y * s), y + sq * (-X * s + Y * c)]);
  }
  return out;
}
function surfaceOf(s: Sighting, z: number): number {
  'worklet';
  return s.horizon + (CAM * FOCAL) / z;
}
function ripple(I: Ink, x: number, y: number, z: number, r: number, grow: number, life: number, age: number) {
  'worklet';
  if (age < 0 || age > life) return;
  const m = FOCAL / z;
  const R = (r + grow * age) * m;
  const flat = Math.max(0.06, Math.min(0.42, (CAM / z) * 2.2));
  const ry = Math.max(0.4, R * flat);
  I.ring += `M${(x - R).toFixed(1)} ${y.toFixed(1)}a${R.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * R).toFixed(1)} 0a${R.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * R).toFixed(1)} 0`;
}
function drops(I: Ink, x: number, y: number, z: number, n: number, speed: number, age: number, salt: number) {
  'worklet';
  if (age < 0 || age > 3) return;
  const m = FOCAL / z;
  for (let i = 0; i < n; i++) {
    const a = (unit(i, salt) - 0.5) * 1.7;
    const v = (0.35 + 0.65 * unit(i, salt + 1)) * speed * m;
    const py = y - Math.cos(a) * v * age + 0.5 * 9.8 * m * age * age;
    if (py > y + 1) continue;
    I.drop += circle(x + (unit(i, salt + 2) - 0.5) * 0.8 * m + Math.sin(a) * v * age, py, Math.max(0.6, (0.03 + 0.06 * unit(i, salt + 3)) * m));
  }
}
function blow(I: Ink, kind: keyof typeof BLOWS, x: number, y: number, z: number, dir: number, wind: number, age: number, salt: number) {
  'worklet';
  const b = BLOWS[kind];
  if (age < 0 || age > b.life * 1.1 + 0.7) return;
  const m = FOCAL / z;
  for (let i = 0; i < b.n; i++) {
    const a = age - unit(i, salt) * 0.7;
    const life = b.life * (0.75 + 0.35 * unit(i, salt + 1));
    if (a < 0 || a > life) continue;
    const v = b.v * (0.55 + 0.53 * unit(i, salt + 2));
    const vx = Math.sin(b.ang) * dir * v + (unit(i, salt + 3) * 2 - 1) * b.sp;
    const e = b.tau * (1 - Math.exp(-a / b.tau));
    const px = x + vx * m * e - wind * m * 1.8 * a;
    const py = y - Math.cos(b.ang) * v * m * e;
    const r = Math.max(0.7, b.r * (0.6 + 0.7 * unit(i, salt + 4)) * m) + b.r * 0.9 * m * a;
    const k = 1 - a / life;
    const alpha = Math.pow(k, 1.5) * Math.min(1, a * 7 + 0.3);
    const dot = circle(px, py, r);
    if (alpha > 0.6) I.puffA += dot;
    else if (alpha > 0.3) I.puffB += dot;
    else I.puffC += dot;
    if (alpha > 0.3) I.shade += circle(px + r * 0.2, py + r * 0.3, r * 1.15);
  }
}

function rollBack(I: Ink, s: Sighting, x: number, u: number, arch: number) {
  'worklet';
  const w = WHALES[s.kind as 'blue'];
  const m = FOCAL / s.z;
  const L = w.L * m;
  const y0 = surfaceOf(s, s.z);
  const cc = -0.14 + 1.28 * u;
  const A = w.hump * L * arch;
  const lift = (p: number) => {
    'worklet';
    const q = (p - cc) / w.w;
    const v = 1 - q * q;
    return v > 0 ? A * v : 0;
  };
  const top: number[][] = [];
  for (let i = 0; i <= 30; i++) {
    const p = i / 30;
    const l = lift(p);
    if (l > 0.05) top.push([x + s.dir * (0.5 - p) * L, y0 - l]);
  }
  if (top.length < 3) return;
  I.back += poly([[top[0][0], y0 + 1], ...top, [top[top.length - 1][0], y0 + 1]]);
  const l = lift(w.fin);
  if (l > A * 0.2) {
    const fx = x + s.dir * (0.5 - w.fin) * L;
    const fh = Math.max(1.4, w.finH * L) * clamp01((l / A) * 1.4);
    const bw = Math.max(2, fh * 1.1);
    I.back += poly([[fx + s.dir * bw, y0 - l + 0.5], [fx + s.dir * bw * 0.2, y0 - l - fh * 0.7], [fx - s.dir * bw * 0.7, y0 - l - fh], [fx - s.dir * bw * 0.45, y0 - l - fh * 0.2], [fx - s.dir * bw * 0.6, y0 - l + 0.5]]);
  }
  I.line += `M${(top[0][0] - 2).toFixed(1)} ${y0.toFixed(1)}L${(top[0][0] + 2).toFixed(1)} ${y0.toFixed(1)}M${(top[top.length - 1][0] - 2).toFixed(1)} ${y0.toFixed(1)}L${(top[top.length - 1][0] + 2).toFixed(1)} ${y0.toFixed(1)}`;
}
function logAtSurface(I: Ink, s: Sighting, x: number, out: number, t: number) {
  'worklet';
  const w = WHALES.sperm;
  const L = w.L * (FOCAL / s.z);
  const y0 = surfaceOf(s, s.z) + Math.sin(t * 0.9) * 0.5;
  const top: number[][] = [];
  for (let i = 0; i <= 26; i++) {
    const p = i / 26;
    // The square head, a low back, one hump and the knuckles behind it.
    const head = Math.pow(clamp01(1 - Math.abs(p - 0.14) / 0.16), 0.5) * 0.052;
    const back = 0.016 * clamp01(1 - Math.abs(p - 0.45) / 0.42);
    const hump = 0.03 * Math.exp(-Math.pow((p - 0.68) / 0.05, 2));
    const knuckle = 0.012 * (Math.sin(p * 60) * 0.5 + 0.5) * (p > 0.7 && p < 0.92 ? 1 : 0);
    top.push([x + s.dir * (0.5 - p) * L, y0 - (head + back + hump + knuckle) * L * out]);
  }
  I.back += poly([[top[0][0], y0 + 1], ...top, [top[top.length - 1][0], y0 + 1]]);
}
function fluke(I: Ink, s: Sighting, x: number, u: number) {
  'worklet';
  const w = WHALES[s.kind as 'blue'];
  const m = FOCAL / s.z;
  const span = w.flukeW * m;
  const H = span * 0.62 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.7);
  if (H < 0.3) return;
  const tx = x - s.dir * w.L * m * 0.42;
  const y0 = surfaceOf(s, s.z);
  const tilt = (0.5 - 1.05 * u) * s.dir;
  const shape = (k: number) => {
    'worklet';
    const sw = span * 0.06;
    const raw = [[-sw * 1.7 * k, 0], [-sw * 0.8 * k, -H * 0.72], [-span * 0.2 * k, -H * 0.84], [-span * 0.5 * k, -H * 1.08], [-span * 0.26 * k, -H * 1.1], [-span * 0.02, -H * 0.96], [span * 0.26 * k, -H * 1.1], [span * 0.5 * k, -H * 1.08], [span * 0.2 * k, -H * 0.84], [sw * 0.8 * k, -H * 0.72], [sw * 1.7 * k, 0]];
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    const out: number[][] = [];
    for (let i = 0; i < raw.length; i++) out.push([tx + raw[i][0] * c - raw[i][1] * sn, y0 + 1 + raw[i][0] * sn + raw[i][1] * c]);
    return out;
  };
  I.back += poly(cut(shape(1), y0, true));
  if (w.under) I.belly += poly(cut(shape(0.6), y0, true));
  // Water sheeting off the tail as it goes.
  if (u > 0.25 && u < 0.9) for (let i = 0; i < 7; i++) {
    const f = ((u * 9 + unit(i, 4)) % 1) * 0.9;
    I.drop += circle(tx + (unit(i, 5) - 0.5) * span * 0.9, y0 - H * (1 - f * f), 0.8);
  }
}
function breach(I: Ink, s: Sighting, t: number) {
  'worklet';
  const w = WHALES.hump;
  const m = FOCAL / s.z;
  const L = w.L * m;
  const y0 = surfaceOf(s, s.z);
  const x = s.x + s.dir * (w.v + 2.2) * m * t;
  // Rises at about 8 m/s, then falls under gravity, turning onto its side. Real speeds, so far away it looks slow.
  const tau = Math.max(0, t - BREACH_RISE);
  const cm = t < BREACH_RISE ? -6 + 8 * t : 7.2 * tau - 4.9 * tau * tau;
  const ang = 1.15 - 1.05 * Math.pow(Math.min(1.4, tau / BREACH_AIR), 1.2);
  const y = y0 - cm * m;
  if (t < BREACH_RISE + BREACH_AIR + 0.8) {
    I.back += poly(cut(place(HUMP_BODY, L, x, y, ang, s.dir, 1), y0, true));
    I.back += poly(cut(place(HUMP_TAIL, L, x, y, ang, s.dir, 1), y0, true));
    I.belly += poly(cut(place(HUMP_BELLY, L, x, y, ang, s.dir, 1), y0, true));
    I.belly += poly(cut(place(HUMP_FIN, L, x, y, ang, s.dir, 1), y0, true));
  }
  drops(I, s.x, y0, s.z, 16, 5, t - 0.05, 20);
  ripple(I, s.x, y0, s.z, 2, 2, 2.4, t - 0.05);
  const crash = BREACH_RISE + BREACH_AIR;
  const cx = s.x + s.dir * (w.v + 2.2) * m * crash;
  drops(I, cx, y0, s.z, 54, 9.5, t - crash, 30);
  blow(I, 'mist', cx, y0, s.z, s.dir, s.wind, t - crash, 40);
  ripple(I, cx, y0, s.z, 3, 3, 3.4, t - crash);
  ripple(I, cx, y0, s.z, 1.5, 2, 2.6, t - crash);
}
function whale(I: Ink, s: Sighting, t: number) {
  'worklet';
  const w = WHALES[s.kind as 'blue'];
  const m = FOCAL / s.z;
  const L = w.L * m;
  const y0 = surfaceOf(s, s.z);
  const xAt = (tt: number) => {
    'worklet';
    return s.x + s.dir * w.v * m * tt;
  };
  const name = s.kind as 'blue';
  let end: number;
  if (s.kind === 'sperm') {
    // Rests at the surface and breathes many times, the blow angled forward, then arches and dives.
    end = 1.4 + (s.n - 1) * s.gap + 2.6;
    if (t < end) logAtSurface(I, s, xAt(t), Math.min(1, t / 1.5), t);
    for (let i = 0; i < s.n; i++) {
      const tb = 1.4 + i * s.gap;
      blow(I, name, xAt(tb) + s.dir * 0.4 * L, y0 - 1, s.z, s.dir, s.wind, t - tb, 50 + i * 7);
      ripple(I, xAt(tb) + s.dir * 0.4 * L, y0, s.z, 1, 1.2, 2, t - tb);
    }
  } else {
    end = s.n * s.gap;
    for (let i = 0; i < s.n; i++) {
      const tb = i * s.gap;
      const u = (t - tb) / w.roll;
      if (u >= 0 && u < 1) rollBack(I, s, xAt(t), u, 1);
      const tBlow = tb + 0.12 * w.roll;
      blow(I, name, xAt(tBlow) + s.dir * 0.4 * L, y0 - 1, s.z, s.dir, s.wind, t - tBlow, 50 + i * 7);
      ripple(I, xAt(tBlow) + s.dir * 0.4 * L, y0, s.z, 1, 1.2, 2, t - tBlow);
    }
  }
  if (s.ending === 'breach') {
    if (t >= end) breach(I, { ...s, x: xAt(end) }, t - end);
    return;
  }
  const lastDur = w.roll * 1.25;
  const uf = (t - end) / lastDur;
  if (uf >= 0 && uf < 1) rollBack(I, s, xAt(t), uf, 2);
  if (s.ending === 'fluke') {
    const u = (t - end - lastDur) / FLUKE_S;
    if (u >= 0 && u < 1) fluke(I, s, xAt(t), u);
    ripple(I, xAt(end + lastDur + FLUKE_S) - s.dir * L * 0.42, y0, s.z, 1.5, 1.4, 3, t - end - lastDur - FLUKE_S);
  }
}

function dolphins(I: Ink, s: Sighting, t: number) {
  'worklet';
  const m0 = FOCAL / s.z;
  const v = s.leap ? 5.5 : 1.8;
  const podX = s.x + s.dir * v * m0 * t;
  for (let i = 0; i < s.members; i++) {
    const z = s.z + (unit(i, 60) * 3.4 - 1.6);
    const m = FOCAL / z;
    const y = surfaceOf(s, z);
    const x = podX + ((i - s.members / 2) * (1.9 + unit(i, 61) * 1.1) - unit(i, 62)) * m;
    const L = 2.3 * m;
    const ph = unit(i, 63);
    if (s.leap) {
      const spin = i === 0;
      const T = spin ? 2.8 : 1.55 + unit(i, 64) * 0.35;
      const vz = spin ? 6.5 : 3.4;
      const ta = (2 * vz) / 9.8;
      const k = t / T + ph;
      const tau = (k - Math.floor(k)) * T;
      if (tau < ta) {
        const h = vz * tau - 4.9 * tau * tau;
        const ang = Math.atan2(vz - 9.8 * tau, v);
        const raw = spin ? Math.cos((tau / ta) * Math.PI * 6) : 1;
        const sq = Math.abs(raw) < 0.15 ? (raw < 0 ? -0.15 : 0.15) : raw;
        const yy = y - h * m - 0.1 * m;
        const turned = spin ? ang + 0.5 : ang;
        I.back += poly(cut(place(DOLPHIN, L, x, yy, turned, s.dir, sq), y, true));
        I.back += poly(cut(place(DOLPHIN_FIN, L, x, yy, turned, s.dir, sq), y, true));
        I.belly += poly(cut(place(DOLPHIN_BELLY, L, x, yy, turned, s.dir, sq), y, true));
      } else I.ghost += poly(cut(place(DOLPHIN, L, x, y + 0.5 * m, 0, s.dir, 1), y, false));
      if (tau < 0.7) {
        drops(I, x, y, z, 6, 2.6, tau, 70 + i);
        ripple(I, x, y, z, 0.3, 0.7, 1, tau);
      }
      if (tau >= ta && tau < ta + 0.7) {
        const lx = x + s.dir * v * 0.3 * m;
        drops(I, lx, y, z, 8, 3, tau - ta, 80 + i);
        ripple(I, lx, y, z, 0.4, 0.8, 1.2, tau - ta);
      }
    } else {
      const every = 5;
      const k = t / every + ph;
      const u = ((k - Math.floor(k)) * every) / 1.5;
      if (u < 1) {
        const h = -0.3 + 0.48 * Math.sin(Math.PI * u);
        const ang = 0.42 - 0.84 * u;
        const yy = y - h * m;
        I.back += poly(cut(place(DOLPHIN, L, x, yy, ang, s.dir, 1), y, true));
        I.back += poly(cut(place(DOLPHIN_FIN, L, x, yy, ang, s.dir, 1), y, true));
        I.ghost += poly(cut(place(DOLPHIN, L, x, yy, ang, s.dir, 1), y, false));
        blow(I, 'dolphin', x + s.dir * 0.35 * m, y, z, s.dir, s.wind, u * 1.5, 90 + i);
        ripple(I, x, y, z, 0.3, 0.5, 1.2, u * 1.5);
      } else I.ghost += poly(cut(place(DOLPHIN, L, x, y + 0.55 * m, 0, s.dir, 1), y, false));
    }
  }
}

function seal(I: Ink, s: Sighting, t: number) {
  'worklet';
  const m = FOCAL / s.z;
  const y = surfaceOf(s, s.z);
  const hold = s.duration - 2.2;
  const u = t < 1.2 ? t / 1.2 : t > hold + 1.2 ? 1 - (t - hold - 1.2) : 1;
  const e = u <= 0 ? 0 : u * u * (3 - 2 * u);
  const yy = y + (1 - e) * 0.62 * m + Math.sin(t * 1.1) * 0.03 * m;
  const tilt = Math.sin(t * 0.5) * 0.08;
  I.back += poly(cut(place(SEAL, m, s.x, yy, tilt, s.dir, 1), y, true));
  I.belly += poly(cut(place(SEAL_NOSE, m, s.x, yy, tilt, s.dir, 1), y, true));
  const eye = place([[0.08, 0.44]], m, s.x, yy, tilt, s.dir, 1)[0];
  if (eye[1] < y) I.pupil += circle(eye[0], eye[1], Math.max(0.9, 0.035 * m));
  for (let i = 0; i < 4; i++) blow(I, 'seal', s.x + s.dir * 0.32 * m, y - 0.3 * m, s.z, s.dir, s.wind, t - 1.4 - i * 2.6, 100 + i * 3);
  ripple(I, s.x, y, s.z, 0.3, 0.5, 1.4, t);
  ripple(I, s.x, y, s.z, 0.35, 0.7, 1.6, t - hold - 2.2);
}

function bait(I: Ink, s: Sighting, t: number) {
  'worklet';
  for (let i = 0; i < s.members; i++) {
    const z = s.z + unit(i, 110) * 2 - 1;
    const m = FOCAL / z;
    const y = surfaceOf(s, z);
    const tau = t - unit(i, 111) * 2.1;
    const v = 1.5 + unit(i, 112);
    const vx = unit(i, 113) * 1.6 - 0.8;
    const T = (2 * v) / 9.8;
    const dx = (unit(i, 114) * 3 - 1.5) * m;
    ripple(I, s.x + dx, y, z, 0.05, 0.2, 0.8, tau);
    ripple(I, s.x + dx + vx * T * m, y, z, 0.04, 0.22, 0.8, tau - T);
    if (tau < 0 || tau > T) continue;
    const h = v * tau - 4.9 * tau * tau;
    const ang = Math.atan2(v - 9.8 * tau, vx || 0.1);
    const len = 0.08 * m;
    const x = s.x + dx + vx * tau * m;
    const yy = y - h * m;
    I.line += `M${(x - Math.cos(ang) * len).toFixed(1)} ${(yy + Math.sin(ang) * len).toFixed(1)}L${(x + Math.cos(ang) * len).toFixed(1)} ${(yy - Math.sin(ang) * len).toFixed(1)}`;
  }
}

/** One flying fish glides straight at you. It starts as a dot and ends bigger than the buttons it passes in front of. */
function flyAt(scene: Scene, s: Sighting, t: number) {
  'worklet';
  const z = FLY_START_Z - FLY_SPEED * t;
  if (z < FLY_END_Z) return;
  const m = FOCAL / z;
  const p = (FLY_START_Z - z) / (FLY_START_Z - FLY_END_Z);
  const X = s.x + (s.dir * 1.3 - s.x) * Math.pow(p, 1.25);
  const h = Math.min(1, t / 0.7) * (1 + p * p);
  const x = s.width / 2 + X * m;
  const y = surfaceOf(s, z) - h * m;
  const layer = z < FLY_FRONT_Z ? 2 : z < 10.5 ? 1 : 0;
  const I = scene.layers[layer];
  if (t < 0.9) {
    for (let i = 0; i < 6; i++) {
      const at = i * 0.13;
      const zz = FLY_START_Z - FLY_SPEED * at;
      ripple(scene.layers[0], s.width / 2 + s.x * (FOCAL / zz), surfaceOf(s, zz), zz, 0.15, 0.4, 1, t - at);
    }
  }
  const L = 0.3 * m;
  if (L < 1.2) {
    I.back += circle(x, y, 0.9);
    return;
  }
  const span = 0.64 * m;
  const flut = t < 0.9 ? Math.sin(t * 60) * 0.09 : 0;
  for (let i = -1; i <= 1; i += 2) {
    I.wing += poly([[x + i * L * 0.1, y - L * 0.04], [x + i * span * 0.3, y - L * (0.28 + flut)], [x + i * span * 0.52, y - L * (0.06 + flut)], [x + i * span * 0.3, y + L * 0.05], [x + i * L * 0.1, y + L * 0.08]]);
    I.eye += circle(x + i * L * 0.09, y - L * 0.045, L * 0.042);
    I.pupil += circle(x + i * L * 0.09, y - L * 0.045, L * 0.024);
  }
  I.wing += poly([[x - L * 0.05, y + L * 0.08], [x - L * 0.2, y + L * 0.34], [x, y + L * 0.2], [x + L * 0.2, y + L * 0.34], [x + L * 0.05, y + L * 0.08]]);
  I.back += `M${(x - L * 0.17).toFixed(1)} ${y.toFixed(1)}a${(L * 0.17).toFixed(1)} ${(L * 0.15).toFixed(1)} 0 1 0 ${(L * 0.34).toFixed(1)} 0a${(L * 0.17).toFixed(1)} ${(L * 0.15).toFixed(1)} 0 1 0 ${(-L * 0.34).toFixed(1)} 0`;
  I.belly += `M${(x - L * 0.135).toFixed(1)} ${(y + L * 0.05).toFixed(1)}a${(L * 0.135).toFixed(1)} ${(L * 0.09).toFixed(1)} 0 1 0 ${(L * 0.27).toFixed(1)} 0a${(L * 0.135).toFixed(1)} ${(L * 0.09).toFixed(1)} 0 1 0 ${(-L * 0.27).toFixed(1)} 0`;
  if (z < 2.5) scene.fade = clamp01((z - FLY_END_Z) / 1.05);
}
/** Others cross side-on, closer than the wave. */
function flyAcross(I: Ink, s: Sighting, t: number, i: number) {
  'worklet';
  const start = 0.8 + unit(i, 120) * 1.8;
  const tt = t - start;
  if (tt < 0) return;
  const z = 7.5 + unit(i, 121) * 2.5;
  const m = FOCAL / z;
  const dir = unit(i, 122) < 0.5 ? 1 : -1;
  const x0 = dir > 0 ? 10 + unit(i, 123) * 80 : s.width - 10 - unit(i, 123) * 80;
  const x = x0 + dir * (6.5 + unit(i, 124) * 2) * m * tt;
  const y0 = surfaceOf(s, z);
  ripple(I, x0, y0, z, 0.2, 0.5, 1, tt);
  drops(I, x0, y0, z, 5, 2.2, tt, 125 + i);
  if (x < -60 || x > s.width + 60 || tt > 4) return;
  const y = y0 - Math.min(1, tt / 0.45) * (0.7 + unit(i, 126) * 0.4) * m;
  const L = 0.3 * m;
  const flut = tt < 0.5 ? Math.sin(tt * 70) * 0.05 : 0;
  const at = (pts: number[][]) => {
    'worklet';
    const out: number[][] = [];
    for (let j = 0; j < pts.length; j++) out.push([x + dir * pts[j][0] * L, y + pts[j][1] * L]);
    return out;
  };
  I.wing += poly(at([[0.2, -0.02], [-0.1, -0.42 - flut], [-0.42, -0.3 - flut], [-0.15, -0.08], [-0.08, 0]]));
  I.back += poly(at([[0.5, 0], [0.1, -0.1], [-0.34, -0.03], [-0.54, -0.13], [-0.45, 0], [-0.62, 0.14], [-0.34, 0.03], [0.1, 0.1]]));
  I.belly += poly(at([[0.47, 0.01], [0.1, 0.09], [-0.3, 0.03], [0.1, 0.01]]));
}
/** The spray on the glass as it passes: the same drops as coming back up from a dive. */
function glass(scene: Scene, s: Sighting, age: number) {
  'worklet';
  if (age < 0) return;
  const k = s.width / 270;
  for (let i = 0; i < GLASS_COUNT; i++) {
    const g = glassAt(i, age, 0.3);
    if (g.alpha <= 0.25) continue;
    const x = g.x * s.width;
    const y = g.y * s.screenH + g.run * k;
    const r = g.r * k * Math.min(1, g.alpha * 1.4);
    scene.glassFill += circle(x, y, r);
    scene.glassRim += circle(x, y, r);
    scene.glassDot += circle(x - r * 0.3, y - r * 0.35, r * 0.2);
    scene.glassTrail += `M${x.toFixed(1)} ${(y - g.tail * k).toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
}

export const FLY_PASS_S = (FLY_START_Z - FLY_END_Z) / FLY_SPEED;

export function sceneAt(s: Sighting, t: number): Scene {
  'worklet';
  const scene = emptyScene();
  if (t < 0 || t > s.duration) return scene;
  const far = scene.layers[0];
  const near = scene.layers[1];
  if (s.kind === 'hump' || s.kind === 'blue' || s.kind === 'sperm') whale(far, s, t);
  else if (s.kind === 'pod') dolphins(far, s, t);
  else if (s.kind === 'seal') seal(near, s, t);
  else if (s.kind === 'bait') bait(near, s, t);
  else {
    flyAt(scene, s, t);
    for (let i = 0; i < s.members; i++) flyAcross(near, s, t, i);
    glass(scene, s, t - FLY_PASS_S);
  }
  return scene;
}
