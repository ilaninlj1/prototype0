// Taste Twins: who shares your ears, how much, and how to reach them once you
// both say so. Pure — the network side is lib/twins-api.ts.

export type Counts = { bothLiked: number; bothSkipped: number; disagreed: number; sameSongs: number; sameArtists: number };

/** One row of the database's my_twins(). */
export type TwinRow = {
  twin: string;
  name: string;
  both_liked: number;
  both_skipped: number;
  disagreed: number;
  same_songs: number;
  same_artists: number;
  i_waved: boolean;
  they_waved: boolean;
  can_wave: boolean;
};

export type Twin = { id: string; name: string; percent: number; counts: Counts; iWaved: boolean; theyWaved: boolean; canWave: boolean; summary: string };

const evidence = (c: Counts) => 2 * c.bothLiked + c.bothSkipped + 3 * c.sameSongs + c.sameArtists;

/** 0–100. The +4 keeps two lucky overlaps from reading as a perfect match. */
export function matchPercent(c: Counts): number {
  const e = evidence(c);
  return e === 0 ? 0 : Math.round((100 * e) / (e + 1.5 * c.disagreed + 4));
}

export function isTwin(c: Counts): boolean {
  const points = c.bothLiked + c.bothSkipped + c.disagreed + c.sameSongs + c.sameArtists;
  return points >= 3 && matchPercent(c) >= 40;
}

export function twinSummary(c: Counts): string {
  const liked = c.bothLiked + c.sameSongs;
  if (liked > 0) return `you both liked ${liked} ${liked === 1 ? 'song' : 'songs'} blind`;
  if (c.sameArtists > 0) return 'you save the same artists';
  return 'you skip the same songs';
}

export function rankTwins(rows: TwinRow[], limit = 5): Twin[] {
  return rows
    .map((r) => {
      const counts: Counts = { bothLiked: r.both_liked, bothSkipped: r.both_skipped, disagreed: r.disagreed, sameSongs: r.same_songs, sameArtists: r.same_artists };
      return { id: r.twin, name: r.name, percent: matchPercent(counts), counts, iWaved: r.i_waved, theyWaved: r.they_waved, canWave: r.can_wave, summary: twinSummary(counts) };
    })
    .filter((t) => isTwin(t.counts))
    .sort((a, b) => b.percent - a.percent || evidence(b.counts) - evidence(a.counts))
    .slice(0, limit);
}

export type Platform = 'instagram' | 'snapchat' | 'tiktok';

const PROFILE_PREFIX: Record<Platform, RegExp> = {
  instagram: /^(https?:\/\/)?(www\.)?instagram\.com\//i,
  snapchat: /^(https?:\/\/)?(www\.)?snapchat\.com\/add\//i,
  tiktok: /^(https?:\/\/)?(www\.)?tiktok\.com\/@?/i,
};

/** The bare username, from "@maya", "maya" or a profile link; null if it can't be a username. */
export function cleanHandle(raw: string, platform: Platform): string | null {
  const h = raw.trim().replace(PROFILE_PREFIX[platform], '').replace(/^@/, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9._-]{1,30}$/.test(h) ? h : null;
}

export function handleUrl(platform: Platform, handle: string): string {
  if (platform === 'snapchat') return `https://snapchat.com/add/${handle}`;
  if (platform === 'tiktok') return `https://tiktok.com/@${handle}`;
  return `https://instagram.com/${handle}`;
}

/** Refresh the anonymous session when it has under 5 minutes left. */
export function sessionNeedsRefresh(expiresAtSec: number, nowMs: number): boolean {
  return expiresAtSec * 1000 - nowMs < 5 * 60_000;
}
