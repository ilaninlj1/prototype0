// Builds assets/genre-sound.json: what each of the 37 genres normally sounds
// like, for Taste Decoded (docs/superpowers/specs/2026-10-02-taste-decoded-design.md).
// 30 songs per genre from the bundled catalogs (15 hits, 15 deep cuts), each
// 30s preview sent to ReccoBeats one at a time, 1.5s apart. Answers are saved to
// assets/genre-sound-raw.json as they arrive, so a stopped run (Ctrl-C, a 429)
// picks up where it left off. ~1,100 clips, about an hour and a half.
//
//   npm run measure-genre-sound                  measure what's missing, check, write the file
//   npm run measure-genre-sound -- --limit 2     first 2 genres only, no file written (a dry run)
//   npm run measure-genre-sound -- --from-index  rebuild from assets/sound-index.json instead (no uploads; use this one)

import fs from 'node:fs';
import path from 'node:path';

import { buildBaselines, catalogSlug, pickBaselineSongs, sanityProblems, seededRng, type Measured } from '../lib/genre-sound.ts';
import { fromIndexRow } from '../lib/sound.ts';
import { isFullyMeasured, MEASURES, parseSongFeel } from '../lib/taste-decoded.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'assets/genre-sound-raw.json');
const OUT = path.join(ROOT, 'assets/genre-sound.json');
const ANALYZE_URL = 'https://api.reccobeats.com/v1/analysis/audio-features';
const GAP_MS = 1_500;
const SEED = 20261002;

/** genre → previewUrl → its measurements, or 'failed' (not retried). */
type Raw = Record<string, Record<string, Measured | 'failed'>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readRaw = (): Raw => (fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {});
const writeRaw = (raw: Raw) => fs.writeFileSync(RAW, JSON.stringify(raw, null, 1) + '\n');

async function measure(previewUrl: string): Promise<Measured | 'failed' | 'limited'> {
  const clip = await fetch(previewUrl, { signal: AbortSignal.timeout(30_000) });
  if (!clip.ok) return 'failed';
  const body = new FormData();
  body.append('audioFile', new Blob([await clip.arrayBuffer()], { type: 'audio/mp4' }), 'preview.m4a');
  const res = await fetch(ANALYZE_URL, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) return 'limited';
  if (!res.ok) return 'failed';
  const feel = parseSongFeel(await res.json()) ?? undefined;
  if (!isFullyMeasured(feel)) return 'failed';
  return Object.fromEntries(MEASURES.map((m) => [m, feel[m]])) as Measured;
}

/**
 * --from-index: every catalog song with data in assets/sound-index.json (ReccoBeats catalog values, matched by
 * ISRC; nothing uploaded) instead of 30 uploaded previews per genre. Same checks, same file.
 */
function fromIndex() {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sound-index.json'), 'utf8')) as { songs: Record<string, unknown> };
  const genres = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/genres-raw.json'), 'utf8')));
  const byGenre: Record<string, Measured[]> = {};
  for (const genre of genres) {
    const file = path.join(ROOT, 'assets/catalogs', `${catalogSlug(genre)}.json`);
    if (!fs.existsSync(file)) throw new Error(`No catalog for ${genre} at ${file}`);
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { hits: { itunesTrackId: number }[]; deepCuts: { itunesTrackId: number }[] }>;
    const seen = new Set<number>();
    byGenre[genre] = [];
    for (const artist of Object.values(catalog))
      for (const e of [...artist.hits, ...artist.deepCuts]) {
        if (seen.has(e.itunesTrackId)) continue;
        seen.add(e.itunesTrackId);
        const f = fromIndexRow(index.songs[String(e.itunesTrackId)]);
        if (f) byGenre[genre].push(Object.fromEntries(MEASURES.map((m) => [m, f[m]])) as Measured);
      }
  }
  const baselines = buildBaselines(byGenre, new Date().toISOString().slice(0, 10));
  const left = genres.filter((g) => !baselines.genres[g]);
  if (left.length) console.log(`Left out (under 15 measured songs): ${left.join(', ')}`);
  const problems = sanityProblems(baselines);
  if (problems.length) {
    console.log(`Sanity check failed, file not written:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(baselines, null, 1) + '\n');
  console.log(`Wrote assets/genre-sound.json from the sound index: ${Object.keys(baselines.genres).length} genres, ${baselines.all.n} songs.`);
}

async function main() {
  if (process.argv.includes('--from-index')) return fromIndex();
  const at = process.argv.indexOf('--limit');
  const limit = at > 0 ? Number(process.argv[at + 1]) : null;
  const genres = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/genres-raw.json'), 'utf8')));
  const chosen = limit ? genres.slice(0, limit) : genres;
  const raw = readRaw();

  for (const genre of chosen) {
    const file = path.join(ROOT, 'assets/catalogs', `${catalogSlug(genre)}.json`);
    if (!fs.existsSync(file)) throw new Error(`No catalog for ${genre} at ${file}`);
    const songs = pickBaselineSongs(JSON.parse(fs.readFileSync(file, 'utf8')), seededRng(SEED));
    raw[genre] ??= {};
    const todo = songs.filter((s) => !(s.previewUrl in raw[genre]));
    console.log(`${genre}: ${songs.length - todo.length}/${songs.length} done, ${todo.length} to measure`);
    for (const s of todo) {
      let answer: Measured | 'failed' | 'limited';
      try {
        answer = await measure(s.previewUrl);
      } catch {
        answer = 'failed';
      }
      if (answer === 'limited') {
        writeRaw(raw);
        console.log('ReccoBeats answered 429 (too many requests). Stopped; run it again later to pick up here.');
        process.exit(1);
      }
      raw[genre][s.previewUrl] = answer;
      writeRaw(raw);
      await sleep(GAP_MS);
    }
  }

  const byGenre: Record<string, Measured[]> = {};
  for (const genre of chosen) byGenre[genre] = Object.values(raw[genre] ?? {}).filter((a): a is Measured => a !== 'failed');
  const baselines = buildBaselines(byGenre, new Date().toISOString().slice(0, 10));
  const left = chosen.filter((g) => !baselines.genres[g]);
  if (left.length) console.log(`Left out (under 15 measured songs): ${left.join(', ')}`);
  if (limit) {
    console.log(`Dry run: ${baselines.all.n} songs measured, assets/genre-sound.json not written.`);
    return;
  }
  const problems = sanityProblems(baselines);
  if (problems.length) {
    console.log(`Sanity check failed, file not written:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(baselines, null, 1) + '\n');
  console.log(`Wrote assets/genre-sound.json: ${Object.keys(baselines.genres).length} genres, ${baselines.all.n} songs.`);
}

main();
