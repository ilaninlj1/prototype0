import { appleMusicUrl } from './credits.ts';
import type { DiscoveryTrack } from './discovery.ts';
import type { PoolSong } from './game-pool.ts';

export type TestItem = { song: PoolSong; isNever: boolean };

const HALF = 5;

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Take up to `n` songs round-robin across `groups`, so no single genre dominates. */
function roundRobin(groups: PoolSong[][], n: number): PoolSong[] {
  const out: PoolSong[] = [];
  for (let i = 0; out.length < n && groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length && out.length < n) out.push(g[i]);
  }
  return out;
}

/** 10 blind songs: 5 from your "never" genres, 5 from the rest. [] if either half can't be filled. */
export function pickTestSongs(pool: PoolSong[], never: string[], rng: () => number = Math.random): TestItem[] {
  const byGenre = new Map<string, PoolSong[]>();
  for (const s of shuffle(pool, rng)) byGenre.set(s.genre, [...(byGenre.get(s.genre) ?? []), s]);
  const neverSongs = roundRobin(never.map((g) => byGenre.get(g) ?? []), HALF);
  const others = shuffle([...byGenre.keys()].filter((g) => !never.includes(g)), rng).map((g) => byGenre.get(g)!);
  const otherSongs = roundRobin(others, HALF);
  if (neverSongs.length < HALF || otherSongs.length < HALF) return [];
  return shuffle(
    [...neverSongs.map((song) => ({ song, isNever: true })), ...otherSongs.map((song) => ({ song, isNever: false }))],
    rng
  );
}

export function scoreTest(items: TestItem[], liked: boolean[]): { neverLiked: number; otherLiked: number } {
  let neverLiked = 0;
  let otherLiked = 0;
  items.forEach((x, i) => {
    if (!liked[i]) return;
    if (x.isNever) neverLiked++;
    else otherLiked++;
  });
  return { neverLiked, otherLiked };
}

function listGenres(never: string[]): string {
  return never.length <= 1 ? (never[0] ?? '') : `${never.slice(0, -1).join(', ')} & ${never.at(-1)}`;
}

export function testHeadline(never: string[], neverLiked: number): string {
  return `You said never ${listGenres(never)}. You liked ${neverLiked} of ${HALF} blind.`;
}

export function testComparison(otherLiked: number): string {
  return `…and ${otherLiked} of ${HALF} of everything else.`;
}

export function testVerdict(neverLiked: number, otherLiked: number): string {
  return neverLiked >= otherLiked ? 'Your blind spot is real.' : 'Fair, your ears agree with you.';
}

export function testShareText(never: string[], neverLiked: number): string {
  return `My Blindspot: said never ${listGenres(never)}, liked ${neverLiked}/${HALF} blind 👀`;
}

/** A pool song as a swipe card, with its real iTunes id and Apple Music link. */
export function songToTrack(s: PoolSong): DiscoveryTrack {
  return {
    id: s.itunesTrackId,
    trackName: s.title,
    artistId: 0,
    artistName: s.artist,
    artworkUrl100: s.artworkUrl,
    primaryGenreName: s.genre,
    previewUrl: s.previewUrl,
    trackViewUrl: appleMusicUrl(s.itunesTrackId),
    collectionName: null,
    artistListeners: s.listeners,
  };
}
