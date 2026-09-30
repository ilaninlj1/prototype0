import { parseArtistLookupResponse, type DiscoveryTrack } from './discovery';
import { djLine, matchItunes, parsePlays, rankPicks, type DjPick, type Show } from './dj-picks';
import { shouldSkip } from './human-check-api';

// KEXP's open feed (https://api.kexp.org/v2/plays/) → five playable songs.
// Credit and link KEXP wherever these are shown; phone app only.

export type DjCard = { track: DiscoveryTrack; pick: DjPick; line: string };

const shows = new Map<number, Promise<Show | null>>();

function fetchShow(id: number | null): Promise<Show | null> {
  if (id == null) return Promise.resolve(null);
  let pending = shows.get(id);
  if (!pending) {
    pending = fetch(`https://api.kexp.org/v2/shows/${id}/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { host_names?: string[]; program_name?: string } | null) =>
        s ? { host: s.host_names?.filter(Boolean).join(' & ') || null, program: s.program_name ?? null } : null
      )
      .catch(() => null);
    shows.set(id, pending);
  }
  return pending;
}

async function findPreview(pick: DjPick): Promise<DiscoveryTrack | null> {
  try {
    const term = encodeURIComponent(`${pick.artist} ${pick.song}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=10&country=US`);
    if (!res.ok) return null;
    const hit = matchItunes((await res.json()).results ?? [], pick.artist, pick.song);
    return hit ? (parseArtistLookupResponse({ results: [hit] })[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Up to `n` songs KEXP DJs played in the last day that have a preview (and aren't AI, unless AI music is on). */
export async function loadDjPicks(n = 5): Promise<DjCard[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  let picks: DjPick[] = [];
  try {
    const res = await fetch(`https://api.kexp.org/v2/plays/?limit=200&ordering=-airdate&airdate_after=${since}`);
    if (res.ok) picks = rankPicks(parsePlays(await res.json()));
  } catch {
    return [];
  }
  const out: DjCard[] = [];
  for (const pick of picks.slice(0, 14)) {
    if (out.length === n) break;
    if (await shouldSkip(pick.artist)) continue;
    const track = await findPreview(pick);
    if (!track) continue;
    out.push({ track, pick, line: djLine(pick, await fetchShow(pick.showId)) });
    await new Promise((r) => setTimeout(r, 250)); // go easy on iTunes search
  }
  return out;
}
