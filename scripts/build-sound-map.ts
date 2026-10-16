// Builds assets/sound-map.json, the Dark Map: every song in assets/sound-index.json laid out by how it sounds
// (UMAP over eight standardized measures, seeded, so the same index always gives the same map), cut into regions
// with plain-word names. Dev only: umap-js is a devDependency the app never imports.
//
//   npm run build-sound-map

import fs from 'node:fs';
import path from 'node:path';
import { UMAP } from 'umap-js';

import { fromIndexRow } from '../lib/sound.ts';
import { MAP_MEASURES, measureVector, type MapSong, type SoundMap } from '../lib/sound-map.ts';
import { kmeans, mergeSmall, nameRegions, normalizeLayout, seeded, standardizeColumns } from './sound-map-rules.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SETTINGS = { neighbors: 15, minDist: 0.02, seed: 42, regions: 8 };
const MIN_REGION = 60;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

type Entry = { itunesTrackId: number };
type Catalog = Record<string, { hits: Entry[]; deepCuts: Entry[]; mixed?: Entry[] }>;

// The same rule scripts/precompute-catalogs.ts names catalog files by.
function slugifyGenre(genre: string): string {
  return genre
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Each catalog song's genre tag (the name lib/pool.ts loadCatalog uses): the first genre, alphabetically, that lists it. */
function genreTags(): Map<number, string> {
  const tags = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/genres.json'), 'utf8'))).sort();
  const out = new Map<number, string>();
  for (const tag of tags) {
    const file = path.join(ROOT, 'assets/catalogs', `${slugifyGenre(tag)}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`no catalog for ${tag}`);
      continue;
    }
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
    for (const a of Object.values(catalog))
      for (const e of [...a.hits, ...a.deepCuts, ...(a.mixed ?? [])]) if (!out.has(e.itunesTrackId)) out.set(e.itunesTrackId, tag);
  }
  return out;
}

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sound-index.json'), 'utf8')) as { songs: Record<string, unknown> };
  const tagOf = genreTags();
  const ids = Object.keys(index.songs)
    .map(Number)
    .filter((id) => tagOf.has(id))
    .sort((a, b) => a - b);
  const { rows, mean, sd } = standardizeColumns(ids.map((id) => measureVector(fromIndexRow(index.songs[String(id)]) ?? {})));

  const random = seeded(SETTINGS.seed);
  console.time('layout');
  const layout = new UMAP({ nComponents: 2, nNeighbors: SETTINGS.neighbors, minDist: SETTINGS.minDist, random }).fit(rows);
  console.timeEnd('layout');
  const points = normalizeLayout(layout);
  const { centers, assign } = mergeSmall(points, kmeans(points, SETTINGS.regions, random).assign, MIN_REGION);

  const meanZ = centers.map((_, r) => {
    const members = rows.filter((_, i) => assign[i] === r);
    return MAP_MEASURES.map((_, j) => members.reduce((s, row) => s + row[j], 0) / members.length);
  });
  const words = nameRegions(meanZ);
  const genres = [...new Set(ids.map((id) => tagOf.get(id)!))].sort();
  const songs: Record<string, MapSong> = {};
  ids.forEach((id, i) => {
    songs[String(id)] = [r3(points[i][0]), r3(points[i][1]), assign[i], genres.indexOf(tagOf.get(id)!)];
  });

  const map: SoundMap = {
    v: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    settings: SETTINGS,
    measures: [...MAP_MEASURES],
    mean: mean.map(r4),
    sd: sd.map(r4),
    genres,
    regions: centers.map((c, r) => ({ x: r3(c[0]), y: r3(c[1]), words: words[r], songs: assign.filter((a) => a === r).length })),
    songs,
  };
  fs.writeFileSync(path.join(ROOT, 'assets/sound-map.json'), JSON.stringify(map));
  console.log(`${ids.length} songs, ${map.regions.length} regions:`);
  for (const r of map.regions) console.log(`  ${r.words.padEnd(36)} ${r.songs}`);
}

main();
