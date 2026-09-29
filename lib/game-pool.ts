import type { GenreCatalogFile } from './pool-types.ts';

export type PoolSong = { artist: string; title: string; previewUrl: string; artworkUrl: string; listeners: number; genre: string };

const STAR = 1_000_000;
const NEAR_MISS = 250_000;
const BANDS = [
  { from: 0, min: 10, max: Infinity },
  { from: 3, min: 4, max: 10 },
  { from: 6, min: 2, max: 4 },
  { from: 10, min: 1.2, max: 2 },
];

/** One song per catalog artist with a known listener count (mixed first, then hits, then deep cuts). */
export function buildPool(catalogs: Record<string, GenreCatalogFile>, listenersByArtist: Map<string, number>): PoolSong[] {
  const out: PoolSong[] = [];
  const seen = new Set<string>();
  for (const [genre, file] of Object.entries(catalogs)) {
    for (const [artist, cat] of Object.entries(file)) {
      const listeners = listenersByArtist.get(artist);
      const entry = cat.mixed[0] ?? cat.hits[0] ?? cat.deepCuts[0];
      if (listeners == null || !entry || seen.has(artist)) continue;
      seen.add(artist);
      out.push({ artist, title: entry.title, previewUrl: entry.previewUrl, artworkUrl: entry.artworkUrl ?? '', listeners, genre });
    }
  }
  return out;
}

export function ratioBand(streak: number): { min: number; max: number } {
  const b = [...BANDS].reverse().find((x) => streak >= x.from)!;
  return { min: b.min, max: b.max };
}

function pickOne<T>(xs: T[], rng: () => number): T | undefined {
  return xs[Math.floor(rng() * xs.length)];
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Four songs: exactly one star (1M+), three decoys. From streak 5, one decoy is a near miss (250K–1M) when possible. */
export function spotRound(pool: PoolSong[], streak: number, used: Set<string>, rng: () => number = Math.random): PoolSong[] {
  const open = pool.filter((s) => !used.has(s.artist));
  const star = pickOne(open.filter((s) => s.listeners >= STAR), rng);
  if (!star) return [];
  const low = shuffle(open.filter((s) => s.listeners < NEAR_MISS), rng);
  const near = shuffle(open.filter((s) => s.listeners >= NEAR_MISS && s.listeners < STAR), rng);
  const decoys = streak >= 5 && near.length > 0 ? [near[0], ...low.slice(0, 2)] : low.slice(0, 3);
  if (decoys.length < 3) decoys.push(...near.filter((s) => !decoys.includes(s)).slice(0, 3 - decoys.length));
  return shuffle([star, ...decoys], rng);
}

function ratio(a: number, b: number): number {
  return Math.max(a, b) / Math.max(1, Math.min(a, b));
}

/** A new opponent for `champion` whose listener ratio fits the streak's band, else the nearest band's. */
export function challenger(
  pool: PoolSong[],
  champion: PoolSong,
  streak: number,
  used: Set<string>,
  rng: () => number = Math.random
): PoolSong | null {
  const open = pool.filter((s) => !used.has(s.artist) && s.artist !== champion.artist && s.listeners !== champion.listeners);
  if (open.length === 0) return null;
  const { min, max } = ratioBand(streak);
  const inBand = open.filter((s) => {
    const r = ratio(s.listeners, champion.listeners);
    return r >= min && r < max;
  });
  if (inBand.length > 0) return pickOne(inBand, rng)!;
  // Nearest band: the ratio closest to the band's edges.
  const target = (r: number) => (r < min ? min - r : r - max);
  return [...open].sort((a, b) => target(ratio(a.listeners, champion.listeners)) - target(ratio(b.listeners, champion.listeners)))[0];
}
