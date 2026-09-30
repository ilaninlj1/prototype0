// Network side of World Charts: Apple's official daily feeds, plus the
// shared snapshots in Supabase that make day-over-day arrows possible.

import { movement, parseChartFeed, risers, type ChartEntry, type Move } from './charts';

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

function yesterdayOf(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

async function fetchFeed(country: string): Promise<{ day: string | null; entries: ChartEntry[] }> {
  // Apple's feed occasionally times out (504); one quiet retry covers it.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/50/songs.json`);
      if (res.ok) return parseChartFeed(await res.json());
    } catch {
      // retry
    }
  }
  return { day: null, entries: [] };
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
};

/** Today's chart for a country, saved for tomorrow's comparison, with arrows against yesterday. */
export async function loadChart(country: string): Promise<Chart> {
  const { day, entries } = await fetchFeed(country);
  if (!day) return { day: null, entries: [], moves: {}, rising: [], hasHistory: false };
  saveSnapshot(day, country, entries);
  const yesterday = await fetchSnapshot(yesterdayOf(day), country);
  return {
    day,
    entries,
    moves: movement(entries, yesterday),
    rising: risers(entries, yesterday, 8),
    hasHistory: yesterday.length > 0,
  };
}
