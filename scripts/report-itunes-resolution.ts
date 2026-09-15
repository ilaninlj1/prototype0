// Read-only report over assets/genres-raw.json's iTunes resolution progress
// (written by scripts/resolve-itunes-ids.ts). Safe to run at any time,
// including while resolve-itunes-ids.ts is running in the background —
// this never writes anything. This is the actual floor-check now: bucketed
// resolution rate by real listener count, over however much of the
// population has been attempted so far (n grows toward 15,418 as the
// resolver progresses; check the "attempted" count below before reading
// too much into an early run's numbers).
//
// NOT shipped in the app.
//
// Run: node --experimental-strip-types scripts/report-itunes-resolution.ts
// (or `npm run report-itunes-resolution`)

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { artistObscureMinListeners } from '../lib/pool-config.ts';
import type { ResolvedArtist } from './seed-genres.ts';

const RAW_PATH = path.resolve(import.meta.dirname, '../assets/genres-raw.json');

const BUCKET_EDGES: [number, number][] = [
  [0, 1_000],
  [1_000, 10_000],
  [10_000, artistObscureMinListeners],
  [artistObscureMinListeners, Infinity],
];
const BUCKET_LABELS = ['<1K', '1K-10K', `10K-${artistObscureMinListeners / 1000}K`, `${artistObscureMinListeners / 1000}K+`];

type RawGenreFile = Record<string, ResolvedArtist[]>;

async function main(): Promise<void> {
  const raw: RawGenreFile = JSON.parse(await readFile(RAW_PATH, 'utf8'));

  // Dedupe by name for reporting too — the same artist shouldn't count
  // twice just because it appears in two genres' lists.
  const byName = new Map<string, ResolvedArtist>();
  for (const artists of Object.values(raw)) {
    for (const a of artists) {
      const key = a.name.toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, a);
    }
  }
  const all = [...byName.values()];
  const attempted = all.filter((a) => a.itunesArtistId !== undefined);

  console.log(`${attempted.length}/${all.length} distinct artists attempted so far.\n`);

  if (attempted.length === 0) {
    console.log('Nothing to report yet.');
    return;
  }

  console.log('--- Resolution rate by listener bucket ---\n');
  const bucketRows = BUCKET_LABELS.map((label, i) => {
    const [min, max] = BUCKET_EDGES[i];
    const rs = attempted.filter((a) => a.listeners >= min && a.listeners < max);
    const resolved = rs.filter((a) => a.itunesArtistId !== null).length;
    return {
      bucket: label,
      n: rs.length,
      resolved,
      rate: rs.length ? `${((resolved / rs.length) * 100).toFixed(0)}%` : 'n/a',
    };
  });
  console.table(bucketRows);

  console.log('\n--- How resolved matches were found, overall ---\n');
  const vias: NonNullable<ResolvedArtist['itunesResolvedVia']>[] = [
    'musicArtist-full',
    'musicArtist-split',
    'songSearch-full',
    'songSearch-split',
    'none',
  ];
  const viaRows = vias.map((via) => ({
    resolvedVia: via,
    count: attempted.filter((a) => a.itunesResolvedVia === via).length,
  }));
  console.table(viaRows);

  const splitShare = viaRows.filter((r) => r.resolvedVia.includes('split')).reduce((sum, r) => sum + r.count, 0);
  const resolvedTotal = attempted.filter((a) => a.itunesArtistId !== null).length;
  if (resolvedTotal > 0) {
    console.log(
      `\nSplit-retry (musicArtist-split + songSearch-split) accounts for ${splitShare}/${resolvedTotal} (${((splitShare / resolvedTotal) * 100).toFixed(0)}%) of resolved matches.`
    );
  }

  console.log('\n--- Same, by priority genre (Salsa/Cumbia/Gospel/Bossa Nova) ---\n');
  const priorityGenres = ['Salsa', 'Cumbia', 'Gospel', 'Bossa Nova'];
  const genreRows: { genre: string; attempted: number; resolved: number; rate: string }[] = [];
  for (const genre of priorityGenres) {
    const artists = (raw[genre] ?? []).filter((a) => a.itunesArtistId !== undefined);
    const resolved = artists.filter((a) => a.itunesArtistId !== null).length;
    if (artists.length > 0) {
      genreRows.push({ genre, attempted: artists.length, resolved, rate: `${((resolved / artists.length) * 100).toFixed(0)}%` });
    }
  }
  console.table(genreRows);
}

main();
