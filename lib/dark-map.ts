// Lighting the Dark Map: which songs you've heard and how brightly, how much of the map that lights, which lights
// are new since your last look, and each region's tally. Pure; lib/dark-map-app.ts feeds it from storage.

import type { SwipeEntry } from './discovery.ts';
import type { SoundFeatures } from './sound.ts';
import { measureVector, placeByNeighbors, standardize, type MapPoint, type Neighbor, type SoundMap } from './sound-map.ts';

/** 24 seconds, 80% of a preview: "fully heard", as for the piece's prints. */
export const FULL_LISTEN_MS = 24_000;
export const MIN_BRIGHTNESS = 0.25;
/** An entry from before listen times were recorded. */
export const UNKNOWN_BRIGHTNESS = 0.5;
/** The grid the lit share is counted on: 24 across, 36 down. */
export const GRID = { cols: 24, rows: 36 } as const;
/** The tap ring's radius, in map widths. */
export const LENS = 0.08;
/** Above this share of a ring heard, the sheet says "You know this part." */
export const KNOWN_SHARE = 0.8;

const HEARD = new Set<SwipeEntry['action']>(['skip', 'like', 'reveal', 'genre-jump']);

export type Light = { id: number; x: number; y: number; b: number; saved: boolean; fresh: boolean };
export type RegionStat = { region: number; words: string; songs: number; heard: number };
export type MapView = {
  /** Every map song. */
  dots: MapPoint[];
  /** Heard songs that have a place on the map. */
  lights: Light[];
  /** 0–1, on the GRID. */
  litShare: number;
  /** Heard songs with no place (no sound data), left out of the share. */
  unmapped: number;
  /** Least heard first, for the list. */
  regions: RegionStat[];
  /** Saved after the bloom, so the next look knows what's new. */
  litIds: number[];
};

/** Every song with a heard entry (skip, like, reveal, genre jump): the same rule as countSongsHeard. */
export function heardIds(history: SwipeEntry[]): Set<number> {
  return new Set(history.filter((e) => HEARD.has(e.action)).map((e) => e.trackId));
}

/** How brightly each heard song shines, 0.25–1: its longest listen, full at 24 seconds. Saved songs shine fully. */
export function brightness(history: SwipeEntry[], saved: Iterable<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of history) {
    if (!HEARD.has(e.action)) continue;
    const raw = e.listenMs == null ? UNKNOWN_BRIGHTNESS : e.listenMs / FULL_LISTEN_MS;
    const b = Number.isFinite(raw) ? Math.min(1, Math.max(MIN_BRIGHTNESS, raw)) : MIN_BRIGHTNESS;
    out.set(e.trackId, Math.max(out.get(e.trackId) ?? 0, b));
  }
  for (const id of saved) out.set(id, 1);
  return out;
}

/** A heard song's glow, in map widths. */
export const glowRadius = (b: number) => 0.035 * (0.6 + 0.4 * b);

const cellOf = (p: MapPoint) => `${Math.min(GRID.cols - 1, Math.floor(p.x * GRID.cols))},${Math.min(GRID.rows - 1, Math.floor(p.y * GRID.rows))}`;

/** The share of the grid cells holding a map song that also hold a heard one. */
export function litShare(all: MapPoint[], heard: MapPoint[]): number {
  const cells = new Set(all.map(cellOf));
  if (cells.size === 0) return 0;
  const lit = new Set(heard.map(cellOf).filter((c) => cells.has(c)));
  return lit.size / cells.size;
}

/** Lit songs that weren't lit at the last look: all of them on the first. */
export function newLights(lit: number[], seen: number[]): Set<number> {
  const before = new Set(seen);
  return new Set(lit.filter((id) => !before.has(id)));
}

/**
 * Everything the map shows. Heard songs on the map light their own spot; heard songs off it are placed by their
 * nearest neighbors when the sound cache measured them (`featuresOf`), and counted as unmapped otherwise.
 * `neighbors` is only called when a song needs placing.
 */
export function lightMap(
  map: SoundMap,
  history: SwipeEntry[],
  saved: number[],
  seen: number[],
  featuresOf: (id: number) => SoundFeatures | null,
  neighbors: () => Neighbor[]
): MapView {
  const savedSet = new Set(saved);
  const dots = Object.values(map.songs).map(([x, y]) => ({ x, y }));
  const regionHeard = map.regions.map(() => 0);
  const lights: Light[] = [];
  let unmapped = 0;
  for (const [id, b] of brightness(history, saved)) {
    const onMap = map.songs[String(id)];
    if (onMap) {
      regionHeard[onMap[2]]++;
      lights.push({ id, x: onMap[0], y: onMap[1], b, saved: savedSet.has(id), fresh: false });
      continue;
    }
    const f = featuresOf(id);
    const placed = f ? placeByNeighbors(standardize(map, measureVector(f)), neighbors()) : null;
    if (placed) lights.push({ id, x: placed.x, y: placed.y, b, saved: savedSet.has(id), fresh: false });
    else unmapped++;
  }
  const fresh = newLights(
    lights.map((l) => l.id),
    seen
  );
  for (const l of lights) l.fresh = fresh.has(l.id);
  const regions = map.regions
    .map((r, i) => ({ region: i, words: r.words, songs: r.songs, heard: regionHeard[i] }))
    .sort((a, b) => a.heard / a.songs - b.heard / b.songs || a.region - b.region);
  return { dots, lights, litShare: litShare(dots, lights), unmapped, regions, litIds: lights.map((l) => l.id) };
}
