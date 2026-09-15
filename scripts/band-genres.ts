// Phase 0, step 2 of 2 — reads assets/genres-raw.json (written by
// seed-genres.ts) and applies banding. No network calls — safe to re-run
// as many times as needed while tuning lib/pool-config.ts's thresholds.
//
// Banding rule (revised 2026-09-14 — see lib/pool-config.ts for the
// reasoning behind each number):
//
// 1. OBSCURE claims its band FIRST: absolute threshold
//    (artistObscureMinListeners..artistObscureMaxListeners); if that comes
//    up short of percentileFallbackMinBandSize, fall back to the bottom N
//    (by listeners, still respecting the floor) of the genre's own resolved
//    population. Obscure goes first because it's the constrained side — it
//    has a floor, popular doesn't — and Preset A (the shipped default)
//    draws from it. Giving popular first pick previously starved Amapiano's
//    obscure band to zero (its whole above-floor population was only 18
//    artists, and a popular-first top-40 swallowed all of them).
//
// 2. POPULAR is always genre-relative: the top popularTopPercentile of
//    whatever's left after obscure's claim, ranked by listeners, no
//    absolute floor of its own. artistPopularMinListeners (1M) is no longer
//    a selection gate — a flat global number failed for 26 of 37 genres,
//    which means the number was wrong, not that a fallback was needed. It's
//    kept only as a sanity-ceiling diagnostic below (how many of a genre's
//    popular artists also clear it).
//
// An artist can never land in both bands — popular's pool explicitly
// excludes whoever obscure already claimed.
//
// NOT shipped in the app.
//
// Run: node --experimental-strip-types scripts/band-genres.ts
// (or `npm run band-genres`) — no API key needed.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  artistPopularMinListeners,
  popularTopPercentile,
  artistObscureMaxListeners,
  artistObscureMinListeners,
  percentileFallbackMinBandSize,
} from '../lib/pool-config.ts';
import type { ArtistBand } from '../lib/pool-types.ts';
import type { ResolvedArtist } from './seed-genres.ts';

const RAW_INPUT_PATH = path.resolve(import.meta.dirname, '../assets/genres-raw.json');
const SEED_OUTPUT_PATH = path.resolve(import.meta.dirname, '../assets/genres.json');

type RawGenreFile = Record<string, ResolvedArtist[]>;

export interface SeedArtist extends ResolvedArtist {
  band: ArtistBand;
}

type GenreSeedFile = Record<string, SeedArtist[]>;

interface GenreBandSummary {
  tag: string;
  resolvedTotal: number;
  obscure: number;
  obscureFallback: boolean;
  popular: number;
  popularAboveCeiling: number; // of `popular`, how many also clear artistPopularMinListeners (diagnostic only)
  excludedMiddle: number;
  excludedTooObscure: number;
}

/** Obscure and popular selections, always ordered so every obscure listener count <= every popular one. */
function selectBands(resolved: ResolvedArtist[]): { obscure: ResolvedArtist[]; obscureFallback: boolean; popular: ResolvedArtist[] } {
  const obscureAbsolute = resolved.filter(
    (a) => a.listeners >= artistObscureMinListeners && a.listeners <= artistObscureMaxListeners
  );

  if (obscureAbsolute.length >= percentileFallbackMinBandSize) {
    // Absolute succeeded: obscure is capped at artistObscureMaxListeners by
    // construction, so popular's percentile pick below can only land higher
    // — no ordering risk in this branch.
    // "Not obscure" alone isn't enough: obscureAbsolute is every artist in
    // [floor, ceiling] unconditionally, so "not obscure" here can only mean
    // above the ceiling or below the floor — nothing in between survives
    // exclusion. Without the explicit floor check, a genre with too few
    // above-ceiling artists to fill popularCount (Cumbia: 92 obscure, only
    // enough above 100K to partly fill it) silently spills into the
    // below-floor noise population once sorted-descending runs out of real
    // candidates — the same ordering bug as the fallback branch below, just
    // reachable from this one too. Found live, 2026-09-14: Cumbia's
    // 'popular' band included a 15,364-listener artist, under its own
    // obscure band's 99,530 max.
    const obscureNames = new Set(obscureAbsolute.map((a) => a.name));
    const eligibleForPopular = resolved
      .filter((a) => !obscureNames.has(a.name) && a.listeners >= artistObscureMinListeners)
      .sort((a, b) => b.listeners - a.listeners);
    const popularCount = Math.max(1, Math.round(eligibleForPopular.length * popularTopPercentile));
    return { obscure: obscureAbsolute, obscureFallback: false, popular: eligibleForPopular.slice(0, popularCount) };
  }

  // Absolute came up short: split the ENTIRE above-floor population at one
  // point instead of picking obscure and popular independently — top
  // popularTopPercentile goes to popular, everything else above the floor
  // (down to percentileFallbackMinBandSize, or fewer if the tier is
  // smaller) goes to obscure. This is the fix for a real bug found
  // 2026-09-14: independent "bottom N above floor" for obscure and "top
  // percentile of the leftover" for popular each looked reasonable alone,
  // but for a genre thin enough to need this branch (Amapiano: only 18
  // artists total clear the floor), obscure's independent pick swallowed
  // the genre's single biggest artist (1.59M listeners) while popular's
  // leftover pool had nothing left above the floor at all — popular ended
  // up LESS listened than obscure, backwards from what both bands are
  // supposed to mean. Splitting one sorted list at one boundary makes that
  // structurally impossible: whatever obscure gets is provably <= whatever
  // popular gets, for any population size.
  const aboveFloor = resolved.filter((a) => a.listeners >= artistObscureMinListeners).sort((a, b) => b.listeners - a.listeners);
  const popularCount = Math.max(1, Math.round(resolved.length * popularTopPercentile));
  const popular = aboveFloor.slice(0, popularCount);
  const obscure = aboveFloor
    .slice(popularCount)
    .sort((a, b) => a.listeners - b.listeners) // ascending — truly-most-obscure-first within what's left
    .slice(0, percentileFallbackMinBandSize);

  return { obscure, obscureFallback: true, popular };
}

function bandGenre(tag: string, resolved: ResolvedArtist[]): { artists: SeedArtist[]; summary: GenreBandSummary } {
  const { obscure, obscureFallback, popular } = selectBands(resolved);
  const obscureNames = new Set(obscure.map((a) => a.name));
  const popularNames = new Set(popular.map((a) => a.name));
  const popularAboveCeiling = popular.filter((a) => a.listeners >= artistPopularMinListeners).length;

  const excludedTooObscure = resolved.filter(
    (a) => a.listeners < artistObscureMinListeners && !obscureNames.has(a.name) && !popularNames.has(a.name)
  );
  const excludedMiddle = resolved.filter(
    (a) => a.listeners >= artistObscureMinListeners && !obscureNames.has(a.name) && !popularNames.has(a.name)
  );

  const artists: SeedArtist[] = [
    ...obscure.map((a) => ({ ...a, band: 'obscure' as const })),
    ...popular.map((a) => ({ ...a, band: 'popular' as const })),
  ];

  return {
    artists,
    summary: {
      tag,
      resolvedTotal: resolved.length,
      obscure: obscure.length,
      obscureFallback,
      popular: popular.length,
      popularAboveCeiling,
      excludedMiddle: excludedMiddle.length,
      excludedTooObscure: excludedTooObscure.length,
    },
  };
}

async function main(): Promise<void> {
  const raw: RawGenreFile = JSON.parse(await readFile(RAW_INPUT_PATH, 'utf8'));

  const seed: GenreSeedFile = {};
  const summaries: GenreBandSummary[] = [];

  for (const [tag, resolved] of Object.entries(raw)) {
    const { artists, summary } = bandGenre(tag, resolved);
    seed[tag] = artists;
    summaries.push(summary);
  }

  await writeFile(SEED_OUTPUT_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${SEED_OUTPUT_PATH}\n`);
  console.log(
    `Obscure: ${artistObscureMinListeners.toLocaleString()}-${artistObscureMaxListeners.toLocaleString()}, fallback trigger/size = ${percentileFallbackMinBandSize}. ` +
      `Popular: top ${(popularTopPercentile * 100).toFixed(0)}% of what's left, sanity ceiling = ${artistPopularMinListeners.toLocaleString()}.\n`
  );
  console.table(summaries);

  const obscureOnFallback = summaries.filter((s) => s.obscureFallback);
  console.log(
    obscureOnFallback.length > 0
      ? `\nObscure running on percentile fallback: ${obscureOnFallback.map((s) => s.tag).join(', ')}`
      : '\nNo genre needed the obscure fallback.'
  );

  const popularBelowCeiling = summaries.filter((s) => s.popularAboveCeiling < s.popular);
  if (popularBelowCeiling.length > 0) {
    console.log(
      `\nGenres whose 'popular' band is partly or entirely sub-1M-listener (genre-relative, not globally mega): ${popularBelowCeiling
        .map((s) => `${s.tag} (${s.popularAboveCeiling}/${s.popular} clear 1M)`)
        .join(', ')}`
    );
  }

  const zeroBand = summaries.filter((s) => s.obscure === 0 || s.popular === 0);
  if (zeroBand.length > 0) {
    console.warn(`\nSTILL ZERO in a band: ${zeroBand.map((s) => `${s.tag} (obscure=${s.obscure}, popular=${s.popular})`).join(', ')}`);
  } else {
    console.log('\nEvery genre has a non-zero band on both sides.');
  }

  const thinObscure = summaries.filter((s) => s.obscure > 0 && s.obscure < percentileFallbackMinBandSize);
  if (thinObscure.length > 0) {
    console.warn(
      `\nObscure below target size even after fallback (genre's above-floor population is smaller than ${percentileFallbackMinBandSize}): ${thinObscure
        .map((s) => `${s.tag} (${s.obscure})`)
        .join(', ')}`
    );
  }
}

main();
