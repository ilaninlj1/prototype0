// Phase 1.5 — precomputes each scoped artist's hits/deepCuts/mixed at seed
// time, so lib/pool.ts's catalog fast path (lib/pool.ts's CATALOG_LOADERS)
// can read a static per-genre JSON file instead of making two live network
// calls (Last.fm getTopTracks + iTunes lookup) per artist on every deck
// fill. That live path is why first-card latency was ~9s post-pacer-split;
// this script is what gets it to ~0 network calls at runtime for the
// scoped genres — lib/pool.ts falls back to the live path for anything
// outside this script's scope (genre or artist).
//
// Reuses lib/pool.ts's real selection logic directly — normalizeTitle,
// buildItunesTitleIndex, intersectByTitle, fetchTopTracks,
// fetchItunesCatalog, resetPoolDiagnostics/getPoolDiagnostics — all newly
// exported from there for this script, none reimplemented here. What this
// script stores for each artist is exactly what lib/pool.ts's own
// resolveOneTrack would have selected from at runtime for presets A/C
// ('hit': rank <= hitRankMax) and B/D ('deepcut': rank above
// trackCountInCatalog * deepCutRelativeFloor, skipped entirely if
// trackCountInCatalog < deepCutMinTrackCount) — just computed once now
// instead of on every deck fill.
//
// Per artist: up to 3 hits (hitRankMax already caps eligibility at rank
// <=3, so 3 is a defensive cap more than a real constraint), up to 5
// deepCuts, and up to 5 mixed — all filtered to `previewUrl` present (a
// candidate with no playable audio is useless regardless of rank).
// hits is sorted by rank ascending; deepCuts and mixed use
// systematicSample — the same evenly-spaced sampling
// scripts/resolve-itunes-ids.ts already uses for its tier-2 bucket sample
// — rather than "first N by rank": deepCuts spreads across its eligible
// (post-floor) range instead of clustering just above the floor, and mixed
// spreads across the artist's WHOLE ranked range (not hits ∪ deepCuts) so
// lib/pool.ts's preset 'M' — "no band filtering, draws from a genre's
// whole population" — stays genuinely unnarrowed on a catalog-covered
// artist. All three are picked deterministically (no randomness), so the
// same artist produces the same output whenever it's (re)processed —
// useful given resumability below. rankedTrackCount (the artist's full
// Last.fm-ranked count) is stored alongside them — lib/pool.ts's Track.
// source.trackCountInCatalog and its own deepCutMinTrackCount check both
// need it, and it isn't recoverable from deepCuts.length alone (already
// post-filtered to playable tracks).
//
// Scope: all 37 curated genres, up to 40 artists each (20 obscure + 20
// popular, both by listeners descending — the healthiest artists in each
// band first). Widened 2026-09-17 from a first-run 12-genre scope (see
// git history) once that run's yield came back healthy across every
// genre it covered. A thin genre's band (Salsa's popular=5 resolved,
// Cumbia's popular=2, Amapiano's obscure=6, etc.) simply yields fewer than
// 40 artists — see scopedArtists below — rather than being excluded
// outright the way the first run's narrower scope did.
//
// Resumability: per genre, an artist already present as a key in that
// genre's output file (assets/catalogs/<slug>.json) is skipped — including
// artists that legitimately yielded {hits: [], deepCuts: [], mixed: []},
// which is still a complete, correct result and must not be re-fetched.
// The output file is rewritten after every single artist (not batched per genre), so
// an interrupted run loses at most one in-flight artist.
//
// Retries — deliberately NOT scripts/resolve-itunes-ids.ts's literal
// "retry the same call forever": that pattern is safe there specifically
// because iTunes search never throws for a real "not found", only for
// actual blocks (429/403/5xx) — retrying forever only ever waits out a
// transient rate-limit, never a permanent case. This script's Last.fm call
// (via lib/pool.ts's fetchTopTracks) CAN throw immediately for a genuine
// non-transient Last.fm error (an artist name Last.fm just doesn't
// recognize, none of the TRANSIENT_LASTFM_ERROR_CODES) — an infinite retry
// on that would hang the whole run forever on one bad artist. So retries
// here are bounded but generous per artist (MAX_ARTIST_ATTEMPTS = 5, same
// 60s-start/×1.5/300s-cap backoff resolve-itunes-ids.ts uses for its own
// blocks) — plenty for a transient block, not infinite. An artist that
// still fails after that is simply left out of the output (not written as
// an empty result — empty-but-successful and failed-to-fetch are different
// things) and is naturally retried whenever this script is run again.
//
// NOT shipped in the app.
//
// Run: node --experimental-strip-types --env-file=.env.local scripts/precompute-catalogs.ts
// (or `npm run precompute-catalogs`). PRECOMPUTE_LIMIT=N caps total
// artists processed this run (across genres, in SCOPED_GENRES order), for
// smoke-testing before committing to a full run.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepCutMinTrackCount, deepCutRelativeFloor, hitRankMax, itunesDelayMs } from '../lib/pool-config.ts';
import {
  fetchItunesCatalog,
  fetchTopTracks,
  getPoolDiagnostics,
  intersectByTitle,
  resetPoolDiagnostics,
  type IntersectedCandidate,
} from '../lib/pool.ts';
import type { ArtistCatalog, CatalogEntry, GenreCatalogFile, SeedArtistEntry } from '../lib/pool-types.ts';

const SEED_PATH = path.resolve(import.meta.dirname, '../assets/genres.json');
const OUTPUT_DIR = path.resolve(import.meta.dirname, '../assets/catalogs');

// All 37 curated genres (assets/genres.json's full key set) as of
// 2026-09-17 — widened from the original 12-genre first-run scope (see git
// history for that list and the ranking rationale that picked it) once
// that run's per-genre yield came back healthy across the board. A thin
// genre (Salsa's popular band, Amapiano's obscure band, etc.) simply
// yields fewer than ARTISTS_PER_BAND*2 — scopedArtists' .slice() already
// returns whatever's available rather than erroring, so no special-casing
// is needed to include them here.
const SCOPED_GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'Country',
  'Jazz',
  'Classical',
  'Electronic',
  'R&B',
  'Reggae',
  'Metal',
  'House',
  'Deep House',
  'Tech House',
  'Techno',
  'Dubstep',
  'Drum and Bass',
  'Disco',
  'Funk',
  'Soul',
  'Reggaeton',
  'Afrobeats',
  'Amapiano',
  'Bossa Nova',
  'Salsa',
  'Bachata',
  'Cumbia',
  'K-Pop',
  'Shoegaze',
  'Punk',
  'Grunge',
  'Indie Rock',
  'Bedroom Pop',
  'Lo-Fi',
  'Ambient',
  'Gospel',
  'Drill',
  'Boom Bap',
];

const ARTISTS_PER_BAND = 20; // → up to 40 artists/genre (20 obscure + 20 popular)
const HITS_MAX = 3;
const DEEPCUTS_MAX = 5;
const MIXED_MAX = 5;
const MAX_ARTIST_ATTEMPTS = 5;
const BLOCK_BACKOFF_START_MS = 60_000;
const BLOCK_BACKOFF_MAX_MS = 300_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same evenly-spaced sampling as scripts/resolve-itunes-ids.ts's own
// systematicSample — mirrored here (tiny, generic, not itself pool-steering
// domain logic) rather than exported, since that file exports nothing.
function systematicSample<T>(sorted: T[], count: number): T[] {
  if (sorted.length <= count) return sorted;
  const step = sorted.length / count;
  const result: T[] = [];
  for (let i = 0; i < count; i++) result.push(sorted[Math.floor(i * step)]);
  return result;
}

function slugifyGenre(genre: string): string {
  return genre
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toCatalogEntry(c: IntersectedCandidate): CatalogEntry {
  return {
    title: c.title,
    rank: c.rank,
    playcount: c.playcount,
    previewUrl: c.previewUrl!, // caller has already filtered for a truthy previewUrl
    itunesTrackId: c.itunesTrackId,
    artworkUrl: c.artworkUrl,
    album: c.album,
  };
}

// ---------- Per-artist: fetch + the SAME selection logic lib/pool.ts uses ----------

interface ArtistOutcome {
  catalog: ArtistCatalog | null; // null = failed after MAX_ARTIST_ATTEMPTS — left out, retried on a later run
  rankedTrackCount: number;
  titleMismatches: number;
}

async function processArtist(artist: SeedArtistEntry): Promise<ArtistOutcome> {
  let backoffMs = BLOCK_BACKOFF_START_MS;

  for (let attempt = 1; attempt <= MAX_ARTIST_ATTEMPTS; attempt++) {
    try {
      resetPoolDiagnostics();
      const rankedTracks = await fetchTopTracks(artist.name);
      const itunesCatalog = await fetchItunesCatalog(artist.itunesArtistId!);
      const candidates = intersectByTitle(rankedTracks, itunesCatalog);
      const titleMismatches = getPoolDiagnostics().titleMismatches;

      const hits = candidates
        .filter((c) => c.rank <= hitRankMax && !!c.previewUrl)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, HITS_MAX)
        .map(toCatalogEntry);

      let deepCuts: CatalogEntry[] = [];
      if (rankedTracks.length >= deepCutMinTrackCount) {
        const floorRank = rankedTracks.length * deepCutRelativeFloor;
        const eligible = candidates.filter((c) => c.rank > floorRank && !!c.previewUrl).sort((a, b) => a.rank - b.rank);
        deepCuts = systematicSample(eligible, Math.min(eligible.length, DEEPCUTS_MAX)).map(toCatalogEntry);
      }

      // Unlike hits/deepCuts, mixed draws from the artist's WHOLE ranked
      // range, evenly spread (systematicSample, not "first N") — this is
      // what keeps preset 'M' a genuine "no band filtering" baseline
      // against a catalog-covered artist instead of silently narrowing it
      // to hits ∪ deepCuts. Same fetches already made above; no extra
      // network cost.
      const allPlayable = candidates.filter((c) => !!c.previewUrl).sort((a, b) => a.rank - b.rank);
      const mixed = systematicSample(allPlayable, Math.min(allPlayable.length, MIXED_MAX)).map(toCatalogEntry);

      return { catalog: { hits, deepCuts, mixed, rankedTrackCount: rankedTracks.length }, rankedTrackCount: rankedTracks.length, titleMismatches };
    } catch (err) {
      if (attempt === MAX_ARTIST_ATTEMPTS) {
        console.warn(`  giving up on "${artist.name}" after ${MAX_ARTIST_ATTEMPTS} attempts: ${err instanceof Error ? err.message : err}`);
        return { catalog: null, rankedTrackCount: 0, titleMismatches: 0 };
      }
      console.warn(
        `  "${artist.name}" failed (attempt ${attempt}/${MAX_ARTIST_ATTEMPTS}), backing off ${Math.round(backoffMs / 1000)}s: ${err instanceof Error ? err.message : err}`
      );
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 1.5, BLOCK_BACKOFF_MAX_MS);
    }
  }
  // Unreachable — every path through the loop above returns.
  return { catalog: null, rankedTrackCount: 0, titleMismatches: 0 };
}

// ---------- Scope selection ----------

function scopedArtists(genre: string, seed: Record<string, SeedArtistEntry[]>): SeedArtistEntry[] {
  const all = seed[genre] ?? [];
  const byListenersDesc = (a: SeedArtistEntry, b: SeedArtistEntry) => b.listeners - a.listeners;
  const obscure = all
    .filter((a) => a.band === 'obscure' && a.itunesArtistId !== null)
    .sort(byListenersDesc)
    .slice(0, ARTISTS_PER_BAND);
  const popular = all
    .filter((a) => a.band === 'popular' && a.itunesArtistId !== null)
    .sort(byListenersDesc)
    .slice(0, ARTISTS_PER_BAND);
  return [...obscure, ...popular];
}

// ---------- Main ----------

interface GenrePlan {
  genre: string;
  outputPath: string;
  existing: GenreCatalogFile;
  scoped: SeedArtistEntry[];
  toProcess: SeedArtistEntry[];
}

interface GenreSummary {
  genre: string;
  scoped: number;
  alreadyDone: number;
  processedThisRun: number;
  failures: number;
  hitsYield: number;
  deepCutsYield: number;
  artistsWithNoHits: number;
  artistsWithNoDeepCuts: number;
  titleMismatchRate: string;
}

async function main(): Promise<void> {
  if (!process.env.EXPO_PUBLIC_LASTFM_API_KEY) {
    console.error('EXPO_PUBLIC_LASTFM_API_KEY is not set.');
    process.exitCode = 1;
    return;
  }

  const seedRaw = JSON.parse(await readFile(SEED_PATH, 'utf8'));
  const seed = seedRaw as unknown as Record<string, SeedArtistEntry[]>;

  await mkdir(OUTPUT_DIR, { recursive: true });

  const plans: GenrePlan[] = [];
  for (const genre of SCOPED_GENRES) {
    const outputPath = path.join(OUTPUT_DIR, `${slugifyGenre(genre)}.json`);
    let existing: GenreCatalogFile = {};
    try {
      existing = JSON.parse(await readFile(outputPath, 'utf8'));
    } catch {
      // No file yet for this genre — starting fresh.
    }
    const scoped = scopedArtists(genre, seed);
    const toProcess = scoped.filter((a) => !(a.name in existing));
    plans.push({ genre, outputPath, existing, scoped, toProcess });
  }

  const totalToProcess = plans.reduce((sum, p) => sum + p.toProcess.length, 0);
  const limit = process.env.PRECOMPUTE_LIMIT ? Number(process.env.PRECOMPUTE_LIMIT) : totalToProcess;
  const thisRunTotal = Math.min(totalToProcess, limit);

  console.log(
    `Scope: ${SCOPED_GENRES.length} genres × up to ${ARTISTS_PER_BAND * 2} artists = up to ${SCOPED_GENRES.length * ARTISTS_PER_BAND * 2} total. ` +
      `${totalToProcess} artists to process, ${thisRunTotal} this run` +
      (limit < totalToProcess ? ` (PRECOMPUTE_LIMIT=${limit})` : '') +
      `.\nEstimated minimum time: ~${Math.round((thisRunTotal * itunesDelayMs) / 60_000)} minutes (iTunes pacing dominates; excludes any block backoff).\n`
  );

  const summaries: GenreSummary[] = [];
  let processedOverall = 0;

  for (const plan of plans) {
    if (processedOverall >= limit) {
      summaries.push({
        genre: plan.genre,
        scoped: plan.scoped.length,
        alreadyDone: plan.scoped.length - plan.toProcess.length,
        processedThisRun: 0,
        failures: 0,
        hitsYield: 0,
        deepCutsYield: 0,
        artistsWithNoHits: 0,
        artistsWithNoDeepCuts: 0,
        titleMismatchRate: 'n/a (capped before this genre)',
      });
      continue;
    }

    console.log(`\n=== ${plan.genre}: ${plan.scoped.length} scoped, ${plan.scoped.length - plan.toProcess.length} already done, ${plan.toProcess.length} to process ===`);

    let hitsYield = 0;
    let deepCutsYield = 0;
    let artistsWithNoHits = 0;
    let artistsWithNoDeepCuts = 0;
    let failures = 0;
    let totalRankedTracks = 0;
    let totalTitleMismatches = 0;
    let doneThisGenre = 0;

    for (const artist of plan.toProcess) {
      if (processedOverall >= limit) break;

      const outcome = await processArtist(artist);
      processedOverall++;
      doneThisGenre++;

      if (outcome.catalog) {
        plan.existing[artist.name] = outcome.catalog;
        await writeFile(plan.outputPath, JSON.stringify(plan.existing, null, 2) + '\n', 'utf8');
        hitsYield += outcome.catalog.hits.length;
        deepCutsYield += outcome.catalog.deepCuts.length;
        if (outcome.catalog.hits.length === 0) artistsWithNoHits++;
        if (outcome.catalog.deepCuts.length === 0) artistsWithNoDeepCuts++;
        totalRankedTracks += outcome.rankedTrackCount;
        totalTitleMismatches += outcome.titleMismatches;
      } else {
        failures++;
      }

      if (doneThisGenre % 10 === 0 || doneThisGenre === plan.toProcess.length) {
        console.log(`[${new Date().toISOString()}] ${plan.genre}: ${doneThisGenre}/${plan.toProcess.length} this run (${processedOverall}/${thisRunTotal} overall)`);
      }
    }

    summaries.push({
      genre: plan.genre,
      scoped: plan.scoped.length,
      alreadyDone: plan.scoped.length - plan.toProcess.length,
      processedThisRun: doneThisGenre,
      failures,
      hitsYield,
      deepCutsYield,
      artistsWithNoHits,
      artistsWithNoDeepCuts,
      titleMismatchRate: totalRankedTracks > 0 ? `${((totalTitleMismatches / totalRankedTracks) * 100).toFixed(1)}%` : 'n/a',
    });
  }

  console.log('\n--- Per-genre summary (this run) ---\n');
  console.table(summaries);
}

main();
