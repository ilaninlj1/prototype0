import { hitRankMax } from './pool-config.ts';
import type { SoundFeatures } from './sound.ts';

export const WATERS = ['reef', 'kelp', 'blue', 'midnight'] as const;
export const DEPTHS = ['popular', 'deepcuts', 'gems', 'buried'] as const;
export type Water = (typeof WATERS)[number];
export type Depth = (typeof DEPTHS)[number];
export type Place = { water: Water; depth: Depth };
export type Species = 'jelly' | 'turtle' | 'puffer' | 'darter' | 'clown';
export type Kind = Species | 'drifter';

export const WATER_INFO: Record<Water, { name: string; caption: string }> = {
  reef: { name: 'Sunny reef', caption: 'Upbeat, with a full sound' },
  kelp: { name: 'Kelp forest', caption: 'Acoustic' },
  blue: { name: 'Open blue', caption: 'Mostly instrumental' },
  midnight: { name: 'Midnight', caption: 'Dark and moody' },
};

export const DEPTH_INFO: Record<Depth, { name: string }> = {
  popular: { name: 'Popular' },
  deepcuts: { name: 'Deep cuts' },
  gems: { name: 'Hidden gems' },
  buried: { name: 'Buried' },
};

export const SPECIES_INFO: Record<Species, { name: string; means: string }> = {
  jelly: { name: 'Jellyfish', means: 'Quiet' },
  turtle: { name: 'Turtle', means: 'Slow' },
  puffer: { name: 'Puffer', means: 'Loud' },
  darter: { name: 'Darting fish', means: 'Fast' },
  clown: { name: 'Clownfish', means: 'In between' },
};

/** First match wins; classification order differs from the waters' screen order. */
export function waterOf(s: SoundFeatures): Water {
  if (s.instrumentalness > 0.5) return 'blue';
  if (s.acousticness > 0.6) return 'kelp';
  if (s.valence < 0.3 || (s.valence < 0.45 && s.energy < 0.45)) return 'midnight';
  return 'reef';
}

export function speciesOf(s: SoundFeatures): Species {
  if (s.energy < 0.4) return 'jelly';
  if (s.tempo < 95) return 'turtle';
  if (s.energy >= 0.88) return 'puffer';
  if (s.tempo >= 125) return 'darter';
  return 'clown';
}

/** Unmeasured songs have a stable home, independent of the listener and the clock. */
export function driftWater(trackId: number): Water {
  let hash = 2166136261;
  for (const char of String(trackId)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return WATERS[(hash >>> 0) % WATERS.length];
}

export function depthOfBands(artistBand: 'popular' | 'obscure', songBand: 'hit' | 'deepcut'): Depth {
  if (artistBand === 'popular') return songBand === 'hit' ? 'popular' : 'deepcuts';
  return songBand === 'hit' ? 'gems' : 'buried';
}

/** Only for songs outside the catalog. Unknown popularity stays at the surface. */
export function depthOfLiveTrack(t: { artistListeners?: number; trackRank?: number }): Depth {
  if (t.artistListeners == null || t.trackRank == null) return 'popular';
  return depthOfBands(t.artistListeners <= 100_000 ? 'obscure' : 'popular', t.trackRank <= hitRankMax ? 'hit' : 'deepcut');
}

export function placeKey(p: Place): string {
  return `${p.water}:${p.depth}`;
}

export function placeLabel(p: Place): string {
  return `${WATER_INFO[p.water].name} · ${DEPTH_INFO[p.depth].name}`;
}

export function allPlaces(): Place[] {
  return WATERS.flatMap((water) => DEPTHS.map((depth) => ({ water, depth })));
}
