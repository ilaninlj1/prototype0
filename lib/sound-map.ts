// The Dark Map's data: every measured song placed on one map by how it sounds (assets/sound-map.json, built by
// scripts/build-sound-map.ts), and the pure helpers that place other songs, look around a spot and pick songs
// near it. The map runs 0–1 across (x) and 0–1 down (y).

import type { SoundFeatures } from './sound.ts';

/** The measures the map is laid out from, in this order everywhere: the file, the vectors, the words. */
export const MAP_MEASURES = ['energy', 'danceability', 'acousticness', 'instrumentalness', 'speechiness', 'valence', 'loudness', 'tempo'] as const;
export type MapMeasure = (typeof MAP_MEASURES)[number];

export type MapPoint = { x: number; y: number };
export type MapRegion = { x: number; y: number; words: string; songs: number };
/** x, y, region index, genre index */
export type MapSong = [number, number, number, number];
export type SoundMap = {
  v: 1;
  builtAt: string;
  settings: { neighbors: number; minDist: number; seed: number; regions: number };
  measures: string[];
  mean: number[];
  sd: number[];
  genres: string[];
  regions: MapRegion[];
  songs: Record<string, MapSong>;
};
/** A map song with its standardized measures, for placing songs that aren't on the map. */
export type Neighbor = { x: number; y: number; region: number; vector: number[] };

let cached: SoundMap | null | undefined;

/** The bundled map, read on first use. Plain Node (tests, scripts) has no `require`, so it's null there. */
export function loadSoundMap(): SoundMap | null {
  if (cached === undefined) cached = typeof require === 'function' ? (require('../assets/sound-map.json') as SoundMap) : null;
  return cached;
}

/** A song's eight measures as numbers, NaN where one is missing. */
export function measureVector(f: Partial<Record<MapMeasure, number | null>>): number[] {
  return MAP_MEASURES.map((m) => {
    const v = f[m];
    return typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN;
  });
}

/** z-scores against the map's means and spreads; a missing measure sits at the mean. */
export function standardize(map: Pick<SoundMap, 'mean' | 'sd'>, raw: number[]): number[] {
  return raw.map((v, j) => (Number.isFinite(v) ? (v - map.mean[j]) / (map.sd[j] || 1) : 0));
}

const d2 = (a: number[], b: number[]) => a.reduce((sum, v, j) => sum + (v - b[j]) ** 2, 0);
const gap = (song: MapSong, p: MapPoint) => Math.hypot(song[0] - p.x, song[1] - p.y);

/** Every map song with its standardized measures; songs `featuresOf` can't measure are left out. */
export function mapNeighbors(map: SoundMap, featuresOf: (id: number) => SoundFeatures | null): Neighbor[] {
  const out: Neighbor[] = [];
  for (const [id, [x, y, region]] of Object.entries(map.songs)) {
    const f = featuresOf(Number(id));
    if (f) out.push({ x, y, region, vector: standardize(map, measureVector(f)) });
  }
  return out;
}

/** A song that isn't on the map: the average spot of its k nearest map songs by sound, in the region most of them share. */
export function placeByNeighbors(vector: number[], neighbors: Neighbor[], k = 5): { x: number; y: number; region: number } | null {
  if (neighbors.length === 0) return null;
  const nearest = neighbors
    .map((n) => ({ n, d: d2(vector, n.vector) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((e) => e.n);
  const votes = new Map<number, number>();
  for (const n of nearest) votes.set(n.region, (votes.get(n.region) ?? 0) + 1);
  // Most votes wins; a tie goes to the region of the nearest song.
  let region = nearest[0].region;
  for (const [r, v] of votes) if (v > (votes.get(region) ?? 0)) region = r;
  return {
    x: nearest.reduce((s, n) => s + n.x, 0) / nearest.length,
    y: nearest.reduce((s, n) => s + n.y, 0) / nearest.length,
    region,
  };
}

/** Ids of the map songs within `radius` of a point. */
export function songsWithin(map: Pick<SoundMap, 'songs'>, point: MapPoint, radius: number): number[] {
  return Object.entries(map.songs)
    .filter(([, s]) => gap(s, point) <= radius)
    .map(([id]) => Number(id));
}

/** The region most songs around a point belong to; on open sea, the region with the nearest center. */
export function regionAt(map: Pick<SoundMap, 'songs' | 'regions'>, point: MapPoint, radius: number): number {
  const votes = new Map<number, number>();
  for (const s of Object.values(map.songs)) if (gap(s, point) <= radius) votes.set(s[2], (votes.get(s[2]) ?? 0) + 1);
  if (votes.size > 0) return [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const dist = (r: MapRegion) => Math.hypot(r.x - point.x, r.y - point.y);
  let best = 0;
  map.regions.forEach((r, i) => {
    if (dist(r) < dist(map.regions[best])) best = i;
  });
  return best;
}

/** Fisher–Yates with an injectable random, so tests can keep the order. */
function shuffle<T>(list: T[], random: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Songs to play from a spot: the unheard map songs nearest it that `resolve` can turn into a track and `accept`
 * lets through, one per artist. The nearest 3 × n are shuffled and n kept, so a spot plays varied songs; since the
 * nearest are taken first, the search widens by itself as a spot runs dry. Empty when nothing is left.
 */
export function pickNear<T>(
  map: Pick<SoundMap, 'songs' | 'genres'>,
  point: MapPoint,
  n: number,
  heard: Set<number>,
  resolve: (id: number, genre: string) => { artist: string; track: T } | null,
  accept: (artist: string) => boolean,
  random: () => number = Math.random
): T[] {
  const ids = Object.keys(map.songs)
    .map(Number)
    .filter((id) => !heard.has(id));
  ids.sort((a, b) => gap(map.songs[a], point) - gap(map.songs[b], point));
  const found: T[] = [];
  const artists = new Set<string>();
  for (const id of ids) {
    if (found.length >= 3 * n) break;
    const r = resolve(id, map.genres[map.songs[id][3]]);
    if (!r || artists.has(r.artist) || !accept(r.artist)) continue;
    artists.add(r.artist);
    found.push(r.track);
  }
  return shuffle(found, random).slice(0, n);
}
