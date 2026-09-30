// World charts (Apple Music's official daily "most played" feeds) and the
// day-over-day movement that powers the rising arrows.

export type ChartEntry = { rank: number; id: number; title: string; artist: string; artworkUrl: string };

type Feed = { feed?: { updated?: string; results?: { id: string; name: string; artistName: string; artworkUrl100?: string }[] } };

export function parseChartFeed(json: Feed): { day: string | null; entries: ChartEntry[] } {
  const f = json.feed;
  if (!f?.results) return { day: null, entries: [] };
  const d = f.updated ? new Date(f.updated) : null;
  return {
    day: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null,
    entries: f.results.map((r, i) => ({ rank: i + 1, id: Number(r.id), title: r.name, artist: r.artistName, artworkUrl: r.artworkUrl100 ?? '' })),
  };
}

export type Move = { delta: number | null; isNew: boolean };

/** Per song: places climbed since yesterday (negative = fell), or new to the chart. */
export function movement(today: ChartEntry[], yesterday: ChartEntry[]): Record<number, Move> {
  if (yesterday.length === 0) return {};
  const before = new Map(yesterday.map((x) => [x.id, x.rank]));
  const out: Record<number, Move> = {};
  for (const t of today) {
    const was = before.get(t.id);
    out[t.id] = was == null ? { delta: null, isNew: true } : { delta: was - t.rank, isNew: false };
  }
  return out;
}

/** "Rising fastest": the biggest climbs, then today's new entries (by rank). */
export function risers(today: ChartEntry[], yesterday: ChartEntry[], n: number): ChartEntry[] {
  const moves = movement(today, yesterday);
  const climbers = today.filter((t) => (moves[t.id]?.delta ?? 0) > 0).sort((a, b) => moves[b.id].delta! - moves[a.id].delta!);
  const fresh = today.filter((t) => moves[t.id]?.isNew);
  return [...climbers, ...fresh].slice(0, n);
}

/** Next songs → Similar artists: a Last.fm similar artist not yet played this session. */
export function pickSimilar(similar: string[], current: string, played: Set<string>, rng: () => number = Math.random): string | null {
  const open = similar.filter((a) => a !== current && !played.has(a));
  if (open.length === 0) return null;
  return open[Math.floor(rng() * Math.min(open.length, 5))];
}
