// One-time (re-runnable) scan: which built-in artists do Last.fm listeners or
// MusicBrainz editors tag as AI? Writes assets/ai-artists.json, which the app
// uses to keep them out of discovery unless the listener turns AI music on.
//
//   npm run scan-ai-artists            (~30 min for ~6,000 artists; resumable)

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAiTagged, normalizeArtist } from '../lib/human-check.ts';

const KEY = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
if (!KEY) throw new Error('EXPO_PUBLIC_LASTFM_API_KEY missing from .env.local');
const OUT = new URL('../assets/ai-artists.json', import.meta.url);
const PROGRESS = new URL('../.superpowers/ai-scan-progress.json', import.meta.url);
const UA = 'Blindspot/0.1 (student class project)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Found = { name: string; source: 'lastfm' | 'musicbrainz'; tags: string[] };

// Every artist the app ships with: the genre pool and the per-genre catalogs.
const names = new Map<string, string | null>(); // name → mbid
const genres = JSON.parse(readFileSync(new URL('../assets/genres.json', import.meta.url), 'utf8')) as Record<string, { name: string; mbid?: string }[]>;
for (const list of Object.values(genres)) for (const a of list) names.set(a.name, a.mbid ?? null);
const catalogDir = new URL('../assets/catalogs/', import.meta.url);
for (const f of readdirSync(catalogDir)) {
  for (const n of Object.keys(JSON.parse(readFileSync(new URL(f, catalogDir), 'utf8')))) if (!names.has(n)) names.set(n, null);
}
console.log(`${names.size} built-in artists`);

// 1. MusicBrainz: every artist editors have tagged as AI (a few paged searches, not one per artist).
const mbTagged = new Map<string, string[]>();
for (const tag of ['ai', 'ai generated', 'ai-generated', 'ai slop', 'artificial intelligence', 'suno']) {
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist?query=tag:%22${encodeURIComponent(tag)}%22&limit=100&offset=${offset}&fmt=json`, {
      headers: { 'User-Agent': UA },
    });
    await sleep(1100);
    if (!res.ok) break;
    const body = (await res.json()) as { artists?: { id: string; name: string; tags?: { name: string }[] }[] };
    const page = body.artists ?? [];
    for (const a of page) {
      const tags = (a.tags ?? []).map((t) => t.name);
      if (isAiTagged(tags, a.name)) mbTagged.set(a.id, tags);
    }
    if (page.length < 100) break;
  }
}
console.log(`MusicBrainz: ${mbTagged.size} artists tagged AI worldwide`);

// 2. Last.fm: each built-in artist's top tags (resumable — progress is saved as it goes).
const progress: Record<string, string[]> = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
let done = 0;
for (const name of names.keys()) {
  done++;
  if (progress[name]) continue;
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(name)}&api_key=${KEY}&format=json`
    );
    const body = (await res.json()) as { toptags?: { tag?: { name: string; count: number }[] } };
    // Only tags with real weight: one stray vote shouldn't hide an artist.
    progress[name] = (body.toptags?.tag ?? []).filter((t) => t.count >= 5).slice(0, 15).map((t) => t.name);
  } catch {
    progress[name] = [];
  }
  if (done % 100 === 0) {
    writeFileSync(PROGRESS, JSON.stringify(progress));
    console.log(`${done}/${names.size}`);
  }
  await sleep(220);
}
writeFileSync(PROGRESS, JSON.stringify(progress));

const found: Found[] = [];
for (const [name, mbid] of names) {
  if (mbid && mbTagged.has(mbid)) found.push({ name, source: 'musicbrainz', tags: mbTagged.get(mbid)! });
  else if (isAiTagged(progress[name] ?? [], name)) found.push({ name, source: 'lastfm', tags: progress[name] });
}
writeFileSync(
  OUT,
  JSON.stringify(
    { scannedAt: new Date().toISOString().slice(0, 10), checked: names.size, artists: found.map((f) => ({ ...f, key: normalizeArtist(f.name) })) },
    null,
    2
  ) + '\n'
);
console.log(`\n${found.length} of ${names.size} built-in artists are tagged AI:`);
for (const f of found) console.log(`  ${f.name}  [${f.source}: ${f.tags.slice(0, 5).join(', ')}]`);
