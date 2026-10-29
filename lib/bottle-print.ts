// A bottle's print: the song's own print at the core, and one ring per person who kept it,
// drawn from the song *they* had saved just before (key and mode for hue on the same dial as
// every print, energy for weight, tempo for how fast it breathes). How far the song was from
// that keeper's home sets how loose the ring is. Pure; components/bottles/bottle-print.tsx draws it.

import type { Hop, RingSeed, Tier } from './bottle-rows.ts';
import { hslToHex, keyHue, visualTempo } from './print-recipe.ts';
import type { SoundFeatures } from './sound.ts';

export type BottleRing = { radius: number; weight: number; color: string; beat: number; wobble: number };

const INNER = 0.36;
const OUTER = 0.49;
const MAX_RINGS = 12;
const CREAM = '#f3ead8';
const WOBBLE: Record<Tier | 'none', number> = { close: 0.008, new: 0.018, deep: 0.03, none: 0.012 };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The three numbers a keeper's previous save adds to a bottle. */
export function ringSeedOf(f: SoundFeatures | null): RingSeed | null {
  if (!f) return null;
  return { key: f.key, mode: f.mode, energy: clamp(f.energy, 0, 1), tempo: clamp(f.tempo, 30, 250) };
}

export function bottleRings(hops: Hop[]): BottleRing[] {
  const keeps = hops.filter((h) => h.kind === 'keep').slice(-MAX_RINGS);
  const step = keeps.length > 1 ? (OUTER - INNER) / (keeps.length - 1) : 0;
  return keeps.map((h, i) => {
    const s = h.ring;
    return {
      radius: INNER + step * i,
      weight: s ? 0.15 + 0.5 * s.energy : 0.12,
      color: s && s.key !== null ? hslToHex(keyHue(s.key, s.mode), 0.62, 0.62) : CREAM,
      beat: s ? 60 / visualTempo(s.tempo) : 1,
      wobble: WOBBLE[h.tier ?? 'none'],
    };
  });
}
