import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBaselines,
  catalogSlug,
  MIN_GENRE_SONGS,
  percentile,
  pickBaselineSongs,
  sanityProblems,
  seededRng,
  summarize,
  type Baselines,
  type BaselineEntry,
  type Measured,
} from './genre-sound.ts';
import { MEASURES } from './taste-decoded.ts';

const flat = (v: number): Measured => Object.fromEntries(MEASURES.map((m) => [m, v])) as Measured;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('percentile reads straight-line between sorted values', () => {
  const xs = [0, 10, 20, 30, 40];
  near(percentile(xs, 10), 4);
  near(percentile(xs, 25), 10);
  near(percentile(xs, 50), 20);
  near(percentile(xs, 90), 36);
  near(percentile([7], 75), 7);
});

test('summarize gives every measure its 10/25/50/75/90 cut points', () => {
  const s = summarize([0, 10, 20, 30, 40].map(flat));
  assert.equal(s.n, 5);
  for (const m of MEASURES) assert.deepEqual(s.cuts[m], [4, 10, 20, 30, 36]);
});

test(`buildBaselines leaves out genres under ${MIN_GENRE_SONGS} songs but pools every song into all`, () => {
  const b = buildBaselines({ Jazz: Array.from({ length: 15 }, () => flat(0.5)), Polka: [flat(0.1), flat(0.9)] }, '2026-10-02');
  assert.deepEqual(Object.keys(b.genres), ['Jazz']);
  assert.equal(b.all.n, 17);
  assert.equal(b.measuredAt, '2026-10-02');
});

function baselines(mids: Record<string, Partial<Measured>>): Baselines {
  const genres: Baselines['genres'] = {};
  for (const [g, over] of Object.entries(mids)) genres[g] = summarize([{ ...flat(0.5), ...over }]);
  return { measuredAt: '2026-10-02', genres, all: summarize([flat(0.5)]) };
}
const SANE = {
  Metal: { loudness: -4, energy: 0.9 },
  Ambient: { loudness: -18, energy: 0.2 },
  Classical: { instrumentalness: 0.9, speechiness: 0.04 },
  'Hip-Hop': { instrumentalness: 0.01, speechiness: 0.25 },
};

test('sanityProblems passes when the obvious truths hold', () => {
  assert.deepEqual(sanityProblems(baselines(SANE)), []);
});

test('sanityProblems names each truth that fails, and missing genres', () => {
  const wrong = baselines({ ...SANE, Ambient: { loudness: -2, energy: 0.2 } });
  assert.deepEqual(sanityProblems(wrong), ['Metal should be louder than Ambient: Metal -4 vs Ambient -2']);
  const noClassical = Object.fromEntries(Object.entries(SANE).filter(([g]) => g !== 'Classical'));
  assert.equal(sanityProblems(baselines(noClassical)).length, 2);
});

const entry = (a: string, k: string, i: number): BaselineEntry => ({ title: `${a} ${k}${i}`, previewUrl: `${a}-${k}${i}`, itunesTrackId: i });
const catalog = Object.fromEntries(
  Array.from({ length: 40 }, (_, i) => [`Artist${i}`, { hits: [entry(`A${i}`, 'h', 0), entry(`A${i}`, 'h', 1)], deepCuts: [entry(`A${i}`, 'd', 0)] }])
);

test('pickBaselineSongs takes 15 hits and 15 deep cuts, at most one of each per artist', () => {
  const picks = pickBaselineSongs(catalog, seededRng(1));
  assert.equal(picks.length, 30);
  assert.equal(new Set(picks.map((p) => p.previewUrl)).size, 30);
  const hitArtists = picks.filter((p) => p.previewUrl.includes('-h')).map((p) => p.previewUrl.split('-')[0]);
  assert.equal(new Set(hitArtists).size, 15);
});

test('pickBaselineSongs is repeatable with the same seed, and skips songs without a preview', () => {
  assert.deepEqual(pickBaselineSongs(catalog, seededRng(7)), pickBaselineSongs(catalog, seededRng(7)));
  const noPreview = { X: { hits: [{ title: 'x', previewUrl: '', itunesTrackId: 1 }], deepCuts: [] } };
  assert.deepEqual(pickBaselineSongs(noPreview, seededRng(1)), []);
});

test('catalogSlug matches the assets/catalogs file names', () => {
  assert.equal(catalogSlug('R&B'), 'r-b');
  assert.equal(catalogSlug('Drum and Bass'), 'drum-and-bass');
  assert.equal(catalogSlug('K-Pop'), 'k-pop');
  assert.equal(catalogSlug('Hip-Hop'), 'hip-hop');
});
