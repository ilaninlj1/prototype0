// ---------- Types ----------

export type DiscoveryTrack = {
  id: number;
  trackName: string;
  artistId: number;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
  trackViewUrl: string;
};

export type SwipeAction = 'skip' | 'like' | 'genre-jump';

export type SwipeEntry = {
  trackId: number;
  artistId: number;
  genre: string;
  action: SwipeAction;
  timestamp: number;
};

export type Strategy =
  | { type: 'genre'; genre: string }
  | { type: 'artist'; artistId: number; artistName: string };

// ---------- Pure track helpers ----------

export function dedupeDiscoveryTracks(tracks: DiscoveryTrack[]): DiscoveryTrack[] {
  const map = new Map<number, DiscoveryTrack>();
  for (const t of tracks) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values());
}

/** Distinct primaryGenreName values among tracks, in first-seen order. */
export function extractGenres(tracks: DiscoveryTrack[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tracks) {
    if (!seen.has(t.primaryGenreName)) {
      seen.add(t.primaryGenreName);
      out.push(t.primaryGenreName);
    }
  }
  return out;
}

/** Appends any genres in `found` not already in `existing`, preserving `existing`'s order. */
export function mergeDiscoveredGenres(existing: string[], found: string[]): string[] {
  const known = new Set(existing);
  const additions = found.filter((g) => !known.has(g));
  return additions.length > 0 ? [...existing, ...additions] : existing;
}

/**
 * Upscales an iTunes artwork URL from its default 100x100 to `size`x`size` —
 * the same asset is served at any size through this URL's trailing
 * `NxNbb.jpg` segment (verified against the live API: every artworkUrl100
 * ends in exactly "100x100bb.jpg"), so no extra fetch or lookup is needed.
 * Falls back to the input unchanged if it's empty or doesn't match that
 * pattern.
 */
export function artworkUrl(url: string, size: number): string {
  if (!url) return url;
  return url.replace(/\d+x\d+bb\.jpg$/, `${size}x${size}bb.jpg`);
}

export type GenreTermOverrides = Record<string, string[]>;

// Substring matching fails whenever a search term shares no substring with the
// primaryGenreName iTunes actually returns for it — e.g. "reggaeton" search
// results come back as "Urbano latino"/"Música tropical", not "reggaeton", so
// every one of them was getting filtered out despite being exactly right.
// Bulk-tested against the live API across 33 search terms; these 28 needed an
// explicit exact-match list instead. Keys and each value are matched
// case-insensitively. Plain data — extend as more mismatches turn up.
export const GENRE_TERM_OVERRIDES: GenreTermOverrides = {
  house: ['House', 'Dance', 'Electronic'],
  'deep house': ['House', 'Electronic', 'Dance'],
  'tech house': ['House', 'Dance', 'Electronic'],
  techno: ['Dance', 'Electronic', 'House'],
  dubstep: ['Dance', 'Dubstep', 'Electronic'],
  'drum and bass': ['Dance', 'Electronic', "Jungle/Drum'n'bass"],
  disco: ['Disco', 'Dance', 'Pop'],
  funk: ['R&B/Soul', 'Funk', 'Dance'],
  soul: ['R&B/Soul'],
  reggaeton: ['Urbano latino', 'Música tropical'],
  afrobeats: ['Afrobeats', 'Afro-Beat', 'Worldwide'],
  amapiano: ['Afro-Beat', 'Afrobeats', 'Worldwide'],
  'bossa nova': ['Bossa Nova', 'Contemporary Jazz', 'Jazz'],
  salsa: ['Música tropical', 'Latin'],
  bachata: ['Música tropical', 'Urbano latino', 'Pop Latino'],
  cumbia: ['Música Mexicana', 'Latin', 'Música tropical'],
  'k-pop': ['K-Pop'],
  shoegaze: ['Alternative', 'Rock'],
  punk: ['Alternative', 'Rock', 'Punk'],
  metal: ['Hard Rock', 'Metal', 'Rock'],
  grunge: ['Alternative', 'Hard Rock', 'Rock'],
  'indie rock': ['Indie Rock', 'Alternative'],
  'bedroom pop': ['Pop', 'Alternative', 'Indie Pop'],
  'lo-fi': ['Instrumental', 'Electronic'],
  ambient: ['New Age', 'Instrumental', 'Electronic'],
  gospel: ['Christian', 'Gospel'],
  drill: ['Hip-Hop/Rap'],
  'boom bap': ['Hip-Hop/Rap'],
};

/**
 * Case-insensitive genre relation. A search term present in `overrides` is
 * matched by exact equality against its acceptable list only — substring
 * logic isn't consulted at all for that term, even where it would have
 * matched. A term absent from `overrides` falls back to the substring check
 * this always used (no external genre taxonomy for those).
 */
export function isGenreRelated(
  searchTerm: string,
  trackGenre: string,
  overrides: GenreTermOverrides = GENRE_TERM_OVERRIDES
): boolean {
  const a = searchTerm.trim().toLowerCase();
  const b = trackGenre.trim().toLowerCase();
  if (!a || !b) return false;

  const acceptable = overrides[a];
  if (acceptable) {
    return acceptable.some((g) => g.trim().toLowerCase() === b);
  }

  return a.includes(b) || b.includes(a);
}

// ---------- Derive sets from swipe history ----------

export function deriveSeenTrackIds(history: SwipeEntry[]): Set<number> {
  return new Set(history.map((e) => e.trackId));
}

export function deriveVisitedArtistIds(history: SwipeEntry[]): Set<number> {
  return new Set(history.map((e) => e.artistId));
}

// Every genre a swipe has touched at all, including genre-jumps (which log
// the genre being *abandoned*, not judged). This intentionally broad "already
// explored" notion is what pickJumpGenre and refillQueueWithFallback use to
// avoid re-surfacing the same territory — a different concern from "did the
// user actually rate something from this genre" (see deriveRatedGenres).
export function deriveGenresHeard(history: SwipeEntry[]): Set<string> {
  return new Set(history.map((e) => e.genre));
}

// Genres the user actually swiped left (skip) or right (like) on a track
// from — deliberately excludes genre-jump entries, since swiping down away
// from a genre doesn't mean any track from it was actually judged. Used for
// the genre picker's "heard" checkmark, which was previously wired to the
// broader deriveGenresHeard and ended up marking far too many genres.
export function deriveRatedGenres(history: SwipeEntry[]): Set<string> {
  return new Set(
    history.filter((e) => e.action === 'skip' || e.action === 'like').map((e) => e.genre)
  );
}

// ---------- Genre-jump selection ----------

/**
 * Picks the genre for a swipe-down "jump", in priority order:
 * 1. Random from discoveredGenres not yet heard.
 * 2. Random from allGenres not yet heard.
 * 3. The least-recently-heard genre across discoveredGenres ∪ allGenres (by most
 *    recent occurrence in history), once everything has been heard.
 */
export function pickJumpGenre(
  discoveredGenres: string[],
  genresHeard: Set<string>,
  allGenres: string[],
  history: SwipeEntry[]
): string {
  const unexploredDiscovered = discoveredGenres.filter((g) => !genresHeard.has(g));
  if (unexploredDiscovered.length > 0) {
    return unexploredDiscovered[Math.floor(Math.random() * unexploredDiscovered.length)];
  }

  const unexploredBroad = allGenres.filter((g) => !genresHeard.has(g));
  if (unexploredBroad.length > 0) {
    return unexploredBroad[Math.floor(Math.random() * unexploredBroad.length)];
  }

  const pool = Array.from(new Set([...discoveredGenres, ...allGenres]));
  if (pool.length === 0) {
    throw new Error('pickJumpGenre: no genres available');
  }

  let leastRecent = pool[0];
  let leastRecentAt = Infinity;
  for (const genre of pool) {
    let lastHeardAt = -Infinity;
    for (const entry of history) {
      if (entry.genre === genre && entry.timestamp > lastHeardAt) {
        lastHeardAt = entry.timestamp;
      }
    }
    if (lastHeardAt < leastRecentAt) {
      leastRecentAt = lastHeardAt;
      leastRecent = genre;
    }
  }
  return leastRecent;
}

// ---------- iTunes fetch layer ----------

function toDiscoveryTrack(r: any): DiscoveryTrack {
  return {
    id: r.trackId,
    trackName: r.trackName ?? 'Unknown Title',
    artistId: r.artistId,
    artistName: r.artistName ?? 'Unknown Artist',
    artworkUrl100: r.artworkUrl100 ?? '',
    primaryGenreName: r.primaryGenreName ?? '',
    previewUrl: r.previewUrl,
    trackViewUrl: r.trackViewUrl ?? '',
  };
}

/** Pure: a Spotify web search deep link for a track — no API/OAuth, just a query URL. */
export function buildSpotifySearchUrl(artistName: string, trackName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${trackName}`)}`;
}

function hasPreview(r: any): boolean {
  return typeof r.previewUrl === 'string' && r.previewUrl.length > 0;
}

/** Pure: maps + filters a genre-search JSON response, dropping genre-unrelated results. */
export function parseGenreSearchResponse(json: unknown, searchedGenre: string): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results
    .filter(hasPreview)
    .map(toDiscoveryTrack)
    .filter((t) => isGenreRelated(searchedGenre, t.primaryGenreName));
}

/** Pure: maps + filters an artist-lookup JSON response. Its first result is the artist itself. */
export function parseArtistLookupResponse(json: unknown): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results.filter((r) => r.wrapperType === 'track' && hasPreview(r)).map(toDiscoveryTrack);
}

// iTunes's Search API caps `limit` at 200 and silently ignores any `offset`
// param (verified against the live endpoint: offset=25 returns the exact same
// page as offset=0) — there is no real pagination available here. Asking for
// the max in one shot is the only way to get more than a token pool per genre.
const ITUNES_MAX_LIMIT = 200;

export async function fetchTracksByGenre(genre: string): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=${ITUNES_MAX_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed for ${genre}`);
  const json = await res.json();
  return parseGenreSearchResponse(json, genre);
}

export async function fetchTracksByArtist(artistId: number): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=${ITUNES_MAX_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes lookup failed for artist ${artistId}`);
  const json = await res.json();
  return parseArtistLookupResponse(json);
}

export async function fetchForStrategy(strategy: Strategy): Promise<DiscoveryTrack[]> {
  return strategy.type === 'genre'
    ? fetchTracksByGenre(strategy.genre)
    : fetchTracksByArtist(strategy.artistId);
}

// ---------- Queue engine ----------

export const QUEUE_TARGET_DEPTH = 3;
export const MAX_REFILL_ATTEMPTS = 5;

export type RefillResult = {
  queue: DiscoveryTrack[];
  fetched: DiscoveryTrack[];
};

/**
 * Tops `queue` up to QUEUE_TARGET_DEPTH by calling `fetcher` for more tracks under
 * `strategy`, skipping anything in `seenTrackIds` or already queued. `fetched`
 * accumulates every track any fetch attempt returned — including duplicates that
 * never make it into the queue — since a genre only needs to have been *returned*
 * by iTunes to count as discovered (see lib/discovery-storage.ts's genre catalog).
 * Gives up after MAX_REFILL_ATTEMPTS fetches that add nothing new, rather than
 * looping forever against an exhausted strategy.
 */
export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>
): Promise<RefillResult> {
  let result = [...queue];
  const fetched: DiscoveryTrack[] = [];
  let attempts = 0;

  while (result.length < QUEUE_TARGET_DEPTH && attempts < MAX_REFILL_ATTEMPTS) {
    attempts += 1;
    const batch = dedupeDiscoveryTracks(await fetcher(strategy));
    fetched.push(...batch);

    const queuedIds = new Set(result.map((t) => t.id));
    const fresh = batch.filter((t) => !seenTrackIds.has(t.id) && !queuedIds.has(t.id));
    if (fresh.length === 0) continue;

    result = [...result, ...fresh].slice(0, QUEUE_TARGET_DEPTH);
  }

  return { queue: result, fetched };
}

export const MAX_GENRE_FALLBACKS = 5;

export type RefillWithFallbackResult = {
  queue: DiscoveryTrack[];
  fetched: DiscoveryTrack[];
  strategy: Strategy;
};

/**
 * Like refillQueue, but never dead-ends on an exhausted strategy: if the given
 * strategy (an artist's catalog, or a genre search that's returned everything
 * it has) can't fill the queue on its own, falls back to another genre —
 * chosen the same way a swipe-down genre-jump picks one, preferring an
 * unexplored discovered genre, then an unexplored broad genre, then the
 * least-recently-heard genre — and keeps trying distinct genres up to
 * MAX_GENRE_FALLBACKS times. Returns the strategy actually left active, which
 * the caller should persist as the new current strategy if it changed.
 */
export async function refillQueueWithFallback(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  history: SwipeEntry[],
  discoveredGenres: string[],
  allGenres: string[],
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>
): Promise<RefillWithFallbackResult> {
  const seenTrackIds = deriveSeenTrackIds(history);
  const genresHeard = deriveGenresHeard(history);
  const triedGenres = new Set<string>();

  let currentStrategy = strategy;
  let currentQueue = [...queue];
  let knownGenres = discoveredGenres;
  const fetched: DiscoveryTrack[] = [];
  let fallbacks = 0;

  for (;;) {
    const result = await refillQueue(currentQueue, currentStrategy, seenTrackIds, fetcher);
    currentQueue = result.queue;
    fetched.push(...result.fetched);
    knownGenres = mergeDiscoveredGenres(knownGenres, extractGenres(result.fetched));

    if (currentQueue.length >= QUEUE_TARGET_DEPTH || fallbacks >= MAX_GENRE_FALLBACKS) break;

    fallbacks += 1;
    if (currentStrategy.type === 'genre') triedGenres.add(currentStrategy.genre);
    const excluded = new Set([...genresHeard, ...triedGenres]);
    const fallbackGenre = pickJumpGenre(knownGenres, excluded, allGenres, history);
    currentStrategy = { type: 'genre', genre: fallbackGenre };
  }

  return { queue: currentQueue, fetched, strategy: currentStrategy };
}
