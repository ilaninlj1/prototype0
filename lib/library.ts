// The Library tab's list rules: what shows for a search and a genre chip, and
// the line under each cover about how the artist grew since you found them.

import { describeGrowth, describeListeners, likedGenres, type DiscoveryTrack } from './discovery.ts';

/** Lower case, accents off, so "beyonce" finds Beyoncé. */
function fold(text: string): string {
  const lower = text.toLowerCase();
  return (typeof lower.normalize === 'function' ? lower.normalize('NFD') : lower).replace(/[̀-ͯ]/g, '');
}

/** Saved songs whose title, artist or album holds every word of the search. An empty search keeps them all. */
export function searchLibrary(tracks: DiscoveryTrack[], query: string): DiscoveryTrack[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return tracks;
  return tracks.filter((t) => {
    const hay = fold([t.trackName, t.artistName, t.collectionName ?? ''].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/**
 * The grid: newest save first (storage keeps them oldest first), only the
 * chosen genre when it's still one of yours, then the search.
 */
export function libraryView(
  tracks: DiscoveryTrack[],
  { query, genre }: { query: string; genre: string | null }
): DiscoveryTrack[] {
  const newestFirst = [...tracks].reverse();
  const chip = genre && likedGenres(tracks).includes(genre) ? genre : null;
  const inGenre = chip ? newestFirst.filter((t) => t.primaryGenreName === chip) : newestFirst;
  return searchLibrary(inGenre, query);
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Under a cover: "Found at 97.3K → now 98.6K" with the change, or "Found at
 * 98.6K · today" for a save from today, or just what's known.
 */
export function foundLine(
  found: number | undefined,
  now: number | undefined,
  likedAt: number | undefined,
  today: number
): { text: string; change: string | null; up: boolean } | null {
  const fmt = (n: number) => describeListeners(n).count;
  if (found != null && now != null && fmt(found) !== fmt(now)) {
    const { pct } = describeGrowth(found, now);
    return {
      text: `Found at ${fmt(found)} → now ${fmt(now)}`,
      change: pct === 0 ? null : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`,
      up: pct > 0,
    };
  }
  if (found != null) {
    const when = likedAt != null && sameDay(likedAt, today) ? ' · today' : '';
    return { text: `Found at ${fmt(found)}${when}`, change: null, up: false };
  }
  if (now != null) return { text: `${fmt(now)} listeners`, change: null, up: false };
  return null;
}
