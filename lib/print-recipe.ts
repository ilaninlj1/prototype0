// Measured sound and cover color become overlapping rings of ink.
// Seeded recipes, worklet motion and rounded stills stay deterministic.

import { keyLabel } from './sound.ts';
import type { SoundFeatures } from './sound.ts';

export const RECIPE_V = 1;

export type Ring = { cx: number; cy: number; radius: number; weight: number; color: string };

export type PrintRecipe = {
  v: 1;
  seed: number;
  source: 'sound' | 'cover';
  rings: Ring[];
  ground: string;
  ink: string;
  particles: number;
  speed: number;
  beat: number;
  turbulence: number;
  texture: 'grain' | 'line';
  stroke: 'dash' | 'trail';
  regularity: number;
  brightness: number;
  label: string | null;
};

export type PrintStill = {
  rings: { color: string; lines: number[][] }[];
  ink: string;
  ground: string;
};

function hash(i: number, seed: number, salt: number): number {
  'worklet';
  let value = ((seed >>> 0) + Math.imul(i + 1, 0x9e3779b9) + Math.imul(salt, 0x6d2b79f5)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
  value = (value ^ ((value + Math.imul(value ^ (value >>> 7), value | 61)) >>> 0)) >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

/** A particle's stable random number in [0, 1), for motion layered on top of the print (scatter, fall). */
export function particleHash(i: number, seed: number): number {
  'worklet';
  return hash(i, seed, 9);
}

export function visualTempo(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 96;
  while (bpm >= 140) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  return bpm;
}

export function isBannedHue(h: number): boolean {
  return h >= 260 && h <= 320;
}

function coverHue(h: number): number {
  let hue = ((h % 360) + 360) % 360;
  if (isBannedHue(hue)) hue = hue < 290 ? 250 : 330;
  if (hue === 250) return 220;
  if (hue === 330) return 345;
  return hue;
}

function hslToHex(h: number, s: number, l: number): string {
  const amplitude = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function recipeFor(
  trackId: number,
  sound: SoundFeatures | null,
  cover: { hue: number; neutral: boolean } | null,
): PrintRecipe {
  const seed = trackId >>> 0;
  const ground = '#0d1426';
  const ink = '#f3ead8';
  const energy = sound?.energy ?? 0.5;
  const beat = 60 / visualTempo(sound?.tempo ?? 96);
  const brightness = sound === null ? 0.8 : Math.max(0.5, Math.min(1, (sound.loudness + 30) / 30));
  let rings: Ring[];

  if (sound !== null && sound.key !== null) {
    const fifths = (sound.key * 7) % 12;
    const hue = sound.mode === 0 ? 172 + fifths * 4 : 2 + fifths * 5;
    const tonic = hslToHex(hue, 0.62, 0.58 * brightness + 0.1);
    const third = hslToHex(hue, 0.5, 0.72);
    const pitches = sound.mode === null
      ? [sound.key, (sound.key + 7) % 12]
      : [sound.key, (sound.key + (sound.mode === 0 ? 3 : 4)) % 12, (sound.key + 7) % 12];
    const radii = sound.mode === null ? [0.22, 0.13] : [0.22, 0.14, 0.12];
    const weights = sound.mode === null ? [0.62, 0.38] : [0.5, 0.3, 0.2];
    const colors = sound.mode === null ? [tonic, ink] : [tonic, third, ink];
    rings = pitches.map((pc, i) => {
      const angle = ((pc * 7) % 12) / 12 * 2 * Math.PI - Math.PI / 2;
      return {
        cx: 0.5 + 0.6 * 0.2 * Math.cos(angle),
        cy: 0.5 + 0.6 * 0.2 * Math.sin(angle),
        radius: radii[i],
        weight: weights[i],
        color: colors[i],
      };
    });
  } else {
    const hue = coverHue(cover?.hue ?? 0);
    const colored = cover !== null && !cover.neutral;
    const tonic = colored ? hslToHex(hue, 0.5, 0.58 * brightness + 0.1) : ink;
    rings = [{ cx: 0.5, cy: 0.5, radius: sound === null ? 0.26 : 0.24, weight: sound === null ? 1 : 0.6, color: tonic }];
    if (sound !== null) {
      for (let i = 0; i < 2; i++) {
        const angle = hash(i, seed, 8) * 2 * Math.PI;
        rings.push({
          cx: 0.5 + 0.16 * Math.cos(angle),
          cy: 0.5 + 0.16 * Math.sin(angle),
          radius: 0.1,
          weight: 0.2,
          color: i === 0 && colored ? hslToHex(hue, 0.5, 0.72) : ink,
        });
      }
    }
  }

  const key = sound === null ? null : keyLabel(sound.key, sound.mode);
  return {
    v: RECIPE_V,
    seed,
    source: sound === null ? 'cover' : 'sound',
    rings,
    ground,
    ink,
    particles: sound === null ? 120 : Math.round(80 + energy * 160),
    speed: (2 * Math.PI / (beat * 8)) * (0.7 + 0.6 * energy),
    beat,
    turbulence: sound === null ? 0.35 : 0.15 + energy * 0.6,
    texture: sound === null || sound.acousticness > 0.5 ? 'grain' : 'line',
    stroke: sound !== null && sound.speechiness > 0.33 ? 'dash' : 'trail',
    regularity: sound?.danceability ?? 0.5,
    brightness,
    label: sound === null ? null : `${Math.round(sound.tempo)} BPM${key === null ? '' : ` · ${key.toUpperCase()}`}`,
  };
}

export function ringOf(r: PrintRecipe, i: number): number {
  'worklet';
  const u = hash(i, r.seed, 1);
  let cumulative = 0;
  for (let index = 0; index < r.rings.length; index++) {
    cumulative += r.rings[index].weight;
    if (u < cumulative) return index;
  }
  return r.rings.length - 1;
}

export function particleAt(r: PrintRecipe, i: number, t: number, gather: number): [number, number] {
  'worklet';
  // Keep ring selection local so this worklet only captures the hash helper.
  const u = hash(i, r.seed, 1);
  let cumulative = 0;
  let ringIndex = r.rings.length - 1;
  for (let index = 0; index < r.rings.length; index++) {
    cumulative += r.rings[index].weight;
    if (u < cumulative) {
      ringIndex = index;
      break;
    }
  }
  const ring = r.rings[ringIndex];
  const h1 = hash(i, r.seed, 2);
  const h2 = hash(i, r.seed, 3);
  const h3 = hash(i, r.seed, 4);
  const h4 = hash(i, r.seed, 5);
  const h5 = hash(i, r.seed, 6);
  const h6 = hash(i, r.seed, 7);
  const a = 2 * Math.PI * h1 + r.speed * (0.6 + 0.8 * h2) * t;
  const amp = 0.08 * (1 - (1 - r.regularity) * 0.5 * (1 + Math.sin(t * 0.37 + h3 * 2 * Math.PI)));
  const breath = 1 + amp * Math.sin(2 * Math.PI * t / r.beat);
  const wander = r.turbulence * 0.12 * Math.sin(t * 0.9 + h4 * 2 * Math.PI) * Math.sin(3 * a + t * 0.5);
  const rr = ring.radius * breath * (0.85 + 0.3 * h5) + wander * (1 - gather);
  const x0 = ring.cx + rr * Math.cos(a);
  const y0 = ring.cy + rr * Math.sin(a);
  const k = (1 - gather) * r.turbulence * 0.08;
  const x = x0 + k * Math.sin(y0 * 7 + t * 0.6 + h6 * 2 * Math.PI);
  const y = y0 + k * Math.cos(x0 * 7 - t * 0.5);
  return [x, y];
}

/**
 * The still print. `heard` (0–1, how much of the song you listened to) sets
 * how settled it is: fully heard is crisp rings, a quick reveal stays loose.
 */
export function settledPrint(r: PrintRecipe, detail: 'full' | 'mini' = 'full', heard = 1): PrintStill {
  const gather = 0.3 + 0.7 * Math.max(0, Math.min(1, heard));
  const n = detail === 'full' ? r.particles : Math.min(40, r.particles);
  const steps = detail === 'full' ? 12 : 6;
  const length = r.beat * (r.stroke === 'trail' ? 2 : 0.5);
  const rings = r.rings.map((ring) => ({ color: ring.color, lines: [] as number[][] }));
  for (let i = 0; i < n; i++) {
    const line: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const [x, y] = particleAt(r, i, (k / steps) * length, gather);
      line.push(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
    }
    rings[ringOf(r, i)].lines.push(line);
  }
  return { rings, ink: r.ink, ground: r.ground };
}
