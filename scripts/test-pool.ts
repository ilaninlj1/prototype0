// Phase 1 test harness — runs lib/pool.ts's real getTracks() logic
// (via the exported collectTracks, count=deckSize, bypassing the
// quick-fill/background-cache split so this measures one full deck fill)
// against real Last.fm/iTunes calls, for every preset across a
// representative sample of genres. Reports exactly what the original spec
// asked for before any UI existed: cards returned, the title-mismatch
// discard rate, artists skipped for deepCutMinTrackCount, artist-list
// exhaustion (the C7 widen-on-starvation signal), and wall-clock time.
//
// Genre sample is deliberately scoped, not all 37 — this makes real,
// paced (lastfmDelayMs / itunesDelayMs between each service's own calls)
// network calls, and running the full genre list would take hours. Picked
// to span the cases Phase 0
// already found interesting: Pop (huge, healthy, absolute banding), Metal
// (mid-size), Salsa and Cumbia (popularTopPercentile fallback, thin
// popular band), Amapiano (thinnest genre overall, obscure fallback too).
//
// NOT shipped in the app.
//
// Run: node --experimental-strip-types --env-file=.env.local scripts/test-pool.ts
// (or `npm run test-pool`) — needs EXPO_PUBLIC_LASTFM_API_KEY.

import { collectTracks, getPoolDiagnostics, resetPoolDiagnostics } from '../lib/pool.ts';
import { deckSize } from '../lib/pool-config.ts';
import type { PresetId } from '../lib/pool-types.ts';

const PRESETS: PresetId[] = ['M', 'A', 'B', 'C', 'D'];
const GENRES = ['Pop', 'Metal', 'Salsa', 'Cumbia', 'Amapiano'];

interface Row {
  genre: string;
  preset: PresetId;
  cardsReturned: number;
  target: number;
  starved: boolean;
  titleMismatches: number;
  skippedForMinTrackCount: number;
  lookupFailures: number;
  starvedEvents: number;
  wallClockMs: number;
}

async function main(): Promise<void> {
  if (!process.env.EXPO_PUBLIC_LASTFM_API_KEY) {
    console.error('EXPO_PUBLIC_LASTFM_API_KEY is not set.');
    process.exitCode = 1;
    return;
  }

  const rows: Row[] = [];
  const overallStart = Date.now();

  for (const genre of GENRES) {
    for (const preset of PRESETS) {
      resetPoolDiagnostics();
      const start = Date.now();
      const { tracks, starved } = await collectTracks(preset, genre, new Set(), new Set(), deckSize);
      const wallClockMs = Date.now() - start;
      const diag = getPoolDiagnostics();

      const row: Row = {
        genre,
        preset,
        cardsReturned: tracks.length,
        target: deckSize,
        starved,
        titleMismatches: diag.titleMismatches,
        skippedForMinTrackCount: diag.skippedForMinTrackCount,
        lookupFailures: diag.lookupFailures,
        starvedEvents: diag.starvedEvents,
        wallClockMs,
      };
      rows.push(row);
      console.log(
        `[${new Date().toISOString()}] ${genre}/${preset}: ${tracks.length}/${deckSize} cards in ${(wallClockMs / 1000).toFixed(1)}s` +
          (starved ? ' — STARVED' : '')
      );
    }
  }

  console.log(`\nTotal wall-clock for the whole harness: ${((Date.now() - overallStart) / 1000 / 60).toFixed(1)} minutes\n`);
  console.log('--- Per genre/preset ---\n');
  console.table(rows);

  console.log('\n--- Per-preset summary, across all tested genres ---\n');
  const byPreset = PRESETS.map((preset) => {
    const presetRows = rows.filter((r) => r.preset === preset);
    const totalCards = presetRows.reduce((s, r) => s + r.cardsReturned, 0);
    const totalTarget = presetRows.reduce((s, r) => s + r.target, 0);
    const totalMismatches = presetRows.reduce((s, r) => s + r.titleMismatches, 0);
    const totalSkipped = presetRows.reduce((s, r) => s + r.skippedForMinTrackCount, 0);
    const totalLookupFailures = presetRows.reduce((s, r) => s + r.lookupFailures, 0);
    const genresStarved = presetRows.filter((r) => r.starved).length;
    const avgWallClockS = presetRows.reduce((s, r) => s + r.wallClockMs, 0) / presetRows.length / 1000;
    return {
      preset,
      cardsReturned: `${totalCards}/${totalTarget}`,
      titleMismatches: totalMismatches,
      skippedForMinTrackCount: totalSkipped,
      lookupFailures: totalLookupFailures,
      genresStarved: `${genresStarved}/${presetRows.length}`,
      avgWallClockS: avgWallClockS.toFixed(1),
    };
  });
  console.table(byPreset);
}

main();
