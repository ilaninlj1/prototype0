// Adds releaseDate ("1978-03-23") to every song in assets/catalogs/ that lacks one, from
// iTunes lookups of 150 track ids at a time. Only missing dates are fetched, so a stopped
// run just picks up again; songs iTunes no longer lists stay without one.
//
//   npm run add-release-dates

import fs from 'node:fs';
import path from 'node:path';

import { releaseDay } from '../lib/song-age.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOGS = path.join(ROOT, 'assets/catalogs');
const BATCH = 150;
const GAP_MS = 3_500; // iTunes allows about 20 calls a minute
const BLOCKED_WAIT_MS = 60_000;
const TRIES = 5;
const TIMEOUT_MS = 30_000;

type Entry = { itunesTrackId: number; releaseDate?: string };
type Catalog = Record<string, { hits: Entry[]; deepCuts: Entry[]; mixed?: Entry[] }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const entriesOf = (catalog: Catalog) => Object.values(catalog).flatMap((a) => [...a.hits, ...a.deepCuts, ...(a.mixed ?? [])]);

async function lookup(ids: number[]): Promise<Map<number, string>> {
  const url = `https://itunes.apple.com/lookup?id=${ids.join(',')}`;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        const body = (await res.json()) as { results?: { wrapperType?: string; trackId?: number; releaseDate?: string }[] };
        const days = new Map<number, string>();
        for (const r of body.results ?? []) {
          const day = releaseDay(r.releaseDate);
          if (r.wrapperType === 'track' && r.trackId && day) days.set(r.trackId, day);
        }
        return days;
      }
      console.log(`  iTunes said ${res.status}; waiting a minute (try ${attempt}/${TRIES})`);
    } catch (e) {
      console.log(`  ${(e as Error).name}; waiting a minute (try ${attempt}/${TRIES})`);
    }
    await sleep(BLOCKED_WAIT_MS);
  }
  throw new Error('iTunes kept refusing; run it again later, it continues where it stopped');
}

async function main() {
  const files = fs.readdirSync(CATALOGS).filter((f) => f.endsWith('.json')).sort();
  const catalogs = new Map(files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(CATALOGS, f), 'utf8')) as Catalog]));
  const missing = [...new Set([...catalogs.values()].flatMap(entriesOf).filter((e) => !e.releaseDate).map((e) => e.itunesTrackId))];
  console.log(`${missing.length} songs need a date (${Math.ceil(missing.length / BATCH)} lookups)`);

  const days = new Map<number, string>();
  const save = () => {
    let filled = 0;
    for (const [file, catalog] of catalogs) {
      let changed = false;
      for (const e of entriesOf(catalog)) {
        const day = days.get(e.itunesTrackId);
        if (!e.releaseDate && day) {
          e.releaseDate = day;
          changed = true;
          filled++;
        }
      }
      if (changed) fs.writeFileSync(path.join(CATALOGS, file), JSON.stringify(catalog, null, 2) + '\n');
    }
    return filled;
  };

  try {
    for (let i = 0; i < missing.length; i += BATCH) {
      if (i > 0) await sleep(GAP_MS);
      for (const [id, day] of await lookup(missing.slice(i, i + BATCH))) days.set(id, day);
      console.log(`  ${Math.min(i + BATCH, missing.length)}/${missing.length} looked up, ${days.size} dated`);
    }
  } finally {
    // Whatever arrived is kept, even if iTunes cut the run short.
    console.log(`wrote ${save()} catalog entries; ${missing.length - days.size} songs had no date from iTunes`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
