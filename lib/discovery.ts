// ---------- Types ----------

import type { PresetId } from './pool-types';

export type DiscoveryTrack = {
  id: number;
  trackName: string;
  artistId: number;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
  trackViewUrl: string;
  // iTunes's album id. Optional — never coerced to a fake shared value when
  // absent, since that would wrongly group unrelated tracks together. Powers
  // spreadByAlbum below.
  collectionId?: number;
  // The album's display title (iTunes's collectionName), null when the raw
  // result had none. Purely additive alongside collectionId above — display
  // data only, nothing here reads it for dedup/grouping.
  collectionName: string | null;
  // Optional solid-color fallback CardFace renders when artworkUrl100 is
  // empty, instead of a flat gray box — set by lib/pool.ts's stub (colored
  // per preset, so swapping presets is visually confirmable), left unset
  // for real iTunes-sourced tracks (which always have real artwork). Also
  // a reasonable permanent fallback if a real track is ever missing
  // artwork, not strictly a stub-only concern.
  placeholderColor?: string;
  // Phase 3 logging (2026-09-16): only meaningful for pool-steering tracks —
  // lib/pool.ts's trackToDiscoveryTrack populates these from Track.source;
  // the old genre-fetch/artist-steering path (lib/discovery.ts's own
  // fetchTracksByGenre/fetchTracksByArtist) has no Last.fm ranking/listener
  // data to offer, so they're simply absent there, same as placeholderColor
  // above is pool-stub-only.
  artistListeners?: number;
  trackRank?: number;
  // Liked tracks only: when the like happened. artistListeners on a liked
  // track is the count at that moment, i.e. what you "found them at".
  likedAt?: number;
};

// 'steer-artist'/'steer-sound': logged when the user redirects discovery
// (Tune → Next songs) without swiping the current track away — see the derivations
// below for how these are kept out of listen-time and visit-count metrics.
// 'reveal' = Home's swipe right: see who it is (and its comments) without saving it.
export type SwipeAction = 'skip' | 'like' | 'reveal' | 'genre-jump' | 'steer-artist' | 'steer-sound';

const STEER_ACTIONS = new Set<SwipeAction>(['steer-artist', 'steer-sound']);

export type SwipeEntry = {
  trackId: number;
  // Optional for the same reason as listenMs below: entries persisted before
  // this field existed genuinely don't have it, and there's no migration.
  // Populated from the DiscoveryTrack at swipe time so the Profile tab can
  // display which track/artist something was, long after it's scrolled out
  // of the fetch queue.
  trackName?: string;
  artistId: number;
  artistName?: string;
  genre: string;
  action: SwipeAction;
  timestamp: number;
  // Accumulated preview playback time before the swipe committed, in
  // milliseconds. Optional because entries persisted before this field
  // existed genuinely don't have it — deriveRatedGenres treats a missing
  // value as 0 rather than migrating old data.
  listenMs?: number;
  // Same precedent as trackName/artistName: populated going forward, no
  // migration. Powers spreadByAlbum's recent-albums window — an entry
  // without it simply never constrains anything (see spreadByAlbum).
  collectionId?: number;
  // Phase 3 logging (2026-09-16). Which preset the swiped card came from —
  // always populated going forward (the screen always has a current preset
  // in scope), but optional here since entries persisted before this field
  // existed genuinely don't have it, same precedent as every other field
  // in this type. artistListeners/trackRank mirror DiscoveryTrack's own
  // same-named fields (pool-steering-only; undefined for the old genre-
  // fetch/artist-steering path). dwellMs is wall-clock time from when this
  // card became the top of the stack to when it was swiped away — distinct
  // from listenMs (how much of the preview audio actually played): a card
  // swiped before any audio starts has listenMs 0 but a real dwellMs. Both
  // are skipped for steer-artist/steer-sound, same as listenMs already was
  // — steering doesn't dismiss the current card, so neither "how long
  // dwelled" nor "how long listened" has a real endpoint yet.
  preset?: PresetId;
  // Set for Daily Drop swipes, so analysis can separate them from the feed.
  source?: 'drop';
  artistListeners?: number;
  trackRank?: number;
  dwellMs?: number;
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

function compactCount(n: number): string {
  const [value, suffix] = n >= 1_000_000 ? [n / 1_000_000, 'M'] : n >= 1_000 ? [n / 1_000, 'K'] : [n, ''];
  const rounded = value < 100 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}${suffix}`;
}

/** The reveal's headline: an artist's Last.fm listener count and how rare that makes the find. */
export function describeListeners(listeners: number): { count: string; verdict: string } {
  const verdict =
    listeners < 25_000
      ? 'Almost nobody has heard this.'
      : listeners < 100_000
        ? 'Under the radar.'
        : listeners < 1_000_000
          ? 'Known, not famous.'
          : 'Everyone knows this one.';
  return { count: compactCount(listeners), verdict };
}

/** How an artist's listener count moved since you found them. "Called it" means it at least doubled. */
export function describeGrowth(found: number, now: number): { pct: number; calledIt: boolean } {
  return { pct: Math.round(((now - found) / found) * 100), calledIt: now >= found * 2 };
}

export type Find = { artistName: string; found?: number; now?: number };

/** The Profile's headline numbers across every blind find. */
export function summarizeFinds(finds: Find[]): {
  count: number;
  medianFound: number | null;
  calledIt: number;
  best: { artistName: string; pct: number } | null;
} {
  const founds = finds.flatMap((f) => (f.found != null ? [f.found] : [])).sort((a, b) => a - b);
  let calledIt = 0;
  let best: { artistName: string; pct: number } | null = null;
  for (const f of finds) {
    if (f.found == null || f.now == null) continue;
    const growth = describeGrowth(f.found, f.now);
    if (growth.calledIt) calledIt += 1;
    if (growth.pct > 0 && (!best || growth.pct > best.pct)) best = { artistName: f.artistName, pct: growth.pct };
  }
  return {
    count: finds.length,
    medianFound: founds.length ? founds[Math.floor((founds.length - 1) / 2)] : null,
    calledIt,
    best,
  };
}

/** Likes saved before likedAt existed get their date back from the swipe log. */
export function withLikedAt(tracks: DiscoveryTrack[], history: SwipeEntry[]): DiscoveryTrack[] {
  const lastLike = new Map<number, number>();
  for (const e of history) if (e.action === 'like') lastLike.set(e.trackId, e.timestamp);
  return tracks.map((t) => (t.likedAt != null || !lastLike.has(t.id) ? t : { ...t, likedAt: lastLike.get(t.id) }));
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

// A third of a 30s preview — enough to have actually heard something, rather
// than a reflexive dismissal. Named constant so it's a one-line change if it
// feels wrong in practice.
export const RATED_LISTEN_THRESHOLD_MS = 10000;

// Genres the user actually listened to a track from, regardless of which way
// they swiped — direction was never the thing that mattered, duration is.
// A quick skip and a quick like are both "dismissed it in two seconds"; a
// genre-jump after listening for a while is still listening. Used for the
// genre picker's "heard" checkmark, which was previously wired to the
// broader deriveGenresHeard and (before that) to swipe action, both of which
// ended up marking genres heard that were only ever dismissed instantly.
export function deriveRatedGenres(history: SwipeEntry[]): Set<string> {
  return new Set(
    history.filter((e) => (e.listenMs ?? 0) >= RATED_LISTEN_THRESHOLD_MS).map((e) => e.genre)
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
    collectionId: r.collectionId,
    collectionName: r.collectionName ?? null,
  };
}

/** Pure: a Spotify web search deep link for a track — no API/OAuth, just a query URL. */
export function buildSpotifySearchUrl(artistName: string, trackName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${trackName}`)}`;
}

function hasPreview(r: any): boolean {
  return typeof r.previewUrl === 'string' && r.previewUrl.length > 0;
}

// A track literally titled after the genre ("Techno", "Amapiano") ranks
// highly for that search term regardless of whether it's a real song —
// verified live: 9/59 kept Amapiano results and 5/153 kept Techno results
// were exactly this pattern, overwhelmingly generic tracks by unfamiliar
// one-off producer names, not real songs. Deliberately narrow (exact match
// only, not "contains" or "starts with") — that's what was actually
// evidenced; broadening it is unverified. Known false-positive cost: a
// genuinely famous song sharing the genre's exact name (Harry Styles'
// "Pop") gets dropped too — accepted rather than engineered around.
export function isGenericGenreTitle(trackName: string, searchedGenre: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = normalize(trackName);
  const b = normalize(searchedGenre);
  if (!a || !b) return false;
  return a === b;
}

/** Pure: maps + filters a genre-search JSON response, dropping genre-unrelated and generically-titled results. */
export function parseGenreSearchResponse(json: unknown, searchedGenre: string): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results
    .filter(hasPreview)
    .map(toDiscoveryTrack)
    .filter((t) => isGenreRelated(searchedGenre, t.primaryGenreName))
    .filter((t) => !isGenericGenreTitle(t.trackName, searchedGenre));
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

// The `country` param (an Apple storefront) is real and documented, unlike
// offset — verified live, across five genre+storefront pairings: divergence
// is a property of the *pairing*, not the country code alone. US vs. MX
// diverges meaningfully for reggaeton (~56% artist-set overlap) and US vs.
// ZA diverges enormously for amapiano (~9%, and the US side is mostly
// mistagged for that term to begin with) — but US vs. CO (reggaeton) and US
// vs. NG (afrobeats) both came back ~90-97% identical, dead controls, and
// US vs. KR (K-pop) returned zero results in KR for the exact term GENRES
// would send. PR is rejected outright — no separate Apple storefront exists
// for Puerto Rico. Only US/MX/ZA cleared the bar; adding a fourth means
// verifying it live the same way first, never assuming from a docs list —
// see docs/superpowers/specs/2026-09-05-region-storefront-design.md.
export type Region = 'US' | 'MX' | 'ZA';
export const REGIONS: Region[] = ['US', 'MX', 'ZA'];
export const DEFAULT_REGION: Region = 'US';

export async function fetchTracksByGenre(
  genre: string,
  region: Region = DEFAULT_REGION
): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=${ITUNES_MAX_LIMIT}&country=${region}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed for ${genre}`);
  const json = await res.json();
  return parseGenreSearchResponse(json, genre);
}

export async function fetchTracksByArtist(
  artistId: number,
  region: Region = DEFAULT_REGION
): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=${ITUNES_MAX_LIMIT}&country=${region}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes lookup failed for artist ${artistId}`);
  const json = await res.json();
  return parseArtistLookupResponse(json);
}

export async function fetchForStrategy(
  strategy: Strategy,
  region: Region = DEFAULT_REGION
): Promise<DiscoveryTrack[]> {
  return strategy.type === 'genre'
    ? fetchTracksByGenre(strategy.genre, region)
    : fetchTracksByArtist(strategy.artistId, region);
}

// ---------- Queue engine ----------

export const QUEUE_TARGET_DEPTH = 3;
export const MAX_REFILL_ATTEMPTS = 5;

// A search dominated by one compilation/album can otherwise surface several
// of its tracks in a row. Window=5, cap=1: no album may appear more than
// once within any trailing 5-track stretch of what's actually been
// presented — which subsumes "no two consecutive" as the window=2 case,
// so there's no separate adjacency rule to keep in sync with this one.
export const ALBUM_SPREAD_WINDOW = 5;
export const ALBUM_SPREAD_CAP = 1;

/**
 * Reorders `candidates` (freshly fetched, not-yet-queued tracks) so that,
 * placed one at a time after `recentAlbumIds` (oldest first — already-
 * presented history followed by whatever's currently queued), no album
 * exceeds ALBUM_SPREAD_CAP occurrences within any trailing ALBUM_SPREAD_WINDOW
 * stretch. A track with no collectionId is never constrained against
 * anything, and an `undefined` entry in `recentAlbumIds` (pre-migration
 * history with no recorded album) never spuriously matches a real one —
 * `undefined === 5` is simply false.
 *
 * Greedy, with a two-tier fallback so relaxing the cap never relaxes all the
 * way to unbounded:
 *  1. Prefer the first remaining candidate (preserving iTunes's original
 *     relevance order as a tie-break) that satisfies the full window/cap
 *     rule.
 *  2. If none do, fall back to the one guarantee that doesn't relax: the
 *     first remaining candidate that isn't the same album as the track just
 *     placed — keeping "no two consecutive" true even once the broader cap
 *     has to give.
 *  3. Only if every remaining candidate is the same album as the one just
 *     placed — nothing left to interleave with — does a repeat happen.
 */
export function spreadByAlbum(
  candidates: DiscoveryTrack[],
  recentAlbumIds: (number | undefined)[]
): DiscoveryTrack[] {
  const remaining = [...candidates];
  const placed: DiscoveryTrack[] = [];
  const window = [...recentAlbumIds];

  while (remaining.length > 0) {
    const trailing = window.slice(-(ALBUM_SPREAD_WINDOW - 1));
    const last = window[window.length - 1];

    let index = remaining.findIndex((t) => {
      if (t.collectionId === undefined) return true;
      const count = trailing.filter((id) => id === t.collectionId).length;
      return count < ALBUM_SPREAD_CAP;
    });
    if (index === -1) {
      index = remaining.findIndex((t) => t.collectionId === undefined || t.collectionId !== last);
    }
    if (index === -1) index = 0; // every remaining candidate is the same album as the one just placed

    const [chosen] = remaining.splice(index, 1);
    placed.push(chosen);
    window.push(chosen.collectionId);
  }
  return placed;
}

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
 *
 * Fresh candidates from every attempt accumulate in a pool and are spread by
 * album (spreadByAlbum) once, after fetching stops — not per batch — so a
 * dominated first batch can still be interleaved against a later batch's
 * alternatives instead of forcing an adjacency that a smarter placement could
 * have avoided. `recentAlbumIds` is the already-presented history/queue
 * context spreading should avoid repeating into; defaulted to `[]` for
 * callers that don't care about spreading.
 */
export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>,
  recentAlbumIds: (number | undefined)[] = []
): Promise<RefillResult> {
  let result = [...queue];
  const fetched: DiscoveryTrack[] = [];
  const pool: DiscoveryTrack[] = [];
  let attempts = 0;

  while (result.length + pool.length < QUEUE_TARGET_DEPTH && attempts < MAX_REFILL_ATTEMPTS) {
    attempts += 1;
    const batch = dedupeDiscoveryTracks(await fetcher(strategy));
    fetched.push(...batch);

    const queuedIds = new Set([...result, ...pool].map((t) => t.id));
    const fresh = batch.filter((t) => !seenTrackIds.has(t.id) && !queuedIds.has(t.id));
    pool.push(...fresh);
  }

  if (pool.length > 0) {
    const windowSoFar = [...recentAlbumIds, ...result.map((t) => t.collectionId)];
    result = [...result, ...spreadByAlbum(pool, windowSoFar)].slice(0, QUEUE_TARGET_DEPTH);
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
  const recentAlbumIds = history.slice(-ALBUM_SPREAD_WINDOW).map((e) => e.collectionId);

  let currentStrategy = strategy;
  let currentQueue = [...queue];
  let knownGenres = discoveredGenres;
  const fetched: DiscoveryTrack[] = [];
  let fallbacks = 0;

  for (;;) {
    const result = await refillQueue(currentQueue, currentStrategy, seenTrackIds, fetcher, recentAlbumIds);
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

/**
 * Home's undo restores a snapshot taken before the user may have played the
 * Daily Drop elsewhere; carry those drop swipes over so undo can't erase them.
 */
export function keepDropEntries(snapshot: SwipeEntry[], current: SwipeEntry[]): SwipeEntry[] {
  const key = (e: SwipeEntry) => `${e.trackId}:${e.timestamp}`;
  const have = new Set(snapshot.map(key));
  return [...snapshot, ...current.filter((e) => e.source === 'drop' && !have.has(key(e)))];
}

/** Genres in the Liked list, most common first — the filter chips. */
export function likedGenres(tracks: DiscoveryTrack[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tracks) if (t.primaryGenreName) counts.set(t.primaryGenreName, (counts.get(t.primaryGenreName) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

export function filterByGenre(tracks: DiscoveryTrack[], genre: string | null): DiscoveryTrack[] {
  return genre ? tracks.filter((t) => t.primaryGenreName === genre) : tracks;
}

/** A Liked cover's caption, like a view count: "12.4K → 48K" plus the change. */
export function growthLabel(
  found: number | undefined,
  now: number | undefined
): { text: string; change: string | null; calledIt: boolean } | null {
  const fmt = (n: number) => describeListeners(n).count;
  if (found != null && now != null && now !== found) {
    const { pct, calledIt } = describeGrowth(found, now);
    return { text: `${fmt(found)} → ${fmt(now)}`, change: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, calledIt };
  }
  if (now != null) return { text: `${fmt(now)} listeners`, change: null, calledIt: false };
  if (found != null) return { text: `found at ${fmt(found)}`, change: null, calledIt: false };
  return null;
}

/** How many different songs you've heard in the feed (a double-tap save and the swipe after it are one song). */
export function countSongsHeard(history: SwipeEntry[]): number {
  const heard = new Set<number>();
  for (const e of history) {
    if (e.action === 'skip' || e.action === 'like' || e.action === 'reveal' || e.action === 'genre-jump') heard.add(e.trackId);
  }
  return heard.size;
}
