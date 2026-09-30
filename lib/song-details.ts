// Search (iTunes) and the song page's deep details, each fetched on its own
// so the page fills in as they arrive. Every call fails soft to null/[].
//
// Sources: iTunes (search, previews), Last.fm (plays/listeners), Deezer (only
// to turn a song into its ISRC), MusicBrainz (credits, CC0), Discogs (vinyl
// collectors, CC0), Wikipedia (the story, CC BY-SA — credited and linked).

import { parseArtistLookupResponse, type DiscoveryTrack } from './discovery';
import { parseCredits, replayScore, wikiMatches, type Credits } from './song-facts';

const UA = 'Blindspot/0.1 (student project; ilan@homewyrks.com)';

async function json<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ---------- Search ----------

export type SearchResults = {
  songs: DiscoveryTrack[];
  artists: { id: number; name: string; artworkUrl: string }[];
  albums: { id: number; title: string; artist: string; artworkUrl: string }[];
};

/** One iTunes call; artists and albums are drawn from the matching songs. */
export async function searchMusic(term: string): Promise<SearchResults> {
  const body = await json<{ results: any[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=40&country=US`
  );
  const results = body?.results ?? [];
  const songs = parseArtistLookupResponse({ results }).slice(0, 15);
  const artists = new Map<number, SearchResults['artists'][number]>();
  const albums = new Map<number, SearchResults['albums'][number]>();
  for (const r of results) {
    if (r.artistId && !artists.has(r.artistId)) artists.set(r.artistId, { id: r.artistId, name: r.artistName, artworkUrl: r.artworkUrl100 ?? '' });
    if (r.collectionId && !albums.has(r.collectionId))
      albums.set(r.collectionId, { id: r.collectionId, title: r.collectionName, artist: r.artistName, artworkUrl: r.artworkUrl100 ?? '' });
  }
  return { songs, artists: [...artists.values()].slice(0, 5), albums: [...albums.values()].slice(0, 6) };
}

/** Songs by iTunes track id, in the order asked (one call). Chart songs need their own country's store. */
export async function lookupTracks(ids: number[], country = 'US'): Promise<DiscoveryTrack[]> {
  if (ids.length === 0) return [];
  const body = await json<{ results: any[] }>(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=${country}`);
  const found = parseArtistLookupResponse(body ?? {});
  return ids.flatMap((id) => found.filter((t) => t.id === id).slice(0, 1));
}

/** An artist's or album's songs (iTunes lookup by artist or collection id). */
export async function songsOf(id: number, limit = 50): Promise<DiscoveryTrack[]> {
  const body = await json<{ results: any[] }>(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=${limit}&country=US`);
  return parseArtistLookupResponse(body ?? {});
}

// ---------- The song page ----------

export type TrackStats = { listeners: number; plays: number; replay: number | null };

export async function fetchTrackStats(artist: string, title: string): Promise<TrackStats | null> {
  const key = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  if (!key) return null;
  const body = await json<{ track?: { listeners?: string; playcount?: string } }>(
    `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&autocorrect=1&api_key=${key}&format=json`
  );
  const listeners = Number(body?.track?.listeners);
  const plays = Number(body?.track?.playcount);
  if (!listeners) return null;
  return { listeners, plays, replay: replayScore(plays, listeners) };
}

/** Deezer → ISRC → MusicBrainz recording with its credits. */
export async function fetchCredits(artist: string, title: string): Promise<Credits | null> {
  const found = await json<{ data?: { id: number }[] }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artist}" track:"${title}"`)}&limit=1`
  );
  const deezerId = found?.data?.[0]?.id;
  if (!deezerId) return null;
  const track = await json<{ isrc?: string }>(`https://api.deezer.com/track/${deezerId}`);
  if (!track?.isrc) return null;
  const mb = { 'User-Agent': UA, Accept: 'application/json' };
  const byIsrc = await json<{ recordings?: { id: string }[] }>(`https://musicbrainz.org/ws/2/isrc/${track.isrc}?fmt=json`, mb);
  const mbid = byIsrc?.recordings?.[0]?.id;
  if (!mbid) return null;
  await new Promise((r) => setTimeout(r, 1100)); // MusicBrainz asks for one request per second
  const rec = await json<Parameters<typeof parseCredits>[0]>(
    `https://musicbrainz.org/ws/2/recording/${mbid}?inc=artist-rels+work-rels+work-level-rels+recording-rels&fmt=json`,
    mb
  );
  return rec ? parseCredits(rec) : null;
}

export type Collectors = { have: number; want: number; styles: string[]; year: number | null };

/** Discogs: how many people own the record on vinyl/CD and how many want it. */
export async function fetchCollectors(artist: string, album: string): Promise<Collectors | null> {
  const h = { 'User-Agent': UA };
  const search = await json<{ results?: { id: number; type: string }[] }>(
    `https://api.discogs.com/database/search?artist=${encodeURIComponent(artist)}&release_title=${encodeURIComponent(album)}&type=master&per_page=1`,
    h
  );
  const masterId = search?.results?.[0]?.id;
  if (!masterId) return null;
  const master = await json<{ main_release?: number; styles?: string[]; year?: number }>(`https://api.discogs.com/masters/${masterId}`, h);
  if (!master?.main_release) return null;
  const release = await json<{ community?: { have?: number; want?: number } }>(`https://api.discogs.com/releases/${master.main_release}`, h);
  const c = release?.community;
  if (!c) return null;
  return { have: c.have ?? 0, want: c.want ?? 0, styles: master.styles ?? [], year: master.year ?? null };
}

export type Story = { text: string; url: string };

/** Wikipedia's summary of the song, only if it's really this artist's song. */
export async function fetchStory(artist: string, title: string): Promise<Story | null> {
  const candidates = [`${title} (${artist} song)`, `${title} (song)`, title];
  for (const c of candidates) {
    const page = await json<{ type?: string; extract?: string; content_urls?: { mobile?: { page?: string } } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c.replace(/ /g, '_'))}`,
      { 'Api-User-Agent': UA }
    );
    if (page?.type === 'standard' && page.extract && wikiMatches(page.extract, artist)) {
      return { text: page.extract, url: page.content_urls?.mobile?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(c)}` };
    }
  }
  return null;
}

/** An artist's iTunes id by name (first match), or null. */
export async function findItunesArtist(name: string): Promise<{ id: number; name: string } | null> {
  const body = await json<{ results?: { artistId?: number; artistName?: string }[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=1&country=US`
  );
  const r = body?.results?.[0];
  return r?.artistId ? { id: r.artistId, name: r.artistName ?? name } : null;
}
