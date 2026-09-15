// Phase 1 — the pool-steering control's runtime data layer. Real
// implementation (2026-09-15), replacing the Phase 2 stub.
//
// Reads assets/genres.json (built by scripts/seed-genres.ts +
// scripts/resolve-itunes-ids.ts + scripts/band-genres.ts — see those for
// how artists get into this file and why itunesArtistId is already
// resolved here, not looked up at runtime). Per artist: one Last.fm
// artist.getTopTracks call for the ranked track list, one iTunes
// lookup?id=<itunesArtistId> call for the catalog (itunesArtistId being
// pre-resolved is what makes this ONE iTunes call instead of the original
// spec's two — the name-search step moved entirely to seed time). Local
// title intersection selects candidates; hitRankMax/deepCutRelativeFloor/
// deepCutMinTrackCount (lib/pool-config.ts) select which of those match
// the requested preset.
//
// Latency: getTracks() returns as soon as poolQuickFillSize tracks are
// ready, not deckSize — the rest keeps filling in the background into an
// in-memory leftover cache, keyed per preset+genre, that later calls for
// the same combination drain before doing any network work at all. Last.fm
// and iTunes calls each run through their own strictly serial pacer
// (makePacer, below) at their own service's delay (lastfmDelayMs /
// itunesDelayMs, lib/pool-config.ts) — two independent services, two
// independent rate limits, so one is never waiting on the other's queue.
//
// Starvation: if a preset's primary ArtistBand runs out of eligible
// artists before a request is satisfied, this widens to the other band
// rather than returning short (C7: "relax rather than stall") — logged as
// it happens, since that's the actual signal for how often a genre's
// exclude-set is outrunning its population.

// `with { type: 'json' }`: required by Node's native ESM loader (used when
// scripts/test-pool.ts runs this file directly), which Metro doesn't
// require but should tolerate — standard import-attribute syntax, not a
// Node-only hack. Not yet verified against a live Metro build (Metro is
// intentionally offline right now) — worth a bundle check once it's back.
import genresSeedRaw from '../assets/genres.json' with { type: 'json' };
import type { DiscoveryTrack } from './discovery.ts';
import { deckSize, deepCutMinTrackCount, deepCutRelativeFloor, hitRankMax, itunesDelayMs, lastfmDelayMs, poolQuickFillSize } from './pool-config.ts';
import type { ArtistBand, PresetId, SeedArtistEntry, SongBand, Track } from './pool-types.ts';
import { shuffle } from './taste-test.ts';

const genresSeed = genresSeedRaw as unknown as Record<string, SeedArtistEntry[]>;

const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';
const ITUNES_LOOKUP_ROOT = 'https://itunes.apple.com/lookup';

// ---------- Diagnostics: a side channel, not a return value ----------
//
// getTracks()'s return value is just Track[] — it doesn't surface WHY a
// deck came up however it did. scripts/test-pool.ts needs that (discard
// rate, deepCutMinTrackCount skips) without changing the public contract,
// so these are module-level counters, always incremented (cheap — a few
// integer additions per artist), read/reset only by the harness. The app
// itself never calls getPoolDiagnostics/resetPoolDiagnostics.
export interface PoolDiagnostics {
  titleMismatches: number; // Last.fm tracks with no iTunes title match
  skippedForMinTrackCount: number; // artists skipped: trackCountInCatalog < deepCutMinTrackCount
  lookupFailures: number; // artists where the Last.fm or iTunes call itself failed
  starvedEvents: number; // times the primary ArtistBand ran out before a request was satisfied
}
let diagnostics: PoolDiagnostics = { titleMismatches: 0, skippedForMinTrackCount: 0, lookupFailures: 0, starvedEvents: 0 };
export function resetPoolDiagnostics(): void {
  diagnostics = { titleMismatches: 0, skippedForMinTrackCount: 0, lookupFailures: 0, starvedEvents: 0 };
}
export function getPoolDiagnostics(): PoolDiagnostics {
  return { ...diagnostics };
}

const PRESET_ARTIST_BAND: Record<Exclude<PresetId, 'M'>, ArtistBand> = { A: 'obscure', B: 'popular', C: 'popular', D: 'obscure' };
const PRESET_SONG_BAND: Record<Exclude<PresetId, 'M'>, SongBand> = { A: 'hit', B: 'deepcut', C: 'hit', D: 'deepcut' };

function otherBand(band: ArtistBand): ArtistBand {
  return band === 'obscure' ? 'popular' : 'obscure';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeArtist(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Strips parenthetical suffixes ("(Remastered 2011)") and trailing
// " - X" qualifiers (live/remaster/mono/stereo/deluxe/edit/version/...)
// before the alphanumeric collapse — without this, the same song's studio
// and live cuts never match as "the same track" across Last.fm's ranking
// and iTunes's catalog, which is exactly the discard case the original
// spec called out by name.
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*-\s*(live|remaster(ed)?(\s*\d{4})?|mono|stereo|deluxe|radio edit|single version|album version|explicit|clean|bonus track|edit|version)\b.*$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

// ---------- Strict serial pacing, one queue per service ----------
//
// Last.fm and iTunes have independent rate limits, so they get independent
// queues — a slow iTunes call never makes a Last.fm call wait, and vice
// versa. Within a single queue, calls stay strictly serial: each schedules
// after the previous one's slot, waiting delayMs since the last call
// started (not the literal first call — no delay before a queue's first
// use). A failed call doesn't stall whatever's queued behind it in the
// same queue.

function makePacer(delayMs: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  let started = false;

  return function paced<T>(fn: () => Promise<T>): Promise<T> {
    const scheduled = tail.then(async () => {
      if (started) await sleep(delayMs);
      started = true;
      return fn();
    });
    tail = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
  };
}

const pacedLastFm = makePacer(lastfmDelayMs);
const pacedItunes = makePacer(itunesDelayMs);

// ---------- Networking: bounded retries, not indefinite — this is live/user-facing, unlike the seed scripts ----------

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const TRANSIENT_LASTFM_ERROR_CODES = new Set([11, 16, 29]); // same set scripts/seed-genres.ts verified live — see that file's comment

interface LastFmErrorResponse {
  error: number;
  message: string;
}
function isLastFmError(body: unknown): body is LastFmErrorResponse {
  return typeof body === 'object' && body !== null && 'error' in body;
}

async function fetchWithBackoff(url: URL): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        if (attempt === MAX_RETRIES) throw new Error(`blocked after ${MAX_RETRIES} retries: ${res.status}`);
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      const body = (await res.json()) as unknown;
      if (isLastFmError(body)) {
        if (TRANSIENT_LASTFM_ERROR_CODES.has(body.error) && attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new Error(`Last.fm error ${body.error}: ${body.message}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------- Last.fm / iTunes calls ----------

interface LastFmTrack {
  name: string;
  playcount?: string;
  '@attr'?: { rank?: string };
}
interface LastFmTopTracksResponse {
  toptracks?: { track?: LastFmTrack | LastFmTrack[] };
}

interface RankedTrack {
  title: string;
  rank: number;
  playcount: number | null;
}

async function fetchTopTracks(artistName: string): Promise<RankedTrack[]> {
  const apiKey = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_LASTFM_API_KEY is not set');
  const url = new URL(LASTFM_API_ROOT);
  url.searchParams.set('method', 'artist.getTopTracks');
  url.searchParams.set('artist', artistName);
  url.searchParams.set('autocorrect', '1');
  url.searchParams.set('limit', '200');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');

  const body = (await pacedLastFm(() => fetchWithBackoff(url))) as LastFmTopTracksResponse;
  const raw = body.toptracks?.track;
  // Last.fm's own quirk: a single object (not a 1-element array) when the
  // artist has exactly one ranked track.
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((t, i) => ({
    title: t.name,
    rank: Number(t['@attr']?.rank ?? i + 1),
    playcount: t.playcount != null ? Number(t.playcount) : null,
  }));
}

interface ItunesLookupTrack {
  wrapperType?: string;
  trackId?: number;
  trackName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  collectionName?: string;
}
interface ItunesLookupResponse {
  results: ItunesLookupTrack[];
}

interface ItunesEntry {
  title: string;
  previewUrl: string | null;
  itunesTrackId: number;
  artworkUrl: string | null;
  album: string | null;
}

async function fetchItunesCatalog(itunesArtistId: number): Promise<ItunesEntry[]> {
  const url = new URL(ITUNES_LOOKUP_ROOT);
  url.searchParams.set('id', String(itunesArtistId));
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '200');

  const body = (await pacedItunes(() => fetchWithBackoff(url))) as ItunesLookupResponse;
  return (body.results ?? [])
    .filter((r): r is ItunesLookupTrack & { trackId: number; trackName: string } => r.wrapperType === 'track' && !!r.trackId && !!r.trackName)
    .map((r) => ({
      title: r.trackName,
      previewUrl: r.previewUrl ?? null,
      itunesTrackId: r.trackId,
      artworkUrl: r.artworkUrl100 ?? null,
      album: r.collectionName ?? null,
    }));
}

// ---------- Local title intersection ----------

interface IntersectedCandidate {
  title: string;
  rank: number;
  playcount: number | null;
  previewUrl: string | null;
  itunesTrackId: number;
  artworkUrl: string | null;
  album: string | null;
}

/**
 * Normalizing collapses studio/live/remaster variants onto the same key —
 * a real collision, not a bug to avoid. Tie-break: previewUrl first (a
 * match with no playable audio is useless regardless of which title it
 * is), then the SHORTER original title (a live/remaster cut's title is
 * almost always longer than the studio version's, and a live cut is a
 * worse representative of a deep cut than the studio version would be).
 */
function buildItunesTitleIndex(catalog: ItunesEntry[]): Map<string, ItunesEntry> {
  const index = new Map<string, ItunesEntry>();
  for (const entry of catalog) {
    const key = normalizeTitle(entry.title);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing) {
      index.set(key, entry);
      continue;
    }
    const existingHasPreview = !!existing.previewUrl;
    const candidateHasPreview = !!entry.previewUrl;
    if (candidateHasPreview && !existingHasPreview) {
      index.set(key, entry);
    } else if (candidateHasPreview === existingHasPreview && entry.title.length < existing.title.length) {
      index.set(key, entry);
    }
  }
  return index;
}

function intersectByTitle(rankedTracks: RankedTrack[], itunesCatalog: ItunesEntry[]): IntersectedCandidate[] {
  const index = buildItunesTitleIndex(itunesCatalog);
  const candidates: IntersectedCandidate[] = [];
  for (const rt of rankedTracks) {
    const key = normalizeTitle(rt.title);
    const match = key ? index.get(key) : undefined;
    if (!match) {
      diagnostics.titleMismatches++;
      continue; // discard — no iTunes title match
    }
    candidates.push({
      title: rt.title,
      rank: rt.rank,
      playcount: rt.playcount,
      previewUrl: match.previewUrl,
      itunesTrackId: match.itunesTrackId,
      artworkUrl: match.artworkUrl,
      album: match.album,
    });
  }
  return candidates;
}

// ---------- Per-artist session cache ----------

interface ArtistData {
  rankedTracks: RankedTrack[];
  itunesCatalog: ItunesEntry[];
}

// Session-only (never AsyncStorage — tiers are already baked into the
// seed). Caches failures too (as `null`), so a persistently-broken artist
// isn't re-queried every time it comes up again in the same session.
const artistDataCache = new Map<string, ArtistData | null>();

async function getOrFetchArtistData(artist: SeedArtistEntry): Promise<ArtistData | null> {
  const key = normalizeArtist(artist.name);
  if (artistDataCache.has(key)) return artistDataCache.get(key) ?? null;

  try {
    const rankedTracks = await fetchTopTracks(artist.name);
    if (rankedTracks.length === 0) {
      diagnostics.lookupFailures++;
      artistDataCache.set(key, null);
      return null;
    }
    if (artist.itunesArtistId === null) {
      // Defensive — eligibleArtists already filters this out, so this
      // shouldn't be reachable in practice.
      diagnostics.lookupFailures++;
      artistDataCache.set(key, null);
      return null;
    }
    const itunesCatalog = await fetchItunesCatalog(artist.itunesArtistId);
    const data: ArtistData = { rankedTracks, itunesCatalog };
    artistDataCache.set(key, data);
    return data;
  } catch {
    diagnostics.lookupFailures++;
    artistDataCache.set(key, null);
    return null;
  }
}

// ---------- Band selection + Track construction ----------

async function resolveOneTrack(artist: SeedArtistEntry, preset: PresetId, genreTag: string): Promise<Track | null> {
  const data = await getOrFetchArtistData(artist);
  if (!data) return null;

  const trackCountInCatalog = data.rankedTracks.length;
  const candidates = intersectByTitle(data.rankedTracks, data.itunesCatalog);

  let eligible: IntersectedCandidate[];
  if (preset === 'M') {
    eligible = candidates; // no rank filtering — genuinely mixed
  } else if (PRESET_SONG_BAND[preset] === 'hit') {
    eligible = candidates.filter((c) => c.rank <= hitRankMax);
  } else {
    if (trackCountInCatalog < deepCutMinTrackCount) {
      diagnostics.skippedForMinTrackCount++;
      return null; // too few tracks for "bottom 40%" to mean anything
    }
    const floorRank = trackCountInCatalog * deepCutRelativeFloor;
    eligible = candidates.filter((c) => c.rank > floorRank);
  }

  const playable = eligible.filter((c) => !!c.previewUrl);
  if (playable.length === 0) return null;

  const chosen = playable[Math.floor(Math.random() * playable.length)];
  const songBand: SongBand = chosen.rank <= hitRankMax ? 'hit' : 'deepcut'; // the track's actual classification, independent of why it was picked (matters for Mixed)

  return {
    id: `${normalizeArtist(artist.name)}::${normalizeTitle(chosen.title)}`,
    artist: artist.name,
    title: chosen.title,
    album: chosen.album,
    artworkUrl: chosen.artworkUrl,
    previewUrl: chosen.previewUrl!,
    source: {
      preset,
      genreTag,
      artistListeners: artist.listeners,
      artistPlaycount: artist.playcount,
      artistBand: artist.band,
      trackRank: chosen.rank,
      trackCountInCatalog,
      trackPlaycount: chosen.playcount,
      songBand,
      itunesTrackId: chosen.itunesTrackId,
      itunesArtistId: artist.itunesArtistId!,
    },
  };
}

// ---------- Artist iteration, with C7's widen-on-starvation fallback ----------

function eligibleArtists(genreTag: string, band: ArtistBand | null, excludeNormalized: Set<string>, usedThisCall: Set<string>): SeedArtistEntry[] {
  const pool = genresSeed[genreTag] ?? [];
  return shuffle(
    pool.filter(
      (a) =>
        (band === null || a.band === band) &&
        a.itunesArtistId !== null &&
        !excludeNormalized.has(normalizeArtist(a.name)) &&
        !usedThisCall.has(normalizeArtist(a.name))
    )
  );
}

export interface CollectResult {
  tracks: Track[];
  starved: boolean; // true if even the widened pool couldn't satisfy `count`
}

/**
 * Exported for scripts/test-pool.ts — the core selection logic
 * (getTracks() is this plus the leftover-cache/quick-fill split around
 * it). The harness calls this directly with count=deckSize so it measures
 * "how long to fill one full deck" against the real selection logic, not
 * the quick-fill-then-background-top-up UX behavior on top of it. The app
 * itself never calls this directly — always through getTracks().
 */
export async function collectTracks(
  preset: PresetId,
  genreTag: string,
  excludeArtists: Set<string>,
  usedThisCall: Set<string>,
  count: number
): Promise<CollectResult> {
  if (count <= 0) return { tracks: [], starved: false };

  const excludeNormalized = new Set([...excludeArtists].map(normalizeArtist));
  const primaryBand = preset === 'M' ? null : PRESET_ARTIST_BAND[preset];
  const tracks: Track[] = [];

  async function tryPool(pool: SeedArtistEntry[]): Promise<boolean> {
    for (const artist of pool) {
      if (tracks.length >= count) return false; // filled — pool not exhausted
      const key = normalizeArtist(artist.name);
      if (usedThisCall.has(key)) continue;
      usedThisCall.add(key);
      const track = await resolveOneTrack(artist, preset, genreTag);
      if (track) tracks.push(track);
    }
    return tracks.length < count; // true = ran out of artists before filling
  }

  const primaryExhausted = await tryPool(eligibleArtists(genreTag, primaryBand, excludeNormalized, usedThisCall));

  let starved = tracks.length < count;
  if (primaryExhausted && primaryBand !== null) {
    diagnostics.starvedEvents++;
    console.warn(
      `[pool_starved] preset=${preset} genre=${genreTag} — '${primaryBand}' band exhausted at ${tracks.length}/${count}, widening to '${otherBand(primaryBand)}'`
    );
    await tryPool(eligibleArtists(genreTag, otherBand(primaryBand), excludeNormalized, usedThisCall));
    starved = tracks.length < count;
    if (starved) {
      console.warn(`[pool_starved] preset=${preset} genre=${genreTag} — still short after widening: ${tracks.length}/${count}`);
    }
  } else if (starved) {
    diagnostics.starvedEvents++;
    // Mixed (no band to widen into), or a non-widened shortfall.
    console.warn(`[pool_starved] preset=${preset} genre=${genreTag} — short: ${tracks.length}/${count}, no band left to widen into`);
  }

  return { tracks, starved };
}

// ---------- Leftover cache: what makes returning early ≠ wasting the rest ----------

function cacheKey(preset: PresetId, genreTag: string): string {
  return `${preset}::${genreTag}`;
}

const leftoverCache = new Map<string, Track[]>();
const inFlightTopUps = new Set<string>();

function pruneExcluded(key: string, excludeArtists: Set<string>): Track[] {
  const excludeNormalized = new Set([...excludeArtists].map(normalizeArtist));
  const cached = (leftoverCache.get(key) ?? []).filter((t) => !excludeNormalized.has(normalizeArtist(t.artist)));
  leftoverCache.set(key, cached);
  return cached;
}

function backgroundTopUp(preset: PresetId, genreTag: string, excludeArtists: Set<string>): void {
  const key = cacheKey(preset, genreTag);
  if (inFlightTopUps.has(key)) return;
  inFlightTopUps.add(key);
  (async () => {
    try {
      const cached = leftoverCache.get(key) ?? [];
      const needed = deckSize - cached.length;
      if (needed <= 0) return;
      const usedThisCall = new Set(cached.map((t) => normalizeArtist(t.artist)));
      const { tracks } = await collectTracks(preset, genreTag, excludeArtists, usedThisCall, needed);
      const merged = [...(leftoverCache.get(key) ?? []), ...tracks];
      leftoverCache.set(key, merged);
    } catch {
      // Best-effort — the next getTracks() call for this key just tries again from whatever's cached.
    } finally {
      inFlightTopUps.delete(key);
    }
  })();
}

// ---------- Public API ----------

export async function getTracks(preset: PresetId, genreTag: string, excludeArtists: Set<string>): Promise<Track[]> {
  const key = cacheKey(preset, genreTag);
  const cached = pruneExcluded(key, excludeArtists);

  if (cached.length >= poolQuickFillSize) {
    const toReturn = cached.slice(0, poolQuickFillSize);
    leftoverCache.set(key, cached.slice(poolQuickFillSize));
    if ((leftoverCache.get(key) ?? []).length < poolQuickFillSize) {
      backgroundTopUp(preset, genreTag, excludeArtists);
    }
    return toReturn;
  }

  const usedThisCall = new Set(cached.map((t) => normalizeArtist(t.artist)));
  const { tracks: fresh } = await collectTracks(preset, genreTag, excludeArtists, usedThisCall, poolQuickFillSize - cached.length);

  const combined = [...cached, ...fresh];
  const toReturn = combined.slice(0, poolQuickFillSize);
  leftoverCache.set(key, combined.slice(poolQuickFillSize));

  if (toReturn.length > 0) {
    // Got enough (or the pool's true size) for a quick return — keep
    // filling toward deckSize in the background, not awaited here.
    backgroundTopUp(preset, genreTag, excludeArtists);
  }

  return toReturn;
}

/**
 * Bridges a pool Track into the shape lib/discovery.ts's SwipeCard/CardStack
 * already render — Phase 2 reuses those components rather than building a
 * parallel card tree, so every Track has to look like a DiscoveryTrack by
 * the time it reaches the queue. trackViewUrl has no pool equivalent and
 * falls back to the same "unknown" value lib/discovery.ts's own
 * toDiscoveryTrack already uses for missing iTunes data.
 */
export function trackToDiscoveryTrack(track: Track): DiscoveryTrack {
  return {
    id: track.source.itunesTrackId,
    trackName: track.title,
    artistId: track.source.itunesArtistId,
    artistName: track.artist,
    artworkUrl100: track.artworkUrl ?? '',
    primaryGenreName: track.source.genreTag,
    previewUrl: track.previewUrl,
    trackViewUrl: '',
    collectionId: undefined,
    collectionName: track.album,
    placeholderColor: track.artworkUrl ? undefined : PLACEHOLDER_COLORS[track.source.preset],
  };
}

// Deliberately distinct from the swipe-zone tint colors (red/green) and the
// purple accent — a card's own identity color should never be mistaken for
// a skip/like affordance or a "this is selected" signal. Mixed gets the
// least saturated of the five since it's the neutral baseline, not another
// flavor. Kept even in the real implementation — a genuine iTunes-sourced
// Track can still lack artwork (rare, but real), not just the old stub.
const PLACEHOLDER_COLORS: Record<PresetId, string> = {
  M: '#475569',
  A: '#b45309',
  B: '#0e7490',
  C: '#be185d',
  D: '#44403c',
};
