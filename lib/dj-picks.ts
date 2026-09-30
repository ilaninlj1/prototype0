// DJ Picks: songs real KEXP DJs played in the last day, heard blind. Pure
// helpers — the network side is lib/dj-picks-api.ts.

export type DjPick = {
  playId: number;
  artist: string;
  song: string;
  album: string | null;
  airdate: string;
  /** KEXP's own label: Heavy / Medium / Light / R/N (recently added) / Library… */
  rotation: string | null;
  note: string;
  isLocal: boolean;
  location: string | null;
  showId: number | null;
};

export type Show = { host: string | null; program: string | null };

type RawPlay = {
  id?: number;
  play_type?: string;
  airdate?: string;
  artist?: string | null;
  song?: string | null;
  album?: string | null;
  rotation_status?: string | null;
  comment?: string | null;
  is_local?: boolean;
  location_name?: string | null;
  show?: number | null;
};

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(feat|ft|featuring)\b.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Song plays from KEXP's feed, newest first, each song once. */
export function parsePlays(body: { results?: RawPlay[] }): DjPick[] {
  const seen = new Set<string>();
  const out: DjPick[] = [];
  for (const p of body.results ?? []) {
    if (p.play_type !== 'trackplay' || !p.artist?.trim() || !p.song?.trim() || !p.airdate || p.id == null) continue;
    const k = `${key(p.artist)}|${key(p.song)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      playId: p.id,
      artist: p.artist.trim(),
      song: p.song.trim(),
      album: p.album ?? null,
      airdate: p.airdate,
      rotation: p.rotation_status ?? null,
      note: usefulNote(p.comment),
      isLocal: !!p.is_local,
      location: p.location_name ?? null,
      showId: p.show ?? null,
    });
  }
  return out;
}

/** Songs a DJ wrote about or keeps in rotation first (shuffled within each tier), one per artist. */
export function rankPicks(picks: DjPick[], rng: () => number = Math.random): DjPick[] {
  const score = (p: DjPick) => (p.note ? 2 : 0) + (p.rotation && p.rotation !== 'Library' ? 1 : 0) + (p.isLocal ? 1 : 0);
  const artists = new Set<string>();
  return picks
    .map((p) => ({ p, s: score(p) + rng() * 0.9 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p)
    .filter((p) => {
      const a = key(p.artist);
      if (artists.has(a)) return false;
      artists.add(a);
      return true;
    });
}

/** A DJ's note without links, on one line, at most ~200 characters. */
export function cleanNote(note: string | null | undefined): string {
  const text = (note ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
}

// Sentences that point somewhere else instead of saying something.
const FILLER = /\b(video|watch|check (it |them )?out|stream(ing)?|listen (to it |here|now)|follow|subscribe|click|link|youtube|instagram|spotify|apple music|bandcamp|pre-?order|pre-?save|below|above)\b/i;

// On-air shout-outs that mean nothing on a card.
const SHOUTOUT = /^(welcome back|dedicated to|happy birthday|shout ?out|rip\b|thanks? (to|you))/i;

/** The part of a DJ's note worth reading on a card: what's new and when, not "watch the video". */
export function usefulNote(note: string | null | undefined): string {
  const text = cleanNote(note)
    .replace(/:\s*-\s*/g, ': ') // "Playing: - Portland …"
    .replace(/\s+-\s+(?=[A-Z])/g, ', '); // "… Polaris Hall - San Francisco …"
  const sentences = text.split(/(?<=[.!?])\s+(?=["“'A-Z0-9])/).filter((x) => x && !FILLER.test(x) && !SHOUTOUT.test(x));
  let out = '';
  for (const x of sentences.slice(0, 2)) {
    if (out && out.length + x.length + 1 > 160) break;
    out = out ? `${out} ${x}` : x;
  }
  if (out.length <= 160) return out;
  const cut = out.slice(0, 160);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
}

/** The iTunes search result that is this song by this artist, with a preview to play. */
export function matchItunes<T extends { wrapperType?: string; artistName?: string; trackName?: string; previewUrl?: string }>(
  results: T[],
  artist: string,
  song: string
): T | null {
  const a = key(artist);
  const s = key(song);
  return (
    results.find((r) => {
      if (r.wrapperType !== 'track' || !r.previewUrl || !r.artistName || !r.trackName) return false;
      const ra = key(r.artistName);
      return (ra === a || ra.startsWith(`${a} `) || a.startsWith(`${ra} `)) && key(r.trackName) === s;
    }) ?? null
  );
}

const ROTATION: Record<string, string> = {
  Heavy: 'heavy rotation',
  Medium: 'medium rotation',
  Light: 'light rotation',
  'R/N': 'just added',
  R: 'just added',
  N: 'just added',
  Library: 'from the library',
};

function ago(airdate: string, now: number): string {
  const mins = Math.max(1, Math.round((now - Date.parse(airdate)) / 60_000));
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

/** "Played 3h ago by Atticus on Variety Mix · heavy rotation". */
export function djLine(pick: DjPick, show: Show | null, now: number = Date.now()): string {
  let line = `Played ${ago(pick.airdate, now)}`;
  if (show?.host) line += ` by ${show.host}${show.program ? ` on ${show.program}` : ''}`;
  else line += ' on KEXP';
  const rotation = pick.rotation ? ROTATION[pick.rotation] : undefined;
  return rotation ? `${line} · ${rotation}` : line;
}
