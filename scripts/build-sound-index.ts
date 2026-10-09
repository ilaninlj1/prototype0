// Builds assets/sound-index.json: BPM, key, mode and 8 other measures for every
// song in assets/catalogs/, matched without touching any audio. Title + artist →
// Deezer search (free, no key, plain query) → ISRC → ReccoBeats audio-features
// (?ids=ISRC,ISRC,…). Progress goes to scripts/.sound-index-raw.json, so a stopped
// run continues where it left off. Stops by itself after --minutes (default 50).
//
//   npm run build-sound-index                  continue, then write the index
//   npm run build-sound-index -- --minutes 5   a short run
//   npm run build-sound-index -- --write-only  just rewrite the index from the raw file

import fs from 'node:fs';
import path from 'node:path';

import { featuresByIsrc, deezerQuery, pickDeezerMatch, type DeezerHit } from '../lib/sound-match.ts';
import { INDEX_FIELDS, toIndexRow, type SoundFeatures } from '../lib/sound.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOGS = path.join(ROOT, 'assets/catalogs');
const RAW = path.join(ROOT, 'scripts/.sound-index-raw.json');
const OUT = path.join(ROOT, 'assets/sound-index.json');
const DEEZER_GAP_MS = 250; // 4 a second
const RECCO_GAP_MS = 1_000;
const RECCO_BATCH = 20;
const TIMEOUT_MS = 30_000;

/** itunesTrackId → 'nomatch' | { isrc } (matched, features pending) | { isrc, f } | { isrc, f: null } (no features) */
type RawEntry = 'nomatch' | { isrc: string; f?: SoundFeatures | null };
type Raw = Record<string, RawEntry>;
type Entry = { title: string; itunesTrackId: number };
type Catalog = Record<string, { hits: Entry[]; deepCuts: Entry[]; mixed?: Entry[] }>;
type Song = Entry & { artist: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readRaw = (): Raw => (fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {});
const writeRaw = (raw: Raw) => fs.writeFileSync(RAW, JSON.stringify(raw));

async function pause(ms: number, deadline: number): Promise<boolean> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return false;
  if (ms > 0) await sleep(Math.min(ms, remaining));
  return Date.now() < deadline;
}

function readCatalogs() {
  const songs = new Map<string, Song>();
  const genres = new Map<string, Set<string>>();
  for (const file of fs.readdirSync(CATALOGS).filter((f) => f.endsWith('.json')).sort()) {
    const catalog: Catalog = JSON.parse(fs.readFileSync(path.join(CATALOGS, file), 'utf8'));
    const ids = new Set<string>();
    for (const [artist, { hits, deepCuts }] of Object.entries(catalog)) {
      for (const entry of [...hits, ...deepCuts]) {
        const id = String(entry.itunesTrackId);
        ids.add(id);
        if (!songs.has(id)) songs.set(id, { ...entry, artist });
      }
    }
    genres.set(path.basename(file, '.json'), ids);
  }
  return { songs, genres };
}

async function matchSongs(songs: Map<string, Song>, raw: Raw, deadline: number) {
  const todo = [...songs].filter(([id]) => !(id in raw));
  console.log(`Deezer: ${todo.length} ids to look up.`);
  let calls = 0;
  for (const [id, { title, artist }] of todo) {
    if (!await pause(calls ? DEEZER_GAP_MS : 0, deadline)) break;
    calls++;
    try {
      const res = await fetch(`https://api.deezer.com/search?limit=10&q=${encodeURIComponent(deezerQuery(title, artist))}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 200) {
        console.log(`Deezer: ${id} answered ${res.status}; left for the next run.`);
      } else {
        const json: { data?: DeezerHit[] } = await res.json();
        const match = pickDeezerMatch(title, artist, json.data ?? []);
        raw[id] = match?.isrc ? { isrc: match.isrc } : 'nomatch';
      }
    } catch (error) {
      console.log(`Deezer: ${id} failed; left for the next run. ${String(error)}`);
    }
    if (calls % 25 === 0) {
      writeRaw(raw);
      console.log(`Deezer: ${calls}/${todo.length} lookups attempted.`);
    }
  }
  writeRaw(raw);
}

async function fetchFeatures(isrcs: string[], deadline: number): Promise<Map<string, SoundFeatures> | null> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${isrcs.join(',')}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) {
        const header = res.headers.get('Retry-After');
        const seconds = header?.trim() ? Number(header) : 60;
        const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 60_000;
        console.log(`ReccoBeats: rate limited; retrying this batch in ${Math.max(RECCO_GAP_MS, delay) / 1_000}s if time remains.`);
        if (!await pause(Math.max(RECCO_GAP_MS, delay), deadline)) return null;
        continue;
      }
      if (res.status !== 200) {
        console.log(`ReccoBeats: batch answered ${res.status}; left for the next run.`);
        return null;
      }
      const json: { content?: unknown[] } = await res.json();
      return featuresByIsrc(json.content ?? []);
    } catch (error) {
      console.log(`ReccoBeats: batch failed; left for the next run. ${String(error)}`);
      return null;
    }
  }
  return null;
}

async function measureSongs(raw: Raw, deadline: number) {
  const pending = Object.values(raw).filter((entry): entry is Exclude<RawEntry, 'nomatch'> =>
    entry !== 'nomatch' && entry.f === undefined);
  console.log(`ReccoBeats: ${pending.length} ids waiting for features.`);
  for (let i = 0; i < pending.length; i += RECCO_BATCH) {
    if (!await pause(i ? RECCO_GAP_MS : 0, deadline)) break;
    const batch = pending.slice(i, i + RECCO_BATCH);
    const isrcs = [...new Set(batch.map((entry) => entry.isrc.toUpperCase()))];
    const features = await fetchFeatures(isrcs, deadline);
    if (features !== null) {
      for (const entry of batch) entry.f = features.get(entry.isrc.toUpperCase()) ?? null;
    }
    writeRaw(raw);
    console.log(`ReccoBeats: ${i + batch.length}/${pending.length} feature lookups attempted.`);
  }
}

function writeIndex(raw: Raw, songs: Map<string, Song>, genres: Map<string, Set<string>>) {
  const indexed: Record<string, number[]> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (entry !== 'nomatch' && entry.f) indexed[id] = toIndexRow(entry.f);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    v: 1, builtAt: new Date().toISOString(), fields: INDEX_FIELDS, songs: indexed,
  }));
  const ids = [...songs.keys()];
  const matched = ids.filter((id) => raw[id] && raw[id] !== 'nomatch').length;
  const measured = ids.filter((id) => id in indexed).length;
  console.log(`Coverage: ${ids.length} total ids, ${matched} matched, ${measured} with features.`);
  for (const [genre, genreIds] of genres) {
    const count = [...genreIds].filter((id) => id in indexed).length;
    console.log(`${genre}: ${count} / ${genreIds.size} with features`);
  }
  console.log(`Wrote assets/sound-index.json: ${Object.keys(indexed).length} songs.`);
}

async function main() {
  const at = process.argv.indexOf('--minutes');
  const minutes = at > 0 ? Number(process.argv[at + 1]) : 50;
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('--minutes must be a finite, non-negative number.');
  const deadline = Date.now() + minutes * 60_000;
  const writeOnly = process.argv.includes('--write-only');
  const { songs, genres } = readCatalogs();
  const raw = readRaw();
  try {
    if (!writeOnly) {
      // Measure what's already matched first, so every time-boxed run adds features to the index.
      await measureSongs(raw, deadline);
      await matchSongs(songs, raw, deadline);
      await measureSongs(raw, deadline);
      if (Date.now() >= deadline) console.log('Time limit reached; pending lookups will continue next run.');
    }
  } finally {
    if (!writeOnly) writeRaw(raw);
    writeIndex(raw, songs, genres);
  }
}

main().catch((error) => {
  console.log(`Build failed: ${String(error)}`);
  process.exitCode = 1;
});
