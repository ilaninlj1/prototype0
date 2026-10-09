// How far a song's sound is from the songs you've saved: the mean distance
// to your 3 nearest saves (lib/sound-neighbors.ts soundDistance), so one odd
// save can't make everything feel close. Sound only, not genre. Pure.

import { soundDistance } from './sound-neighbors.ts';
import type { SoundFeatures } from './sound.ts';

export type Tier = 'close' | 'new' | 'deep';

/** Below this many saves with sound data there's no taste to measure against. */
export const MIN_SAVES = 5;
const NEAREST = 3;

/**
 * Where "close to home" ends and "deep in your blind spot" begins. Calibrated
 * on assets/sound-index.json (2026-10-09): 60 simulated listeners who saved 15
 * songs from 3 random genres, 7,200 distances to random catalog songs. Their
 * thirds fall at 0.156 and 0.198 (10th percentile 0.123, 90th 0.254).
 */
export const TIER_CUTS: [number, number] = [0.155, 0.2];

export const TIER_LABEL: Record<Tier, string> = {
  close: 'CLOSE TO HOME',
  new: 'NEW GROUND',
  deep: 'DEEP IN YOUR BLIND SPOT',
};

export function tasteDistance(song: SoundFeatures, saves: SoundFeatures[]): number | null {
  if (saves.length < MIN_SAVES) return null;
  const nearest = saves
    .map((s) => soundDistance(song, s))
    .sort((a, b) => a - b)
    .slice(0, NEAREST);
  return nearest.reduce((a, d) => a + d, 0) / nearest.length;
}

export function tierFor(distance: number): Tier {
  return distance >= TIER_CUTS[1] ? 'deep' : distance >= TIER_CUTS[0] ? 'new' : 'close';
}

/** How restless the particles get: 0 near home (the calibration's 10th percentile), 1 by its 90th. */
export function restlessness(distance: number): number {
  return Math.max(0, Math.min(1, (distance - 0.12) / (0.26 - 0.12)));
}
