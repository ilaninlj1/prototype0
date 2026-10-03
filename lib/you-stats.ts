/**
 * The You page's numbers: what people most want to know about their own listening
 * (the research behind it: Wrapped, stats.fm, Obscurify, Icebergify, Instafest, and
 * "Spotify Warped", CHI 2026), worked out from what Blindspot has.
 *
 * Two kinds of input. Blindspot's own data (swipes, saves, listener counts) is ours to
 * use. Spotify songs count only when they came from a file the person imported
 * (source 'file'): Spotify's Developer Policy forbids deriving stats from API data.
 * All pure, all on the phone.
 */
import { countSongsHeard, type DiscoveryTrack, type SwipeEntry } from './discovery.ts';
import { artistsIn } from './known-artists.ts';
import type { SpotifyLike } from './spotify.ts';

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2;
};

const dayKey = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "4.8K", "1.2M": listener counts as prices on the receipt and labels on the iceberg. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------- Blindspot ----------

/** One in how many songs you hear blind you save, and whether that's changed (needs 40 songs). */
export function hitRate(history: SwipeEntry[]): {
  heard: number;
  saved: number;
  oneIn: number | null;
  trend: 'pickier' | 'easier' | null;
} {
  const heard = countSongsHeard(history);
  const savedIds = new Set(history.filter((e) => e.action === 'like').map((e) => e.trackId));
  const saved = savedIds.size;
  const oneIn = saved ? Math.round(heard / saved) : null;
  let trend: 'pickier' | 'easier' | null = null;
  const decisions = history.filter((e) => e.action === 'skip' || e.action === 'like').sort((a, b) => a.timestamp - b.timestamp);
  if (decisions.length >= 40) {
    const half = Math.floor(decisions.length / 2);
    const rate = (es: SwipeEntry[]) => es.filter((e) => e.action === 'like').length / es.length;
    const before = rate(decisions.slice(0, half));
    const lately = rate(decisions.slice(half));
    if (lately < before * 0.75) trend = 'pickier';
    else if (lately > before * 1.33) trend = 'easier';
  }
  return { heard, saved, oneIn, trend };
}

export type Tier = { name: 'Famous' | 'Known' | 'Deep' | 'Buried'; artists: { artist: string; listeners: number }[] };

/** Artists you found blind, by listeners when you found them: 1M+, 100K+, 10K+, under 10K. Always all four layers. */
export function iceberg(finds: DiscoveryTrack[]): Tier[] {
  const byArtist = new Map<string, number>();
  for (const f of finds) {
    if (f.artistListeners == null || byArtist.has(f.artistName)) continue;
    byArtist.set(f.artistName, f.artistListeners);
  }
  const tiers: Tier[] = [
    { name: 'Famous', artists: [] },
    { name: 'Known', artists: [] },
    { name: 'Deep', artists: [] },
    { name: 'Buried', artists: [] },
  ];
  for (const [artist, listeners] of [...byArtist].sort((a, b) => b[1] - a[1])) {
    const i = listeners >= 1_000_000 ? 0 : listeners >= 100_000 ? 1 : listeners >= 10_000 ? 2 : 3;
    tiers[i].artists.push({ artist, listeners });
  }
  return tiers;
}

/** Median seconds you listen before deciding, and for songs you skip vs keep. Steering isn't a decision. */
export function decisionSpeed(history: SwipeEntry[]): { median: number; skip: number | null; keep: number | null } | null {
  const ms = (e: SwipeEntry) => e.listenMs ?? e.dwellMs;
  const decided = history.filter(
    (e) => (e.action === 'skip' || e.action === 'like' || e.action === 'reveal') && (ms(e) ?? 0) > 0
  );
  const all = median(decided.map((e) => ms(e)! / 1000));
  if (all == null) return null;
  const of = (action: SwipeEntry['action']) => median(decided.filter((e) => e.action === action).map((e) => ms(e)! / 1000));
  const round = (s: number | null) => (s == null ? null : Math.round(s));
  return { median: Math.round(all), skip: round(of('skip')), keep: round(of('like')) };
}

const partOfDay = (hour: number) =>
  hour >= 5 && hour < 12
    ? 'in the morning'
    : hour >= 12 && hour < 17
      ? 'in the afternoon'
      : hour >= 17 && hour < 22
        ? 'in the evening'
        : 'late at night';

/** Saves by hour of the day, and the busiest three hours named plainly. */
export function findClock(finds: DiscoveryTrack[]): { hours: number[]; peak: string | null } {
  const hours = Array<number>(24).fill(0);
  for (const f of finds) if (f.likedAt != null) hours[new Date(f.likedAt).getHours()]++;
  if (!hours.some(Boolean)) return { hours, peak: null };
  let best = 0;
  let bestCount = -1;
  for (let h = 0; h < 24; h++) {
    const c = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
    if (c > bestCount) {
      best = h;
      bestCount = c;
    }
  }
  return { hours, peak: partOfDay((best + 1) % 24) };
}

/** Days in a row with at least one save: the run going now (today or yesterday counts), the best run, and total days. */
export function streaks(finds: DiscoveryTrack[], now: number): { current: number; longest: number; days: number } {
  const days = [...new Set(finds.filter((f) => f.likedAt != null).map((f) => dayKey(f.likedAt!)))].sort((a, b) => a - b);
  const next = (d: number) => dayKey(d + 36 * 60 * 60 * 1000); // a day and a half later, then back to midnight: DST-safe
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && next(days[i - 1]) === days[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = dayKey(now);
  const last = days[days.length - 1];
  const current = last != null && (last === today || next(last) === today) ? run : 0;
  return { current, longest, days: days.length };
}

/** How many genres you've liked blind, out of how many you've heard, and your most-liked one. */
export function range(finds: DiscoveryTrack[], history: SwipeEntry[]): { liked: number; heard: number; top: string | null } {
  const counts = new Map<string, number>();
  for (const f of finds) counts.set(f.primaryGenreName, (counts.get(f.primaryGenreName) ?? 0) + 1);
  const heard = new Set(history.map((e) => e.genre).filter(Boolean));
  for (const g of counts.keys()) heard.add(g);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { liked: counts.size, heard: heard.size, top };
}

export type TypeInput = {
  finds: number;
  medianFound: number | null;
  genresLiked: number;
  peak: string | null;
  oneIn: number | null;
  decideSeconds: number | null;
  called: number;
};

/** One listener type, Wrapped-"club" style, picked by the strongest signal, with the reason in a sentence. */
export function listenerType(s: TypeInput): { name: string; why: string } {
  if (s.finds < 3) return { name: 'New Here', why: 'Save a few songs blind and your type shows up here.' };
  if (s.called >= 2) return { name: 'The Prophet', why: `${s.called} artists you found blind have at least doubled since.` };
  if (s.medianFound != null && s.medianFound < 50_000)
    return { name: 'The Digger', why: `Half your finds had under ${compact(s.medianFound)} listeners. You go deep.` };
  if (s.genresLiked >= 6) return { name: 'The Wanderer', why: `You've liked songs blind in ${s.genresLiked} genres.` };
  if (s.peak === 'late at night') return { name: 'The Night Owl', why: 'Most of your finds happen late at night.' };
  if (s.oneIn != null && s.oneIn >= 12) return { name: 'The Critic', why: `You save 1 in ${s.oneIn} songs. Hard to impress.` };
  if (s.oneIn != null && s.oneIn <= 3)
    return { name: 'The Open Ear', why: `You save 1 in ${s.oneIn} songs. You give everything a chance.` };
  if (s.decideSeconds != null && s.decideSeconds <= 4)
    return { name: 'The Quick Draw', why: `You know in ${s.decideSeconds} seconds.` };
  return { name: 'The Explorer', why: 'A bit of everything, found blind.' };
}

/** Your latest finds as a receipt, each "priced" at its artist's listeners when you found it. */
export function receipt(
  finds: DiscoveryTrack[],
  max: number
): { lines: { song: string; artist: string; price: string }[]; total: number } {
  const lines = [...finds]
    .filter((f) => f.likedAt != null)
    .sort((a, b) => b.likedAt! - a.likedAt!)
    .slice(0, max)
    .map((f) => ({
      song: f.trackName,
      artist: f.artistName,
      price: f.artistListeners == null ? '?' : compact(f.artistListeners),
    }));
  return { lines, total: finds.length };
}

// ---------- Spotify file ----------

const fromFile = (songs: SpotifyLike[]) => songs.filter((s) => s.source === 'file');

/** The year your library sounds like (median release year) and where the middle half sits. */
export function listeningAge(songs: SpotifyLike[]): { year: number; from: number; to: number } | null {
  const years = fromFile(songs)
    .map((s) => s.released)
    .filter((y): y is number => y != null && y > 1900)
    .sort((a, b) => a - b);
  if (!years.length) return null;
  const n = years.length - 1;
  return { year: Math.round(median(years)!), from: years[Math.floor(n * 0.25)], to: years[Math.ceil(n * 0.75)] };
}

/** Your library by decade of release, biggest first (newer first on a tie). */
export function decades(songs: SpotifyLike[]): { decade: string; count: number; share: number }[] {
  const counts = new Map<number, number>();
  for (const s of fromFile(songs))
    if (s.released != null && s.released > 1900)
      counts.set(Math.floor(s.released / 10) * 10, (counts.get(Math.floor(s.released / 10) * 10) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([d, count]) => ({ decade: `${d}s`, count, share: count / total }));
}

/** The year you saved the most, and the single day (3 songs or more). */
export function biggest(songs: SpotifyLike[]): {
  year: { year: number; count: number } | null;
  day: { at: number; count: number } | null;
} {
  const years = new Map<number, number>();
  const days = new Map<number, number>();
  for (const s of fromFile(songs)) {
    const y = new Date(s.addedAt).getFullYear();
    years.set(y, (years.get(y) ?? 0) + 1);
    days.set(dayKey(s.addedAt), (days.get(dayKey(s.addedAt)) ?? 0) + 1);
  }
  const topYear = [...years].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  const topDay = [...days].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return {
    year: topYear ? { year: topYear[0], count: topYear[1] } : null,
    day: topDay && topDay[1] >= 3 ? { at: topDay[0], count: topDay[1] } : null,
  };
}

/** Median Spotify popularity (0-100) of your library, in words. */
export function mainstream(songs: SpotifyLike[]): { score: number; label: string } | null {
  const m = median(fromFile(songs).flatMap((s) => (s.popularity == null ? [] : [s.popularity])));
  if (m == null) return null;
  const score = Math.round(m);
  const label =
    score >= 70 ? 'very mainstream' : score >= 50 ? 'mostly mainstream' : score >= 30 ? 'off the beaten path' : 'deep cuts';
  return { score, label };
}

/** Your most-saved artists, everyone credited counting, for the festival poster. */
export function topArtists(songs: SpotifyLike[], max: number): { artist: string; count: number }[] {
  const counts = new Map<string, { artist: string; count: number }>();
  for (const s of fromFile(songs)) {
    for (const artist of s.artist.split(', ').filter(Boolean)) {
      const key = artistsIn(artist)[0] ?? artist.toLowerCase();
      const c = counts.get(key) ?? { artist, count: 0 };
      c.count++;
      counts.set(key, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist)).slice(0, max);
}

/** Of your blind finds, how many are by artists nowhere in your Spotify. Null without a file to compare. */
export function newToYou(finds: DiscoveryTrack[], songs: SpotifyLike[]): { fresh: number; of: number; share: number } | null {
  const file = fromFile(songs);
  if (!file.length || !finds.length) return null;
  const known = new Set(file.flatMap((s) => artistsIn(s.artist)));
  const fresh = finds.filter((f) => !artistsIn(f.artistName).some((a) => known.has(a))).length;
  return { fresh, of: finds.length, share: fresh / finds.length };
}
