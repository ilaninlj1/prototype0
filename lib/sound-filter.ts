// Sort by sound: five 3-way switches in Tune (Pace, Energy, Texture, Mood,
// Groove), each Low / Any / High, over ReccoBeats catalog values. The middle
// of each range is left out on purpose, so "fast" really is fast. Thresholds
// put roughly a third of the indexed catalog on each side (checked
// 2026-10-09 against assets/sound-index.json). Pure.

import { normName } from './sound-match.ts';
import type { SoundFeatures } from './sound.ts';

export type Level = 'low' | 'any' | 'high';
export type Dimension = 'pace' | 'energy' | 'texture' | 'mood' | 'groove';
export type SoundFilter = Record<Dimension, Level>;

export const ANY_FILTER: SoundFilter = { pace: 'any', energy: 'any', texture: 'any', mood: 'any', groove: 'any' };

/** Tune's rows, top to bottom: what each side is called. */
export const DIMENSIONS: { key: Dimension; label: string; low: string; high: string }[] = [
  { key: 'pace', label: 'Pace', low: 'Slow', high: 'Fast' },
  { key: 'energy', label: 'Energy', low: 'Calm', high: 'Loud' },
  { key: 'texture', label: 'Texture', low: 'Acoustic', high: 'Electronic' },
  { key: 'mood', label: 'Mood', low: 'Major', high: 'Minor' },
  { key: 'groove', label: 'Groove', low: 'Steady', high: 'Danceable' },
];

/** When too few songs match, switches are let go in this order: the finest distinctions first. */
const RELAX_ORDER: Dimension[] = ['groove', 'texture', 'mood', 'energy', 'pace'];

export function isActive(f: SoundFilter): boolean {
  return DIMENSIONS.some((d) => f[d.key] !== 'any');
}

function side(s: SoundFeatures, d: Dimension): Level | null {
  switch (d) {
    case 'pace':
      return s.tempo < 105 ? 'low' : s.tempo >= 130 ? 'high' : null;
    case 'energy':
      return s.energy < 0.55 ? 'low' : s.energy >= 0.78 ? 'high' : null;
    case 'texture':
      return s.acousticness >= 0.35 ? 'low' : s.acousticness < 0.04 ? 'high' : null;
    case 'mood':
      return s.mode === 1 ? 'low' : s.mode === 0 ? 'high' : null;
    case 'groove':
      return s.danceability < 0.5 ? 'low' : s.danceability >= 0.7 ? 'high' : null;
  }
}

/** Every active switch agrees with the song. Songs without sound data only pass when nothing is on. */
export function matches(s: SoundFeatures | null, f: SoundFilter): boolean {
  if (!isActive(f)) return true;
  if (!s) return false;
  return DIMENSIONS.every((d) => f[d.key] === 'any' || side(s, d.key) === f[d.key]);
}

/** "fast · loud": the active switches, as the words on their buttons. */
export function describeFilter(f: SoundFilter): string {
  return DIMENSIONS.filter((d) => f[d.key] !== 'any')
    .map((d) => (f[d.key] === 'low' ? d.low : d.high).toLowerCase())
    .join(' · ');
}

/** Let go of one switch, finest first. Null when nothing is on. */
export function relax(f: SoundFilter): { filter: SoundFilter; dropped: Dimension } | null {
  const dropped = RELAX_ORDER.find((d) => f[d] !== 'any');
  return dropped ? { filter: { ...f, [dropped]: 'any' }, dropped } : null;
}

/** Up to n matching items in a shuffled order, one per artist. */
export function pickSorted<T>(candidates: { item: T; artist: string; sound: SoundFeatures | null }[], f: SoundFilter, n: number, rng: () => number): T[] {
  const ok = candidates.filter((c) => matches(c.sound, f));
  for (let i = ok.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ok[i], ok[j]] = [ok[j], ok[i]];
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of ok) {
    if (out.length >= n) break;
    const a = normName(c.artist);
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(c.item);
  }
  return out;
}
