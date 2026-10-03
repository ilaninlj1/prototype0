/**
 * Rewind: scrub back through your finds. How far you drag sets the step — a
 * short drag moves a day, further a month, furthest a year — and every step
 * lands on the nearest day, month or year you found something, so a swipe is
 * never wasted on an empty day. All dates are local time.
 */
import { countSongsHeard, type DiscoveryTrack, type SwipeEntry } from './discovery.ts';
import type { SpotifyLike } from './spotify.ts';

export type Unit = 'day' | 'month' | 'year';
export const UNITS: Unit[] = ['day', 'month', 'year'];

/** Where each step starts, as a share of half the strip's width (the distance from the middle to either end). */
export const BAND_STARTS: Record<Unit, number> = { day: 0.12, month: 0.45, year: 0.75 };

/** The step a drag of `distance` points (either direction) has reached, or null for a nudge. */
export function bandFor(distance: number, half: number): Unit | null {
  const share = Math.abs(distance) / half;
  if (share >= BAND_STARTS.year) return 'year';
  if (share >= BAND_STARTS.month) return 'month';
  if (share >= BAND_STARTS.day) return 'day';
  return null;
}

export function periodStart(t: number, unit: Unit): number {
  const d = new Date(t);
  if (unit === 'year') return new Date(d.getFullYear(), 0, 1).getTime();
  if (unit === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The find to land on one step back (dir -1) or forward (1): the latest find in
 * an earlier day/month/year, or the earliest in a later one. Null at either end.
 */
export function step(times: number[], at: number, unit: Unit, dir: -1 | 1): number | null {
  const here = periodStart(at, unit);
  let best: number | null = null;
  for (const t of times) {
    const p = periodStart(t, unit);
    if (dir < 0 ? p >= here : p <= here) continue;
    if (best === null || (dir < 0 ? t > best : t < best)) best = t;
  }
  return best;
}

/** Saves from the same day, month or year as `at`, newest first. Saves with no date are left out. */
export function inPeriod(tracks: DiscoveryTrack[], at: number, unit: Unit): DiscoveryTrack[] {
  const here = periodStart(at, unit);
  return tracks.filter((t) => t.likedAt != null && periodStart(t.likedAt, unit) === here).sort((a, b) => b.likedAt! - a.likedAt!);
}

/** Spotify likes from the same day, month or year as `at`, newest first. */
export function likesInPeriod(likes: SpotifyLike[], at: number, unit: Unit): SpotifyLike[] {
  const here = periodStart(at, unit);
  return likes.filter((l) => periodStart(l.addedAt, unit) === here).sort((a, b) => b.addedAt - a.addedAt);
}

/** Songs heard in that period, counted the same way as the Profile tab's total. */
export function heardIn(history: SwipeEntry[], at: number, unit: Unit): number {
  const here = periodStart(at, unit);
  return countSongsHeard(history.filter((e) => periodStart(e.timestamp, unit) === here));
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `at` to `now` (rounded, so a daylight-saving hour doesn't matter). */
function daysBetween(at: number, now: number): number {
  return Math.round((periodStart(now, 'day') - periodStart(at, 'day')) / DAY_MS);
}

export function shortDate(t: number, now: number): string {
  const d = new Date(t);
  const md = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${md}, ${d.getFullYear()}`;
}

/** The big title: "Today", "Thu, Sep 24", "September 2026", "2026". */
export function periodLabel(at: number, unit: Unit, now: number): string {
  const d = new Date(at);
  if (unit === 'year') return String(d.getFullYear());
  if (unit === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const days = daysBetween(at, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.getFullYear() === new Date(now).getFullYear() ? `${DAYS[d.getDay()]}, ${shortDate(at, now)}` : shortDate(at, now);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;

/** The small line above the title: how far back this is. Null when the title already says it. */
export function agoLabel(at: number, unit: Unit, now: number): string | null {
  const a = new Date(at);
  const n = new Date(now);
  if (unit === 'year') {
    const years = n.getFullYear() - a.getFullYear();
    return years === 0 ? 'This year' : years === 1 ? 'Last year' : plural(years, 'year');
  }
  if (unit === 'month') {
    const months = n.getFullYear() * 12 + n.getMonth() - (a.getFullYear() * 12 + a.getMonth());
    return months === 0 ? 'This month' : months === 1 ? 'Last month' : plural(months, 'month');
  }
  const days = daysBetween(at, now);
  if (days <= 1) return null;
  if (days < 7) return plural(days, 'day');
  if (days < 56) return plural(Math.round(days / 7), 'week');
  if (days < 365) return plural(Math.floor(days / 30.44), 'month');
  return plural(Math.floor(days / 365), 'year');
}

/**
 * One plain sentence under the title. Hearing is left out when the swipe log can't back it up;
 * Spotify likes (only when switched on) get their own short sentence after.
 */
export function periodLine(found: number, heard: number, spotify = 0): string {
  const liked = spotify > 0 ? `${spotify} liked on Spotify.` : '';
  if (found === 0 && spotify > 0) {
    if (heard === 0) return `${spotify} ${spotify === 1 ? 'song' : 'songs'} liked on Spotify.`;
    return `No blind finds among the ${heard} you heard. ${liked}`;
  }
  const songs = `${found} ${found === 1 ? 'song' : 'songs'} found`;
  const first =
    heard < found || heard === 0
      ? `${songs}.`
      : heard === found
        ? found === 1
          ? `${songs}, the only one you heard.`
          : `${songs}, every one you heard.`
        : `${songs}, out of ${heard} you heard.`;
  return liked ? `${first} ${liked}` : first;
}
