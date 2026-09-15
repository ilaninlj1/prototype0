// Phase 0, step 1 of 2 — fetches and resolves every candidate artist for
// every genre, writes the FULL resolved population (no banding decision
// made here) to assets/genres-raw.json. Banding (absolute thresholds +
// percentile fallback) happens separately in scripts/band-genres.ts, which
// reads this file and makes no network calls — so tuning a threshold in
// lib/pool-config.ts never requires re-hitting Last.fm. This split exists
// specifically because thresholds got tuned iteratively (2026-09-14): the
// first version of this script fetched, resolved, AND banded in one pass,
// which meant every threshold change cost another ~15-minute run.
//
// NOT shipped in the app, same as band-genres.ts and check-obscure-floor.ts.
//
// Run:
//   node --experimental-strip-types --env-file=.env.local scripts/seed-genres.ts
// (or `npm run seed-genres`) with EXPO_PUBLIC_LASTFM_API_KEY set. Takes
// ~15 minutes for all 37 genres — this is the only slow step in Phase 0.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GENRES } from '../lib/taste-test.ts';
import { artistPopularMinListeners, artistObscureMaxListeners, artistObscureMinListeners } from '../lib/pool-config.ts';

// ---------- Config local to this script ----------

// Verified live against ws.audioscrobbler.com on 2026-09-14: tag.getTopArtists
// has no artificial depth cap — it honestly reports @attr.totalPages/@attr.total
// and returns [] past totalPages (not an error). The real constraint is each
// tag's own catalog depth: Boom Bap topped out at 24 pages / 958 artists total,
// Cumbia at 45 pages / 1780, Pop kept returning distinct real artists through
// page 1000 of 2366 (94,609 total). So these ranges are clamped per-genre
// against that genre's own totalPages — a shallow tag just contributes fewer
// pages than requested, which is itself diagnostic (see pagesAvailable below).
const PAGE_RANGES: [number, number][] = [
  [1, 3],
  [10, 12],
  [25, 27],
  [40, 42],
];
const ARTISTS_PER_PAGE = 40;
const PAGE_FETCH_CONCURRENCY = 3;
// Lowered from 4, and retries/backoff both raised below — verified live on
// 2026-09-14 that concurrency=4 sustained over multiple minutes (not the
// original 47s single-page burst) trips Last.fm's real rate limit. That
// arrives as HTTP 200 with a Last.fm error-code body (error 29), not HTTP
// 429 — see TRANSIENT_LASTFM_ERROR_CODES below, which is the actual fix;
// this concurrency drop just reduces how often it's needed.
const CONCURRENCY = 3; // artist.getInfo calls in flight at once, within one genre
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 800;

const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

const RAW_OUTPUT_PATH = path.resolve(import.meta.dirname, '../assets/genres-raw.json');

// ---------- Last.fm response shapes (only the fields this script reads) ----------

interface LastFmErrorResponse {
  error: number;
  message: string;
}

interface TagTopArtistsResponse {
  topartists?: {
    artist: { name: string; mbid?: string }[];
    '@attr': { tag: string; page: string; totalPages: string; total: string };
  };
}

interface ArtistGetInfoResponse {
  artist?: {
    name: string;
    mbid?: string;
    stats: { listeners: string; playcount: string };
  };
}

function isLastFmError(body: unknown): body is LastFmErrorResponse {
  return typeof body === 'object' && body !== null && 'error' in body;
}

// ---------- Raw (unbanded) resolved-artist schema ----------

export interface ResolvedArtist {
  name: string;
  mbid: string | null;
  listeners: number;
  playcount: number;
  // Lowest tag.getTopArtists page this artist was found on across the
  // sampled ranges — 1 means "would have been found even without deeper
  // paging".
  minPage: number;
  // Populated by scripts/resolve-itunes-ids.ts (a separate, later, resumable
  // pass — not part of this file's own fetch). Field ABSENT (undefined)
  // means "not yet attempted"; present with `null` means "attempted, not
  // found" — that distinction is what makes the resolver resumable across
  // restarts and hard blocks without re-querying names already given up on.
  // Once resolved, itunesArtistId lets Phase 1 skip the name-search step
  // entirely at runtime and go straight to `lookup?id=`, halving its
  // per-artist iTunes call count — the reason this pass exists ahead of
  // Phase 1 rather than after it.
  itunesArtistId?: number | null;
  itunesArtistName?: string | null;
  itunesResolvedVia?: 'musicArtist-full' | 'musicArtist-split' | 'songSearch-full' | 'songSearch-split' | 'none';
}

type RawGenreFile = Record<string, ResolvedArtist[]>;

// ---------- Networking: retry with backoff, small bounded concurrency ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// See the CONCURRENCY comment above: Last.fm signals its own rate limit as
// HTTP 200 with this error code in the JSON body, not HTTP 429. 11 ("Service
// Offline") and 16 ("temporarily unavailable") are Last.fm's own other
// explicitly-transient codes; everything else (6 = "not found", 10 = invalid
// key, etc.) is a real, resolved failure and must not be retried.
const TRANSIENT_LASTFM_ERROR_CODES = new Set([11, 16, 29]);

async function fetchJson<T>(url: URL): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        const retryAfterHeader = res.headers.get('retry-after');
        const delay = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : RETRY_BASE_DELAY_MS * 2 ** attempt;
        await sleep(delay);
        continue;
      }
      const body = (await res.json()) as unknown;
      if (isLastFmError(body)) {
        if (TRANSIENT_LASTFM_ERROR_CODES.has(body.error)) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new Error(`Last.fm error ${body.error}: ${body.message}`);
      }
      return body as T;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function lastFmUrl(params: Record<string, string>, apiKey: string): URL {
  const url = new URL(LASTFM_API_ROOT);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  return url;
}

/** Runs `items` through `worker` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

// ---------- Per-genre work ----------

type ResolveOutcome =
  | { status: 'resolved'; artist: ResolvedArtist }
  | { status: 'lookup-failed'; name: string; error: string };

async function resolveArtistStats(name: string, minPage: number, apiKey: string): Promise<ResolveOutcome> {
  try {
    const body = await fetchJson<ArtistGetInfoResponse>(
      lastFmUrl({ method: 'artist.getInfo', artist: name, autocorrect: '1' }, apiKey)
    );
    if (!body.artist) throw new Error('missing artist in response');

    const listeners = Number(body.artist.stats.listeners);
    const playcount = Number(body.artist.stats.playcount);
    if (!Number.isFinite(listeners) || !Number.isFinite(playcount)) {
      throw new Error(`non-numeric stats (listeners=${body.artist.stats.listeners})`);
    }

    return {
      status: 'resolved',
      artist: {
        name: body.artist.name, // Last.fm's resolved/autocorrected name, not the raw tag-list name
        mbid: body.artist.mbid || null,
        listeners,
        playcount,
        minPage,
      },
    };
  } catch (err) {
    return { status: 'lookup-failed', name, error: err instanceof Error ? err.message : String(err) };
  }
}

interface GenreFetchSummary {
  tag: string;
  tagTotalArtists: number;
  tagTotalPages: number;
  pagesRequested: number;
  pagesAvailable: number;
  fetched: number; // distinct artist names sampled across all fetched pages
  resolved: number;
  lookupFailed: number;
}

interface GenreFetchResult {
  resolved: ResolvedArtist[];
  summary: GenreFetchSummary;
}

async function fetchGenre(tag: string, apiKey: string): Promise<GenreFetchResult> {
  const first = await fetchJson<TagTopArtistsResponse>(
    lastFmUrl({ method: 'tag.getTopArtists', tag, limit: String(ARTISTS_PER_PAGE), page: '1' }, apiKey)
  );
  const attr = first.topartists?.['@attr'];
  const tagTotalPages = Number(attr?.totalPages ?? '0');
  const tagTotalArtists = Number(attr?.total ?? '0');

  const targetPages = new Set<number>();
  for (const [start, end] of PAGE_RANGES) {
    for (let p = start; p <= end; p++) {
      if (p <= tagTotalPages) targetPages.add(p);
    }
  }
  const pagesRequested = PAGE_RANGES.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
  targetPages.add(1);
  const remainingPages = [...targetPages].filter((p) => p !== 1);

  const remainingResponses = await mapWithConcurrency(remainingPages, PAGE_FETCH_CONCURRENCY, (page) =>
    fetchJson<TagTopArtistsResponse>(
      lastFmUrl({ method: 'tag.getTopArtists', tag, limit: String(ARTISTS_PER_PAGE), page: String(page) }, apiKey)
    )
  );

  const nameToMinPage = new Map<string, number>();
  for (const resp of [first, ...remainingResponses]) {
    const pageNum = Number(resp.topartists?.['@attr']?.page ?? '1');
    for (const a of resp.topartists?.artist ?? []) {
      const existing = nameToMinPage.get(a.name);
      if (existing === undefined || pageNum < existing) nameToMinPage.set(a.name, pageNum);
    }
  }

  const outcomes = await mapWithConcurrency(
    [...nameToMinPage.entries()],
    CONCURRENCY,
    ([name, minPage]) => resolveArtistStats(name, minPage, apiKey)
  );

  const resolved: ResolvedArtist[] = [];
  let lookupFailed = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'resolved') {
      resolved.push(outcome.artist);
    } else {
      lookupFailed++;
      console.warn(`  [${tag}] lookup failed for "${outcome.name}": ${outcome.error}`);
    }
  }

  return {
    resolved,
    summary: {
      tag,
      tagTotalArtists,
      tagTotalPages,
      pagesRequested,
      pagesAvailable: targetPages.size,
      fetched: nameToMinPage.size,
      resolved: resolved.length,
      lookupFailed,
    },
  };
}

// ---------- Listener-distribution stats (still useful pre-banding) ----------

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const HISTOGRAM_EDGES = [0, 1_000, 10_000, artistObscureMinListeners, artistObscureMaxListeners, artistPopularMinListeners, 10_000_000, 100_000_000, Infinity];
const HISTOGRAM_LABELS = [
  '<1K',
  '1K-10K',
  `10K-${artistObscureMinListeners / 1000}K`,
  `${artistObscureMinListeners / 1000}K-${artistObscureMaxListeners / 1000}K`,
  `${artistObscureMaxListeners / 1000}K-1M`,
  '1M-10M',
  '10M-100M',
  '100M+',
];

function printGenreDistribution(tag: string, listeners: number[]): void {
  if (listeners.length === 0) {
    console.log(`  ${tag}: no resolved artists, no distribution to show`);
    return;
  }
  const sorted = [...listeners].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const med = median(sorted);

  const counts = new Array(HISTOGRAM_LABELS.length).fill(0);
  for (const v of listeners) {
    for (let i = 0; i < HISTOGRAM_LABELS.length; i++) {
      if (v >= HISTOGRAM_EDGES[i] && v < HISTOGRAM_EDGES[i + 1]) {
        counts[i]++;
        break;
      }
    }
  }
  const maxCount = Math.max(...counts);

  console.log(`  ${tag} (n=${listeners.length}): min=${min.toLocaleString()} median=${med.toLocaleString()} max=${max.toLocaleString()}`);
  for (let i = 0; i < HISTOGRAM_LABELS.length; i++) {
    const barLen = maxCount > 0 ? Math.round((counts[i] / maxCount) * 30) : 0;
    console.log(`    ${HISTOGRAM_LABELS[i].padStart(10)} | ${'#'.repeat(barLen)} ${counts[i]}`);
  }
}

// ---------- Main ----------

async function main(): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  if (!apiKey) {
    console.error(
      'EXPO_PUBLIC_LASTFM_API_KEY is not set. Pass --env-file=.env.local or export it before running.'
    );
    process.exitCode = 1;
    return;
  }

  // Dev convenience for smoke-testing this script itself (e.g.
  // `SEED_GENRES_LIMIT=2 npm run seed-genres`) — never needed for a real
  // seed run, which always covers all of GENRES.
  const genresToSeed = process.env.SEED_GENRES_LIMIT
    ? GENRES.slice(0, Number(process.env.SEED_GENRES_LIMIT))
    : GENRES;

  const startedAt = Date.now();
  const raw: RawGenreFile = {};
  const summaries: GenreFetchSummary[] = [];

  for (const tag of genresToSeed) {
    console.log(`Fetching "${tag}"...`);
    try {
      const { resolved, summary } = await fetchGenre(tag, apiKey);
      raw[tag] = resolved;
      summaries.push(summary);
    } catch (err) {
      console.error(`  Failed to fetch "${tag}" entirely: ${err instanceof Error ? err.message : err}`);
      summaries.push({
        tag,
        tagTotalArtists: 0,
        tagTotalPages: 0,
        pagesRequested: 0,
        pagesAvailable: 0,
        fetched: 0,
        resolved: 0,
        lookupFailed: 0,
      });
    }
  }

  await writeFile(RAW_OUTPUT_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf8');

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nWrote ${RAW_OUTPUT_PATH} in ${elapsedSec}s\n`);
  console.table(summaries);

  console.log('\n--- Listener distribution per genre (min/median/max, histogram) ---\n');
  for (const tag of genresToSeed) {
    printGenreDistribution(tag, (raw[tag] ?? []).map((a) => a.listeners));
  }

  console.log('\nNext: `npm run band-genres` to apply thresholds (no network calls, instant, re-runnable) and write assets/genres.json.');
}

main();
