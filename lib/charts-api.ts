import AsyncStorage from '@react-native-async-storage/async-storage';

// Network side of World Charts: Apple's official daily feeds, plus the
// shared snapshots in Supabase that make day-over-day arrows possible.

import { movement, parseChartFeed, risers, risingBaseline, type ChartEntry, type Move, type TrackHistory } from './charts';

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'us', name: 'United States' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'br', name: 'Brazil' },
  { code: 'za', name: 'South Africa' },
  { code: 'ng', name: 'Nigeria' },
  { code: 'jp', name: 'Japan' },
  { code: 'kr', name: 'South Korea' },
  { code: 'mx', name: 'Mexico' },
  { code: 'co', name: 'Colombia' },
  { code: 'in', name: 'India' },
  { code: 'ph', name: 'Philippines' },
  { code: 'tr', name: 'Turkey' },
  { code: 'eg', name: 'Egypt' },
  { code: 'fr', name: 'France' },
  { code: 'de', name: 'Germany' },
  { code: 'se', name: 'Sweden' },
  { code: 'es', name: 'Spain' },
  { code: 'au', name: 'Australia' },
];

function daysBefore(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}
const yesterdayOf = (day: string) => daysBefore(day, 1);

/** Peak and days-on-chart for these songs in this country (from the chart_track_stats view). */
async function fetchHistory(country: string, ids: number[]): Promise<Record<number, TrackHistory>> {
  if (!URL_ROOT || !KEY || ids.length === 0) return {};
  try {
    const res = await fetch(
      `${URL_ROOT}/rest/v1/chart_track_stats?country=eq.${country}&track_id=in.(${ids.join(',')})&select=track_id,peak,days_on_chart`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!res.ok) return {};
    const rows = (await res.json()) as { track_id: number; peak: number; days_on_chart: number }[];
    return Object.fromEntries(rows.map((r) => [r.track_id, { peak: r.peak, days: r.days_on_chart }]));
  } catch {
    return {};
  }
}

const FEED_TIMEOUT_MS = 5_000;

async function fetchFeed(country: string): Promise<{ day: string | null; entries: ChartEntry[] }> {
  // Apple's feed usually answers in 1–2s but sometimes hangs ~30s then 504s;
  // give up after 5s and retry once rather than waiting it out.
  for (let attempt = 0; attempt < 2; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(`https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/50/songs.json`, {
        signal: abort.signal,
      });
      if (res.ok) return parseChartFeed(await res.json());
    } catch {
      // timed out or failed; retry
    } finally {
      clearTimeout(timer);
    }
  }
  return { day: null, entries: [] };
}

// Last chart seen per country, kept on the phone: instant reopen, and a
// fallback when Apple is down.
const CACHE_PREFIX = 'blindspotDiscovery:chart:';

async function readCached(country: string): Promise<{ day: string; entries: ChartEntry[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + country);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCached(country: string, day: string, entries: ChartEntry[]) {
  AsyncStorage.setItem(CACHE_PREFIX + country, JSON.stringify({ day, entries })).catch(() => {});
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function saveSnapshot(day: string, country: string, entries: ChartEntry[]): Promise<void> {
  if (!URL_ROOT || !KEY || entries.length === 0) return;
  try {
    await fetch(`${URL_ROOT}/rest/v1/chart_snapshots?on_conflict=day,country,rank`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(
        entries.map((e) => ({ day, country, rank: e.rank, track_id: e.id, title: e.title, artist: e.artist, artwork_url: e.artworkUrl }))
      ),
    });
  } catch {
    // snapshots are best-effort
  }
}

async function fetchSnapshot(day: string, country: string): Promise<ChartEntry[]> {
  if (!URL_ROOT || !KEY) return [];
  try {
    const res = await fetch(
      `${URL_ROOT}/rest/v1/chart_snapshots?day=eq.${day}&country=eq.${country}&select=rank,track_id,title,artist,artwork_url&order=rank`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { rank: number; track_id: number; title: string; artist: string; artwork_url: string | null }[];
    return rows.map((r) => ({ rank: r.rank, id: r.track_id, title: r.title, artist: r.artist, artworkUrl: r.artwork_url ?? '' }));
  } catch {
    return [];
  }
}

export type Chart = {
  day: string | null;
  entries: ChartEntry[];
  moves: Record<number, Move>;
  rising: ChartEntry[];
  /** False until a previous day has been saved, i.e. arrows start tomorrow. */
  hasHistory: boolean;
  /** What "rising fastest" compares against. */
  risingSpan: 'this week' | 'today';
  /** Peak and days on chart per song, once snapshots exist. */
  history: Record<number, TrackHistory>;
};

function withMoves(
  day: string,
  entries: ChartEntry[],
  yesterday: ChartEntry[],
  weekAgo: ChartEntry[] = [],
  history: Record<number, TrackHistory> = {}
): Chart {
  const baseline = risingBaseline(weekAgo, yesterday);
  return {
    day,
    entries,
    moves: movement(entries, yesterday),
    rising: risers(entries, baseline.entries, 8),
    hasHistory: yesterday.length > 0,
    risingSpan: baseline.span,
    history,
  };
}

/** The phone's last copy of a country's chart, shown instantly while the fresh one loads. */
export async function peekChart(country: string): Promise<Chart | null> {
  const cached = await readCached(country);
  return cached ? withMoves(cached.day, cached.entries, []) : null;
}

/**
 * Today's chart for a country, fastest source first: today's shared copy in
 * Supabase (~0.3s, saved by whoever opened it first), then Apple's feed
 * (saved for everyone), then the phone's last copy. Arrows compare against
 * yesterday's shared copy.
 */
export async function loadChart(country: string): Promise<Chart> {
  const today = utcToday();
  const [shared, yesterday, weekAgo] = await Promise.all([
    fetchSnapshot(today, country),
    fetchSnapshot(yesterdayOf(today), country),
    fetchSnapshot(daysBefore(today, 7), country),
  ]);
  if (shared.length > 0) {
    writeCached(country, today, shared);
    return withMoves(today, shared, yesterday, weekAgo, await fetchHistory(country, shared.map((e) => e.id)));
  }
  const feed = await fetchFeed(country);
  if (feed.day && feed.entries.length > 0) {
    saveSnapshot(feed.day, country, feed.entries);
    writeCached(country, feed.day, feed.entries);
    const before = feed.day === today ? yesterday : await fetchSnapshot(yesterdayOf(feed.day), country);
    return withMoves(feed.day, feed.entries, before, weekAgo, await fetchHistory(country, feed.entries.map((e) => e.id)));
  }
  const cached = await readCached(country);
  if (cached) return withMoves(cached.day, cached.entries, []);
  return { day: null, entries: [], moves: {}, rising: [], hasHistory: false, risingSpan: 'today', history: {} };
}
