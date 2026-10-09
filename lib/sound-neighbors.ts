// Nearby songs by measured pace, texture and harmony.
// Pure distances and artist-diverse neighbor selection.

import { normName } from './sound-match.ts';
import type { SoundFeatures } from './sound.ts';

export type Candidate<T> = { item: T; artist: string; sound: SoundFeatures | null };

export function tempoGap(a: number, b: number): number {
  return Math.min(...[0.5, 1, 2].map((k) => Math.abs(a - b * k) / Math.max(a, b * k)));
}

export function keyGap(a: SoundFeatures, b: SoundFeatures): number | null {
  if (a.key === null || a.mode === null || b.key === null || b.mode === null) return null;
  const pcA = a.mode === 0 ? (a.key + 3) % 12 : a.key;
  const pcB = b.mode === 0 ? (b.key + 3) % 12 : b.key;
  const d = Math.abs((pcA * 7) % 12 - (pcB * 7) % 12);
  return Math.min(d, 12 - d) / 6;
}

export function soundDistance(a: SoundFeatures, b: SoundFeatures): number {
  const harmony = keyGap(a, b);
  const distance = 0.3 * Math.min(tempoGap(a.tempo, b.tempo) / 0.5, 1)
    + 0.2 * Math.abs(a.energy - b.energy)
    + 0.15 * Math.abs(a.danceability - b.danceability)
    + 0.1 * Math.abs(a.acousticness - b.acousticness)
    + 0.1 * Math.abs(a.instrumentalness - b.instrumentalness);
  return harmony === null ? distance / 0.85 : distance + 0.15 * harmony;
}

export function pickNeighbors<T>(
  target: SoundFeatures,
  targetArtist: string,
  candidates: Candidate<T>[],
  n = 3,
): T[] {
  const artist = normName(targetArtist);
  const ranked: { item: T; artist: string; distance: number; index: number }[] = [];
  candidates.forEach((candidate, index) => {
    if (candidate.sound === null) return;
    const name = normName(candidate.artist);
    if (name === artist) return;
    ranked.push({
      item: candidate.item,
      artist: name,
      distance: soundDistance(target, candidate.sound),
      index,
    });
  });
  ranked.sort((a, b) => a.distance - b.distance || a.index - b.index);

  const seen = new Set<string>();
  const neighbors: T[] = [];
  for (const candidate of ranked) {
    if (neighbors.length >= n) break;
    if (seen.has(candidate.artist)) continue;
    seen.add(candidate.artist);
    neighbors.push(candidate.item);
  }
  return neighbors;
}
