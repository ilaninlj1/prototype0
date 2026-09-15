// Phase 0 — resolves an iTunes artistId for the artists Phase 1 actually
// needs, offline, ahead of Phase 1. Reads BOTH assets/genres.json (for
// which artists are currently banded) and assets/genres-raw.json (the full
// population + where results get written back).
//
// Re-scoped 2026-09-14 from "resolve all 15,418 distinct artists" (~13
// hours minimum) to a priority queue, because only ~6,046 of those are ever
// useful right now:
//
//   Tier 1 — every artist in a band per the CURRENT assets/genres.json
//   (obscure first, then popular: ~4,546 total). This is what Phase 1
//   actually serves to a user. Order matters: obscure first because Preset
//   A (the shipped default) draws from it.
//
//   Tier 2 — a stratified, genre-spread sample of below-floor artists
//   (<20K listeners): up to 500 each from <1K, 1K-10K, 10K-20K (~1,500
//   total, out of 5,840 available). This is what answers the floor
//   question — a rate doesn't need all 5,840 points, and if the floor
//   drops later the rest can be resolved then.
//
//   Then STOP. excludedMiddle (~9,000 artists between the obscure ceiling
//   and wherever a genre's popular percentile lands) is resolved for
//   nothing right now and is skipped entirely.
//
// Global dedup (same artist appearing in multiple genres, resolved once,
// applied everywhere), resumability (skip anyone whose `itunesArtistId`
// field is already present), and indefinite-retry-with-backoff on a block
// are unchanged from before.
//
// Pacing: starts in a 100-call probation window at 1.5s (half the earlier
// 3s, which was picked defensively after two blocks with no real test of
// whether it was necessary). A block during probation permanently falls
// back to 3s for the rest of the run; a clean probation keeps 1.5s
// throughout. Reported at the point the probation resolves either way.
//
// Reports at both tier boundaries rather than only at the end — tier 1
// completing is the signal to run `npm run band-genres` and start Phase 1;
// tier 2 keeps going in the background after that.
//
// NOT shipped in the app.
//
// Run: node --experimental-strip-types scripts/resolve-itunes-ids.ts
// (or `npm run resolve-itunes-ids`). RESOLVE_LIMIT=N caps total artists
// processed this run, for smoke-testing.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { artistObscureMinListeners } from '../lib/pool-config.ts';
import type { ArtistBand } from '../lib/pool-types.ts';
import type { ResolvedArtist } from './seed-genres.ts';
import type { SeedArtist } from './band-genres.ts';

const RAW_PATH = path.resolve(import.meta.dirname, '../assets/genres-raw.json');
const SEED_PATH = path.resolve(import.meta.dirname, '../assets/genres.json');

const PROBATION_CALLS = 100;
const PROBATION_DELAY_MS = 1500;
const DEFAULT_DELAY_MS = 3000;
const BLOCK_BACKOFF_START_MS = 60_000;
const BLOCK_BACKOFF_MAX_MS = 300_000;

const TIER2_BUCKET_EDGES: [number, number][] = [
  [0, 1_000],
  [1_000, 10_000],
  [10_000, artistObscureMinListeners],
];
const TIER2_PER_BUCKET = 500;

type RawGenreFile = Record<string, ResolvedArtist[]>;
type SeedFile = Record<string, SeedArtist[]>;
type ResolvedVia = NonNullable<ResolvedArtist['itunesResolvedVia']>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeArtistName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

const SEPARATOR_REGEX = /\s+(?:&|feat\.?|ft\.?|x|y|con)\s+/i;

function splitOnSeparator(name: string): string | null {
  const parts = name.split(SEPARATOR_REGEX);
  return parts.length > 1 && parts[0].trim().length > 0 ? parts[0].trim() : null;
}

function systematicSample<T>(sorted: T[], count: number): T[] {
  if (sorted.length <= count) return sorted;
  const step = sorted.length / count;
  const result: T[] = [];
  for (let i = 0; i < count; i++) result.push(sorted[Math.floor(i * step)]);
  return result;
}

// ---------- Pacing: probation window, then either fast or defensive for the rest of the run ----------

let totalCalls = 0;
let probationBlocked = false;
let probationResolved = false;

function currentDelayMs(): number {
  return probationBlocked ? DEFAULT_DELAY_MS : PROBATION_DELAY_MS;
}

function noteProbationOutcome(): void {
  if (probationResolved || totalCalls < PROBATION_CALLS) return;
  probationResolved = true;
  console.log(
    probationBlocked
      ? `\nProbation: blocked within the first ${PROBATION_CALLS} calls at ${PROBATION_DELAY_MS}ms — falling back to ${DEFAULT_DELAY_MS}ms for the rest of this run.\n`
      : `\nProbation passed: ${PROBATION_CALLS} calls at ${PROBATION_DELAY_MS}ms, no blocks — keeping ${PROBATION_DELAY_MS}ms for the rest of this run.\n`
  );
}

// ---------- iTunes calls: indefinite retry on block, adaptive pacing on success ----------

let blockBackoffMs = BLOCK_BACKOFF_START_MS;

async function fetchItunes(url: URL): Promise<unknown> {
  for (;;) {
    try {
      const res = await fetch(url);
      totalCalls++;
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        if (totalCalls <= PROBATION_CALLS) probationBlocked = true;
        console.warn(`  blocked (${res.status}), backing off ${Math.round(blockBackoffMs / 1000)}s...`);
        await sleep(blockBackoffMs);
        blockBackoffMs = Math.min(blockBackoffMs * 1.5, BLOCK_BACKOFF_MAX_MS);
        continue;
      }
      blockBackoffMs = BLOCK_BACKOFF_START_MS;
      const body = await res.json();
      noteProbationOutcome();
      await sleep(currentDelayMs());
      return body;
    } catch (err) {
      totalCalls++;
      console.warn(`  fetch error, backing off ${Math.round(blockBackoffMs / 1000)}s: ${err instanceof Error ? err.message : err}`);
      await sleep(blockBackoffMs);
      blockBackoffMs = Math.min(blockBackoffMs * 1.5, BLOCK_BACKOFF_MAX_MS);
    }
  }
}

interface ArtistMatch {
  artistId: number;
  artistName: string;
}

async function searchMusicArtist(term: string): Promise<{ artistId?: number; artistName?: string }[]> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'musicArtist');
  url.searchParams.set('limit', '5');
  const body = (await fetchItunes(url)) as { results: { artistId?: number; artistName?: string }[] };
  return body.results;
}

function findExactArtistMatch(results: { artistId?: number; artistName?: string }[], target: string): ArtistMatch | null {
  const norm = normalizeArtistName(target);
  for (const r of results) {
    if (r.artistId && r.artistName && normalizeArtistName(r.artistName) === norm) {
      return { artistId: r.artistId, artistName: r.artistName };
    }
  }
  return null;
}

async function findViaSongSearch(term: string): Promise<ArtistMatch | null> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '25');
  const body = (await fetchItunes(url)) as { results: { artistId?: number; artistName?: string }[] };
  return findExactArtistMatch(body.results, term);
}

interface Resolution {
  itunesArtistId: number | null;
  itunesArtistName: string | null;
  itunesResolvedVia: ResolvedVia;
}

async function resolveArtistId(name: string): Promise<Resolution> {
  const splitName = splitOnSeparator(name);

  let match = findExactArtistMatch(await searchMusicArtist(name), name);
  if (match) return { itunesArtistId: match.artistId, itunesArtistName: match.artistName, itunesResolvedVia: 'musicArtist-full' };

  if (splitName) {
    match = findExactArtistMatch(await searchMusicArtist(splitName), splitName);
    if (match) return { itunesArtistId: match.artistId, itunesArtistName: match.artistName, itunesResolvedVia: 'musicArtist-split' };
  }

  match = await findViaSongSearch(name);
  if (match) return { itunesArtistId: match.artistId, itunesArtistName: match.artistName, itunesResolvedVia: 'songSearch-full' };

  if (splitName) {
    match = await findViaSongSearch(splitName);
    if (match) return { itunesArtistId: match.artistId, itunesArtistName: match.artistName, itunesResolvedVia: 'songSearch-split' };
  }

  return { itunesArtistId: null, itunesArtistName: null, itunesResolvedVia: 'none' };
}

// ---------- Priority queue construction ----------

interface QueueEntry {
  key: string; // normalized name
  tier: 'obscure' | 'popular' | 'belowFloor';
}

function buildQueue(seed: SeedFile, raw: RawGenreFile): QueueEntry[] {
  const bandByName = new Map<string, ArtistBand>();
  for (const artists of Object.values(seed)) {
    for (const a of artists) {
      const key = a.name.toLowerCase().trim();
      if (a.band === 'obscure') bandByName.set(key, 'obscure');
      else if (a.band === 'popular' && bandByName.get(key) !== 'obscure') bandByName.set(key, 'popular');
    }
  }

  const obscure: string[] = [];
  const popular: string[] = [];
  for (const [key, band] of bandByName) (band === 'obscure' ? obscure : popular).push(key);

  // Below-floor candidates, by genre, for tier 2's genre-spread sample —
  // only names with no band at all (obscure/popular already respect the
  // floor by construction, so there's no overlap to worry about).
  const belowFloorByGenre = new Map<string, { key: string; listeners: number }[]>();
  const seenBelowFloor = new Set<string>();
  for (const [genre, artists] of Object.entries(raw)) {
    for (const a of artists) {
      const key = a.name.toLowerCase().trim();
      if (bandByName.has(key) || seenBelowFloor.has(key) || a.listeners >= artistObscureMinListeners) continue;
      seenBelowFloor.add(key);
      if (!belowFloorByGenre.has(genre)) belowFloorByGenre.set(genre, []);
      belowFloorByGenre.get(genre)!.push({ key, listeners: a.listeners });
    }
  }

  const belowFloor: string[] = [];
  for (const [min, max] of TIER2_BUCKET_EDGES) {
    const byGenre = [...belowFloorByGenre.entries()].map(([genre, entries]) => {
      const inBucket = entries.filter((e) => e.listeners >= min && e.listeners < max).sort((a, b) => a.listeners - b.listeners);
      return { genre, queue: systematicSample(inBucket, Math.min(inBucket.length, TIER2_PER_BUCKET)) };
    });
    const pools = byGenre.filter((g) => g.queue.length > 0);
    let i = 0;
    const bucketSample: string[] = [];
    while (bucketSample.length < TIER2_PER_BUCKET && pools.some((g) => g.queue.length > 0)) {
      const g = pools[i % pools.length];
      const e = g.queue.shift();
      if (e) bucketSample.push(e.key);
      i++;
    }
    belowFloor.push(...bucketSample);
  }

  return [
    ...obscure.map((key): QueueEntry => ({ key, tier: 'obscure' })),
    ...popular.map((key): QueueEntry => ({ key, tier: 'popular' })),
    ...belowFloor.map((key): QueueEntry => ({ key, tier: 'belowFloor' })),
  ];
}

// ---------- Main ----------

async function main(): Promise<void> {
  const seed: SeedFile = JSON.parse(await readFile(SEED_PATH, 'utf8'));
  const raw: RawGenreFile = JSON.parse(await readFile(RAW_PATH, 'utf8'));

  const occurrences = new Map<string, { genre: string; index: number }[]>();
  const cache = new Map<string, Resolution>();
  for (const [genre, artists] of Object.entries(raw)) {
    artists.forEach((a, index) => {
      const key = a.name.toLowerCase().trim();
      if (!occurrences.has(key)) occurrences.set(key, []);
      occurrences.get(key)!.push({ genre, index });
      if (a.itunesArtistId !== undefined && !cache.has(key)) {
        cache.set(key, {
          itunesArtistId: a.itunesArtistId,
          itunesArtistName: a.itunesArtistName ?? null,
          itunesResolvedVia: a.itunesResolvedVia ?? 'none',
        });
      }
    });
  }

  const queue = buildQueue(seed, raw);
  const tier1Total = queue.filter((q) => q.tier === 'obscure' || q.tier === 'popular').length;
  const tier2Total = queue.filter((q) => q.tier === 'belowFloor').length;

  const toProcess = queue.filter((q) => !cache.has(q.key));
  const limit = process.env.RESOLVE_LIMIT ? Number(process.env.RESOLVE_LIMIT) : toProcess.length;
  const thisRun = toProcess.slice(0, limit);

  console.log(
    `Priority queue: tier 1 (banded) = ${tier1Total}, tier 2 (below-floor sample) = ${tier2Total}, total = ${queue.length}. ` +
      `${queue.length - toProcess.length} already resolved. ${thisRun.length} to process this run` +
      (limit < toProcess.length ? ` (RESOLVE_LIMIT=${limit})` : '') +
      `.\nEstimated minimum time: ${Math.round((thisRun.length * PROBATION_DELAY_MS) / 60_000)}-${Math.round((thisRun.length * DEFAULT_DELAY_MS) / 60_000)} minutes depending on pacing outcome.\n`
  );

  let tier1Done = tier1Total - queue.filter((q) => (q.tier === 'obscure' || q.tier === 'popular') && !cache.has(q.key)).length;
  let announcedTier1Complete = tier1Done >= tier1Total;

  let processed = 0;
  for (const entry of thisRun) {
    const firstOcc = occurrences.get(entry.key)![0];
    const displayName = raw[firstOcc.genre][firstOcc.index].name;

    const resolution = await resolveArtistId(displayName);
    cache.set(entry.key, resolution);

    for (const occ of occurrences.get(entry.key)!) {
      Object.assign(raw[occ.genre][occ.index], resolution);
    }
    await writeFile(RAW_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf8');

    if (entry.tier === 'obscure' || entry.tier === 'popular') tier1Done++;
    processed++;

    if (!announcedTier1Complete && tier1Done >= tier1Total) {
      announcedTier1Complete = true;
      console.log(
        `\n=== TIER 1 COMPLETE (${tier1Done}/${tier1Total} banded artists resolved) === run \`npm run band-genres\` now — tier 2 continues below.\n`
      );
    }

    if (processed % 25 === 0 || processed === thisRun.length) {
      const resolvedSoFar = [...cache.values()].filter((r) => r.itunesArtistId !== null).length;
      console.log(
        `[${new Date().toISOString()}] ${processed}/${thisRun.length} this run — ${resolvedSoFar}/${cache.size} resolved overall (delay=${currentDelayMs()}ms)`
      );
    }
  }

  console.log(
    tier1Done >= tier1Total && processed === thisRun.length
      ? '\n=== TIER 2 COMPLETE — priority queue exhausted. excludedMiddle was skipped entirely, as scoped. ==='
      : '\nDone with this run. Run again to continue if RESOLVE_LIMIT capped it.'
  );
}

main();
