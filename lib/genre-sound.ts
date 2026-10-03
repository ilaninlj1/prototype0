// Genre baselines for Taste Decoded: what each genre normally sounds like,
// measured once from the bundled catalogs by scripts/measure-genre-sound.ts
// into assets/genre-sound.json. Pure.

import { MEASURES, type Measure } from './taste-decoded.ts';

/** A measure's 10th, 25th, 50th, 75th and 90th percentile. */
export type Cuts = [number, number, number, number, number];
export type GenreSound = { n: number; cuts: Record<Measure, Cuts> };
export type Baselines = { measuredAt: string; genres: Record<string, GenreSound>; all: GenreSound };
export type Measured = Record<Measure, number>;

const CUT_PERCENTILES = [10, 25, 50, 75, 90];
/** Below this many measured songs a genre is left out, and its songs are placed against `all`. */
export const MIN_GENRE_SONGS = 15;

/** Straight-line percentile (p 0–100) of an ascending, non-empty list. */
export function percentile(sorted: number[], p: number): number {
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function summarize(songs: Measured[]): GenreSound {
  const cuts = {} as Record<Measure, Cuts>;
  for (const m of MEASURES) {
    const sorted = songs.map((s) => s[m]).sort((a, b) => a - b);
    cuts[m] = CUT_PERCENTILES.map((p) => round4(percentile(sorted, p))) as Cuts;
  }
  return { n: songs.length, cuts };
}

/** The file the app reads: each genre with enough songs, plus every song pooled. */
export function buildBaselines(byGenre: Record<string, Measured[]>, measuredAt: string): Baselines {
  const genres: Record<string, GenreSound> = {};
  for (const [g, songs] of Object.entries(byGenre)) if (songs.length >= MIN_GENRE_SONGS) genres[g] = summarize(songs);
  return { measuredAt, genres, all: summarize(Object.values(byGenre).flat()) };
}

const CHECKS: [higher: string, measure: Measure, lower: string, says: string][] = [
  ['Metal', 'loudness', 'Ambient', 'Metal should be louder than Ambient'],
  ['Classical', 'instrumentalness', 'Hip-Hop', 'Classical should be more instrumental than Hip-Hop'],
  ['Hip-Hop', 'speechiness', 'Classical', 'Hip-Hop should be more spoken than Classical'],
  ['Metal', 'energy', 'Ambient', 'Ambient should be calmer than Metal'],
];

/** Obvious truths the numbers must show (on the 50th percentile) before anything relies on them. Empty means passed. */
export function sanityProblems(b: Baselines): string[] {
  const out: string[] = [];
  for (const [hi, m, lo, says] of CHECKS) {
    const a = b.genres[hi]?.cuts[m][2];
    const z = b.genres[lo]?.cuts[m][2];
    if (a == null || z == null) out.push(`${says} (no ${a == null ? hi : lo} baseline)`);
    else if (!(a > z)) out.push(`${says}: ${hi} ${a} vs ${lo} ${z}`);
  }
  return out;
}

export type BaselineEntry = { title: string; previewUrl: string; itunesTrackId: number };
type CatalogLike = Record<string, { hits: BaselineEntry[]; deepCuts: BaselineEntry[] }>;

/** Up to `perKind` hits and `perKind` deep cuts, one of each per artist at most, in a repeatable shuffled artist order. */
export function pickBaselineSongs(catalog: CatalogLike, rng: () => number, perKind = 15): BaselineEntry[] {
  const artists = shuffle(Object.keys(catalog), rng);
  const seen = new Set<string>();
  const take = (kind: 'hits' | 'deepCuts') => {
    const out: BaselineEntry[] = [];
    for (const a of artists) {
      if (out.length >= perKind) break;
      const e = catalog[a][kind].find((x) => x.previewUrl && !seen.has(x.previewUrl));
      if (!e) continue;
      seen.add(e.previewUrl);
      out.push(e);
    }
    return out;
  };
  return [...take('hits'), ...take('deepCuts')];
}

/** mulberry32: a tiny seeded generator, so the baseline sample is the same every run. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** assets/catalogs/<slug>.json for a genre name: "R&B" → "r-b", "Drum and Bass" → "drum-and-bass". */
export function catalogSlug(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
