// The pure parts of building the Dark Map (scripts/build-sound-map.ts): standardizing the measures, cutting the
// layout into regions and naming each region in plain words.

import { MAP_MEASURES, type MapMeasure } from '../lib/sound-map.ts';

type Pt = [number, number];

/** A seeded random in [0, 1), so a rebuild of the same index gives the same map. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Each column's missing values (NaN) filled with its mean, then turned into z-scores. */
export function standardizeColumns(raw: number[][]): { rows: number[][]; mean: number[]; sd: number[] } {
  const cols = raw[0]?.length ?? 0;
  const mean = Array.from({ length: cols }, (_, j) => {
    const known = raw.map((r) => r[j]).filter((v) => Number.isFinite(v));
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  });
  const filled = raw.map((r) => r.map((v, j) => (Number.isFinite(v) ? v : mean[j])));
  const sd = mean.map((m, j) => Math.sqrt(filled.reduce((a, r) => a + (r[j] - m) ** 2, 0) / Math.max(1, filled.length)) || 1);
  return { rows: filled.map((r) => r.map((v, j) => (v - mean[j]) / sd[j])), mean, sd };
}

/** Scales a layout so both axes run from 0 to 1. */
export function normalizeLayout(points: number[][]): Pt[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const lo = [Math.min(...xs), Math.min(...ys)];
  const hi = [Math.max(...xs), Math.max(...ys)];
  return points.map((p) => [(p[0] - lo[0]) / (hi[0] - lo[0] || 1), (p[1] - lo[1]) / (hi[1] - lo[1] || 1)]);
}

const d2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

function nearestCenter(p: Pt, centers: Pt[], skip = -1): number {
  let best = -1;
  centers.forEach((c, i) => {
    if (i !== skip && (best < 0 || d2(p, c) < d2(p, centers[best]))) best = i;
  });
  return best;
}

function centersOf(points: Pt[], assign: number[], k: number): Pt[] {
  return Array.from({ length: k }, (_, c) => {
    const members = points.filter((_, i) => assign[i] === c);
    return [members.reduce((s, p) => s + p[0], 0) / members.length, members.reduce((s, p) => s + p[1], 0) / members.length];
  });
}

/** k-means on the layout: k-means++ seeding from `random`, then Lloyd rounds. */
export function kmeans(points: Pt[], k: number, random: () => number, rounds = 40): { centers: Pt[]; assign: number[] } {
  const centers: Pt[] = [points[Math.floor(random() * points.length)]];
  while (centers.length < k) {
    const far = points.map((p) => Math.min(...centers.map((c) => d2(p, c))));
    let pick = random() * far.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < points.length - 1 && (pick -= far[i]) > 0) i++;
    centers.push(points[i]);
  }
  let assign: number[] = [];
  for (let round = 0; round < rounds; round++) {
    assign = points.map((p) => nearestCenter(p, centers));
    centers.forEach((c, ci) => {
      const members = points.filter((_, i) => assign[i] === ci);
      if (members.length) centers[ci] = [members.reduce((s, p) => s + p[0], 0) / members.length, members.reduce((s, p) => s + p[1], 0) / members.length];
    });
  }
  return { centers, assign };
}

/** Regions under `min` points join the region with the nearest center; then they're renumbered by size, largest first. */
export function mergeSmall(points: Pt[], assign: number[], min: number): { centers: Pt[]; assign: number[] } {
  let next = [...assign];
  for (;;) {
    const ids = [...new Set(next)];
    const counts = new Map(ids.map((r) => [r, next.filter((a) => a === r).length]));
    const small = ids.filter((r) => counts.get(r)! < min).sort((a, b) => counts.get(a)! - counts.get(b)! || a - b)[0];
    if (small === undefined || ids.length < 2) break;
    const centers = new Map(ids.map((r) => [r, centersOf(points, next.map((a) => (a === r ? 0 : -1)), 1)[0]]));
    const target = ids
      .filter((r) => r !== small)
      .sort((a, b) => d2(centers.get(small)!, centers.get(a)!) - d2(centers.get(small)!, centers.get(b)!) || a - b)[0];
    next = next.map((a) => (a === small ? target : a));
  }
  const bySize = [...new Set(next)].sort((a, b) => next.filter((x) => x === b).length - next.filter((x) => x === a).length || a - b);
  const renumbered = next.map((a) => bySize.indexOf(a));
  return { centers: centersOf(points, renumbered, bySize.length), assign: renumbered };
}

const WORDS: Record<MapMeasure, [low: string, high: string]> = {
  energy: ['calm', 'loud'],
  danceability: ['loose', 'groovy'],
  acousticness: ['electric', 'acoustic'],
  instrumentalness: ['sung', 'instrumental'],
  speechiness: ['melodic', 'wordy'],
  valence: ['dark', 'bright'],
  loudness: ['soft', 'loud'],
  tempo: ['slow', 'fast'],
};

/** The measures a region differs on most, strongest first. Loudness is left out: it repeats energy. */
function ranked(meanZ: number[]): string[] {
  return MAP_MEASURES.map((measure, j) => ({ measure, z: meanZ[j] }))
    .filter((m) => m.measure !== 'loudness')
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .map((m) => WORDS[m.measure][m.z > 0 ? 1 : 0]);
}

/** Two plain words per region ("instrumental · groovy"), three when two regions would share the same two. */
export function nameRegions(meanZs: number[][]): string[] {
  const two = meanZs.map((z) => ranked(z).slice(0, 2).join(' · '));
  return meanZs.map((z, i) => (two.filter((t) => t === two[i]).length > 1 ? ranked(z).slice(0, 3).join(' · ') : two[i]));
}
