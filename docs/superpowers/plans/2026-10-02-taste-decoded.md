# Taste Decoded Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One honest sentence about the listener's taste ("You don't hate Country. You hate happy Country."), backed by songs they can play, on the You tab, a Decoded page, a share card and the Sunday reminder.

**Architecture:** All finding logic is pure and unit-tested in `lib/taste-decoded.ts`, judged against per-genre baselines (`assets/genre-sound.json`) that `scripts/measure-genre-sound.ts` builds once from the bundled catalogs. Measuring moves out of the Tasteform hook into `lib/song-feel-api.ts` so the Tasteform, Taste Decoded and the Blind Spot Test share one cache and one budget. `hooks/use-taste-decoded.ts` glues storage, measuring, the YOU dot, votes and the Sunday reminder to the screens.

**Tech Stack:** Expo SDK 57 / Expo Router 6, React 19.2, Reanimated 4.5, AsyncStorage, Node 24's test runner with `--experimental-strip-types`, ReccoBeats audio-features API, Supabase over plain REST.

**Spec:** `docs/superpowers/specs/2026-10-02-taste-decoded-design.md`

## Global Constraints

- Branch `taste-decoded`; never commit to `main`. Commit subjects `Taste Decoded: …`, a blank line, a body, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `node --experimental-strip-types --test lib/<file>.test.ts`. Inside node-tested `lib/` files, **value** imports between lib files use the `.ts` extension (`import { MEASURES } from './taste-decoded.ts'`); type-only imports may omit it.
- Read the versioned Expo docs (https://docs.expo.dev/versions/v57.0.0/) before using any Expo API not already used in the repo (AGENTS.md).
- **No new native modules or dependencies**: the work ships as an update to the runtime 1.0.1 APK. Uses only what's installed: `react-native-view-shot`, `expo-sharing`, `expo-notifications`, `expo-image`, `react-native-reanimated`.
- Measuring limits stay: 2 at a time, at most 80 per session, stop on a 429. The baselines script: one clip at a time, 3 seconds apart, stop on a 429.
- Theme (`constants/theme.ts`): navy room, cream text, `Ui.label` for mono labels, one filled cream button per screen (Share my taste); red (`Colors.signal`) only for the YOU dot; no emoji.
- Storage is best-effort (`readJson`/`writeJson` in `lib/discovery-storage.ts`): failures fall back, never throw.
- Copy, verbatim: "Take the Blind Spot Test to decode your nevers." · "Save N more songs to decode your taste." (1 → "song") · "Keep saving. Nothing stands out yet." · "New finding about your taste" · "Sounds like me" · "Nope" · "Share my taste" · "Decoded by Blindspot" · "Based on N songs".
- Don't touch `lib/taste-test.ts`. No Prettier config: match the surrounding style (single quotes, ~130 columns).

## Review Focus

1. **A save from search, charts or the old fetch path** carries an iTunes label ("Hip-Hop/Rap") with no swipe-log genre → it must count toward Across everything only, never break a genre twist. (Task 4: `decodedSaves` test.)
2. **Songs measured before this change** (energy/valence/tempo only) or a ReccoBeats outage mid-way → those songs are left out of findings, nothing throws, and the prompt doesn't ask for more saves. (Tasks 1, 4, 5: `isFullyMeasured`, `decodedSaves`, `decodedPrompt` tests.)
3. **A measure where most of a genre sits at one value** (instrumentalness 0 in vocal genres) → a typical value must read as normal, not "vocal". (Task 4: tied cut points test.)
4. **A Blind Spot Test song that failed to measure** → it doesn't count as liked or skipped evidence, and an unmeasured skip can't make "all liked" true. (Task 5 test.)
5. **Deleting a save that was evidence** (Recently deleted) → the finding recomputes and disappears below its bar. (Task 5: `decodeTaste` unsave test.)

---

### Task 1: Keep all 8 measurements, one shared measurer

**Files:**
- Create: `lib/taste-decoded.ts`, `lib/taste-decoded.test.ts`, `lib/song-feel-api.ts`
- Modify: `lib/tasteform.ts:25-26` (the `SongFeel` type), `hooks/use-song-feel.ts` (whole file)

**Interfaces:**
- Produces: `MEASURES`, `type Measure`, `type Side`, `SIDE_WORDS`, `parseSongFeel(f: unknown): SongFeel | null`, `isFullyMeasured(f: SongFeel | undefined): f is SongFeel & Record<Measure, number>` (lib/taste-decoded.ts); `loadFeels(): Promise<Record<number, SongFeel>>`, `peekFeels(): Record<number, SongFeel>`, `measureMissing(tracks: Measurable[], onUpdate?, cancelled?): Promise<Record<number, SongFeel>>`, `type Measurable = { id: number; previewUrl: string }` (lib/song-feel-api.ts). `useSongFeel` keeps its signature.

- [ ] **Step 1: Write the failing tests** — create `lib/taste-decoded.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFullyMeasured, MEASURES, parseSongFeel, SIDE_WORDS } from './taste-decoded.ts';

// A real answer, 2026-10-02, for Heidi Newfield's "Johnny And June" preview.
const RECCO = {
  acousticness: 0.6226,
  danceability: 0.5692,
  energy: 0.462,
  instrumentalness: 0.0038,
  liveness: 0.1187,
  loudness: -8.9531,
  speechiness: 0.0401,
  tempo: 138.2334,
  valence: 0.3772,
};

test('parseSongFeel keeps all 9 numbers ReccoBeats returns', () => {
  assert.deepEqual(parseSongFeel(RECCO), RECCO);
});

test('parseSongFeel rejects answers without energy or valence', () => {
  assert.equal(parseSongFeel(null), null);
  assert.equal(parseSongFeel({ error: 'bad file' }), null);
  assert.equal(parseSongFeel({ energy: 0.5 }), null);
  assert.equal(parseSongFeel({ energy: 'high', valence: 0.2 }), null);
});

test('parseSongFeel drops non-number extras instead of keeping junk', () => {
  assert.deepEqual(parseSongFeel({ energy: 0.5, valence: 0.2, tempo: 120, liveness: 'n/a' }), { energy: 0.5, valence: 0.2, tempo: 120 });
});

test('isFullyMeasured needs all 8 measures; songs measured before 2026-10-02 are not', () => {
  assert.equal(isFullyMeasured(parseSongFeel(RECCO)!), true);
  assert.equal(isFullyMeasured({ energy: 0.5, valence: 0.2, tempo: 120 }), false);
  assert.equal(isFullyMeasured(undefined), false);
});

test('every measure has a word for each side', () => {
  for (const m of MEASURES) {
    assert.ok(SIDE_WORDS[m].low);
    assert.ok(SIDE_WORDS[m].high);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts`
Expected: FAIL, `Cannot find module '…/lib/taste-decoded.ts'`.

- [ ] **Step 3: Widen `SongFeel`** — in `lib/tasteform.ts` replace lines 25–26 with:

```ts
/**
 * What a song's audio measures as (see lib/song-feel-api.ts). Tempo is kept but too shaky on 30s clips to
 * drive anything. The rest are optional: songs measured before 2026-10-02 only kept energy, valence and tempo.
 */
export type SongFeel = {
  energy: number;
  valence: number;
  tempo: number;
  danceability?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  speechiness?: number;
  loudness?: number;
};
```

- [ ] **Step 4: Create `lib/taste-decoded.ts`**

```ts
// Taste Decoded: one honest sentence about your taste, backed by songs you can
// play. Every measure is judged against the song's own genre's normal sound
// (assets/genre-sound.json, built by scripts/measure-genre-sound.ts). Pure —
// measuring is lib/song-feel-api.ts; the screens are components/decoded/ and
// app/decoded.tsx. Spec: docs/superpowers/specs/2026-10-02-taste-decoded-design.md

import type { SongFeel } from './tasteform';

/** The 8 measurements findings use. Tempo is measured too but stays out: shaky on 30s clips. */
export const MEASURES = [
  'energy',
  'valence',
  'danceability',
  'acousticness',
  'instrumentalness',
  'liveness',
  'speechiness',
  'loudness',
] as const;
export type Measure = (typeof MEASURES)[number];
export type Side = 'low' | 'high';

export const SIDE_WORDS: Record<Measure, Record<Side, string>> = {
  energy: { low: 'calm', high: 'intense' },
  valence: { low: 'sad', high: 'happy' },
  danceability: { low: 'still', high: 'danceable' },
  acousticness: { low: 'electronic', high: 'acoustic' },
  instrumentalness: { low: 'vocal', high: 'instrumental' },
  liveness: { low: 'studio', high: 'live' },
  speechiness: { low: 'sung', high: 'rapped or spoken' },
  loudness: { low: 'quiet', high: 'loud' },
};

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** ReccoBeats' answer as a SongFeel, or null when it isn't one. Non-number extras are dropped. */
export function parseSongFeel(f: unknown): SongFeel | null {
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const energy = num(o.energy);
  const valence = num(o.valence);
  if (energy == null || valence == null) return null;
  const feel: SongFeel = { energy, valence, tempo: num(o.tempo) ?? 0 };
  for (const m of MEASURES) {
    const v = num(o[m]);
    if (v != null) feel[m] = v;
  }
  return feel;
}

/** All 8 measurements present: only these songs count toward findings. */
export function isFullyMeasured(f: SongFeel | undefined): f is SongFeel & Record<Measure, number> {
  return !!f && MEASURES.every((m) => typeof f[m] === 'number');
}
```

- [ ] **Step 5: Run the tests**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Move measuring into `lib/song-feel-api.ts`**

```ts
import type { DiscoveryTrack } from './discovery';
import { loadSongFeel, saveSongFeel } from './discovery-storage';
import { isFullyMeasured, parseSongFeel } from './taste-decoded';
import type { SongFeel } from './tasteform';

// ReccoBeats (free, no key) measures Spotify-style audio features from a
// clip. We send the 30s iTunes preview itself: React Native's upload reads a
// part's `uri` straight from the web, so nothing is saved on the phone first.
// Tested 2026-09-30 on 14 obscure catalog songs: 14/14 measured, 1–2s each.
// Last.fm mood tags covered 0/14 and Deezer tempo about 1 in 4, so neither
// can carry the breathing for the small artists Blindspot finds.
// One cache and one budget for the Tasteform, Taste Decoded and the Blind Spot Test.
const ANALYZE_URL = 'https://api.reccobeats.com/v1/analysis/audio-features';
/** Be gentle: its rate limits aren't published. */
const AT_ONCE = 2;
const PER_SESSION = 80;

let cache: Record<number, SongFeel> | null = null;
const failed = new Set<number>();
const inFlight = new Set<number>();
let sent = 0;
let limited = false;

export type Measurable = Pick<DiscoveryTrack, 'id' | 'previewUrl'>;

async function measure(track: Measurable): Promise<SongFeel | null> {
  try {
    const body = new FormData();
    body.append('audioFile', { uri: track.previewUrl, name: 'preview.m4a', type: 'audio/mp4' } as unknown as Blob);
    sent += 1;
    const res = await fetch(ANALYZE_URL, { method: 'POST', body });
    if (res.status === 429) limited = true;
    if (!res.ok) return null;
    return parseSongFeel(await res.json());
  } catch {
    return null;
  }
}

/** Everything measured so far, loaded from storage the first time. */
export async function loadFeels(): Promise<Record<number, SongFeel>> {
  cache ??= await loadSongFeel();
  return cache;
}

/** What's in memory right now, without waiting on storage. */
export function peekFeels(): Record<number, SongFeel> {
  return cache ? { ...cache } : {};
}

/**
 * Measures the songs that aren't fully measured yet, a couple at a time, within this session's budget.
 * `onUpdate` gets a copy of the whole cache once loaded and after each batch. Songs another caller is
 * already measuring are skipped, so the Tasteform and Taste Decoded can both ask for the same saves.
 */
export async function measureMissing(
  tracks: Measurable[],
  onUpdate?: (feels: Record<number, SongFeel>) => void,
  cancelled: () => boolean = () => false
): Promise<Record<number, SongFeel>> {
  const feels = await loadFeels();
  if (cancelled()) return feels;
  onUpdate?.({ ...feels });
  const missing = tracks.filter((t) => t.previewUrl && !isFullyMeasured(feels[t.id]) && !failed.has(t.id) && !inFlight.has(t.id));
  let measured = 0;
  for (let i = 0; i < missing.length && !cancelled() && !limited && sent < PER_SESSION; i += AT_ONCE) {
    const batch = missing.slice(i, i + AT_ONCE);
    batch.forEach((t) => inFlight.add(t.id));
    const found = await Promise.all(batch.map(measure));
    batch.forEach((t, j) => {
      inFlight.delete(t.id);
      if (found[j]) {
        feels[t.id] = found[j]!;
        measured += 1;
      } else failed.add(t.id); // an older entry, if any, stays: its energy still drives the breathing
    });
    if (!cancelled()) onUpdate?.({ ...feels });
  }
  if (measured) await saveSongFeel(feels);
  return feels;
}
```

- [ ] **Step 7: Make the hook thin** — replace `hooks/use-song-feel.ts` with:

```ts
import { useEffect, useState } from 'react';

import type { DiscoveryTrack } from '@/lib/discovery';
import { measureMissing, peekFeels } from '@/lib/song-feel-api';
import type { SongFeel } from '@/lib/tasteform';

/** All 8 measurements per saved song, keyed by track id. Unmeasured ones are measured a couple at a time and fill in as they arrive. */
export function useSongFeel(tracks: DiscoveryTrack[]): Record<number, SongFeel> {
  const [feels, setFeels] = useState<Record<number, SongFeel>>(peekFeels);
  const key = tracks.map((t) => t.id).join('|');

  useEffect(() => {
    let cancelled = false;
    measureMissing(tracks, setFeels, () => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the track ids, compared by value
  }, [key]);

  return feels;
}
```

- [ ] **Step 8: Check types, lint, and the Tasteform tests**

Run: `npx tsc --noEmit && npm run lint && node --experimental-strip-types --test lib/tasteform.test.ts lib/taste-decoded.test.ts`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/taste-decoded.ts lib/taste-decoded.test.ts lib/song-feel-api.ts lib/tasteform.ts hooks/use-song-feel.ts
git commit -F - <<'EOF'
Taste Decoded: keep all 8 song measurements, one shared measurer

ReccoBeats already returns 9 numbers per clip; the app kept 3. SongFeel
now keeps them all (the new ones optional, so old cache entries still
load), and songs measured before today get measured once more under the
same limits. Measuring moves from the Tasteform hook into
lib/song-feel-api.ts so the Tasteform, Taste Decoded and the Blind Spot
Test share one cache and one budget, and never measure a song twice at
once.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Genre baselines (pure helpers, the script, the run)

**Files:**
- Create: `lib/genre-sound.ts`, `lib/genre-sound.test.ts`, `scripts/measure-genre-sound.ts`
- Modify: `package.json` (`scripts`), `CLAUDE.md` (Commands)
- Generated by the run: `assets/genre-sound-raw.json`, `assets/genre-sound.json`

**Interfaces:**
- Consumes: `MEASURES`, `type Measure`, `parseSongFeel`, `isFullyMeasured` (Task 1).
- Produces: `type Cuts = [number, number, number, number, number]`, `type GenreSound = { n: number; cuts: Record<Measure, Cuts> }`, `type Baselines = { measuredAt: string; genres: Record<string, GenreSound>; all: GenreSound }`, `type Measured = Record<Measure, number>`, `MIN_GENRE_SONGS = 15`, `percentile`, `summarize`, `buildBaselines`, `sanityProblems`, `pickBaselineSongs`, `seededRng`, `catalogSlug`; the file `assets/genre-sound.json` in the `Baselines` shape.

- [ ] **Step 1: Write the failing tests** — create `lib/genre-sound.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --test lib/genre-sound.test.ts`
Expected: FAIL, `Cannot find module '…/lib/genre-sound.ts'`.

- [ ] **Step 3: Create `lib/genre-sound.ts`**

```ts
// Genre baselines for Taste Decoded: what each genre normally sounds like,
// measured once from the bundled catalogs by scripts/measure-genre-sound.ts
// into assets/genre-sound.json. Pure.

import { MEASURES, type Measure } from './taste-decoded.ts';

/** A measure's 10th, 25th, 50th, 75th and 90th percentile. */
export type Cuts = [number, number, number, number, number];
export type GenreSound = { n: number; cuts: Record<Measure, Cuts> };
export type Baselines = { measuredAt: string; genres: Record<string, GenreSound>; all: GenreSound };
export type Measured = Record<Measure, number>;

const CUT_PERCENTILES = [10, 25, 50, 75, 90];
/** Below this many measured songs a genre is left out, and its songs are placed against `all`. */
export const MIN_GENRE_SONGS = 15;

/** Straight-line percentile (p 0–100) of an ascending, non-empty list. */
export function percentile(sorted: number[], p: number): number {
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function summarize(songs: Measured[]): GenreSound {
  const cuts = {} as Record<Measure, Cuts>;
  for (const m of MEASURES) {
    const sorted = songs.map((s) => s[m]).sort((a, b) => a - b);
    cuts[m] = CUT_PERCENTILES.map((p) => round4(percentile(sorted, p))) as Cuts;
  }
  return { n: songs.length, cuts };
}

/** The file the app reads: each genre with enough songs, plus every song pooled. */
export function buildBaselines(byGenre: Record<string, Measured[]>, measuredAt: string): Baselines {
  const genres: Record<string, GenreSound> = {};
  for (const [g, songs] of Object.entries(byGenre)) if (songs.length >= MIN_GENRE_SONGS) genres[g] = summarize(songs);
  return { measuredAt, genres, all: summarize(Object.values(byGenre).flat()) };
}

const CHECKS: [higher: string, measure: Measure, lower: string, says: string][] = [
  ['Metal', 'loudness', 'Ambient', 'Metal should be louder than Ambient'],
  ['Classical', 'instrumentalness', 'Hip-Hop', 'Classical should be more instrumental than Hip-Hop'],
  ['Hip-Hop', 'speechiness', 'Classical', 'Hip-Hop should be more spoken than Classical'],
  ['Metal', 'energy', 'Ambient', 'Ambient should be calmer than Metal'],
];

/** Obvious truths the numbers must show (on the 50th percentile) before anything relies on them. Empty means passed. */
export function sanityProblems(b: Baselines): string[] {
  const out: string[] = [];
  for (const [hi, m, lo, says] of CHECKS) {
    const a = b.genres[hi]?.cuts[m][2];
    const z = b.genres[lo]?.cuts[m][2];
    if (a == null || z == null) out.push(`${says} (no ${a == null ? hi : lo} baseline)`);
    else if (!(a > z)) out.push(`${says}: ${hi} ${a} vs ${lo} ${z}`);
  }
  return out;
}

export type BaselineEntry = { title: string; previewUrl: string; itunesTrackId: number };
type CatalogLike = Record<string, { hits: BaselineEntry[]; deepCuts: BaselineEntry[] }>;

/** Up to `perKind` hits and `perKind` deep cuts, one of each per artist at most, in a repeatable shuffled artist order. */
export function pickBaselineSongs(catalog: CatalogLike, rng: () => number, perKind = 15): BaselineEntry[] {
  const artists = shuffle(Object.keys(catalog), rng);
  const seen = new Set<string>();
  const take = (kind: 'hits' | 'deepCuts') => {
    const out: BaselineEntry[] = [];
    for (const a of artists) {
      if (out.length >= perKind) break;
      const e = catalog[a][kind].find((x) => x.previewUrl && !seen.has(x.previewUrl));
      if (!e) continue;
      seen.add(e.previewUrl);
      out.push(e);
    }
    return out;
  };
  return [...take('hits'), ...take('deepCuts')];
}

/** mulberry32: a tiny seeded generator, so the baseline sample is the same every run. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** assets/catalogs/<slug>.json for a genre name: "R&B" → "r-b", "Drum and Bass" → "drum-and-bass". */
export function catalogSlug(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test lib/genre-sound.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Create `scripts/measure-genre-sound.ts`**

```ts
// Builds assets/genre-sound.json: what each of the 37 genres normally sounds
// like, for Taste Decoded (docs/superpowers/specs/2026-10-02-taste-decoded-design.md).
// 30 songs per genre from the bundled catalogs (15 hits, 15 deep cuts), each
// 30s preview sent to ReccoBeats one at a time, 3s apart. Answers are saved to
// assets/genre-sound-raw.json as they arrive, so a stopped run (Ctrl-C, a 429)
// picks up where it left off. ~1,100 clips, about an hour and a half.
//
//   npm run measure-genre-sound                  measure what's missing, check, write the file
//   npm run measure-genre-sound -- --limit 2     first 2 genres only, no file written (a dry run)

import fs from 'node:fs';
import path from 'node:path';

import { buildBaselines, catalogSlug, pickBaselineSongs, sanityProblems, seededRng, type Measured } from '../lib/genre-sound.ts';
import { isFullyMeasured, MEASURES, parseSongFeel } from '../lib/taste-decoded.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'assets/genre-sound-raw.json');
const OUT = path.join(ROOT, 'assets/genre-sound.json');
const ANALYZE_URL = 'https://api.reccobeats.com/v1/analysis/audio-features';
const GAP_MS = 3_000;
const SEED = 20261002;

/** genre → previewUrl → its measurements, or 'failed' (not retried). */
type Raw = Record<string, Record<string, Measured | 'failed'>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readRaw = (): Raw => (fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {});
const writeRaw = (raw: Raw) => fs.writeFileSync(RAW, JSON.stringify(raw, null, 1) + '\n');

async function measure(previewUrl: string): Promise<Measured | 'failed' | 'limited'> {
  const clip = await fetch(previewUrl);
  if (!clip.ok) return 'failed';
  const body = new FormData();
  body.append('audioFile', new Blob([await clip.arrayBuffer()], { type: 'audio/mp4' }), 'preview.m4a');
  const res = await fetch(ANALYZE_URL, { method: 'POST', body });
  if (res.status === 429) return 'limited';
  if (!res.ok) return 'failed';
  const feel = parseSongFeel(await res.json()) ?? undefined;
  if (!isFullyMeasured(feel)) return 'failed';
  return Object.fromEntries(MEASURES.map((m) => [m, feel[m]])) as Measured;
}

async function main() {
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
```

- [ ] **Step 6: Add the npm script** — in `package.json` `scripts`, after `"scan-ai-artists"`, add:

```json
    "measure-genre-sound": "node --experimental-strip-types scripts/measure-genre-sound.ts"
```

And in `CLAUDE.md`'s Commands list, after the Daily Drop bullet, add:

```markdown
- Taste Decoded baselines: `npm run measure-genre-sound` (30 songs per genre from `assets/catalogs/` through ReccoBeats, one at a time, 3s apart; resumable via `assets/genre-sound-raw.json`; writes `assets/genre-sound.json` only if its sanity check passes; `-- --limit 2` is a dry run on 2 genres).
```

- [ ] **Step 7: Dry run on 2 genres**

Run: `npm run measure-genre-sound -- --limit 2`
Expected: `Pop: 0/30 done, 30 to measure`, then `Rock: …`, then `Dry run: 60 songs measured…` (a few `failed` are fine). Takes ~5 minutes. If every answer fails, stop and check one clip by hand with `curl -X POST -F "audioFile=@clip.m4a;type=audio/mp4" https://api.reccobeats.com/v1/analysis/audio-features`.

- [ ] **Step 8: Full run, in the background** (it resumes the 2 dry-run genres)

Run (background, timeout 2h): `npm run measure-genre-sound`
Expected at the end: `Wrote assets/genre-sound.json: 3x genres, ~1,1xx songs.` If it stops on a 429, wait 15 minutes and run it again. If the sanity check fails, stop and report the problems: the measurements can't be trusted and Taste Decoded needs a rethink. **Tasks 3–5 don't need the file; Task 6 does.**

- [ ] **Step 9: Commit** (after the run writes the file)

```bash
git add lib/genre-sound.ts lib/genre-sound.test.ts scripts/measure-genre-sound.ts package.json CLAUDE.md assets/genre-sound-raw.json assets/genre-sound.json
git commit -F - <<'EOF'
Taste Decoded: genre baselines from 30 measured songs per genre

npm run measure-genre-sound sends 15 hits and 15 deep cuts per genre
from the bundled catalogs through ReccoBeats, one at a time, and keeps
each genre's 10/25/50/75/90th percentile per measure. Genres under 15
measured songs fall back to the pooled row. The file is only written if
the obvious truths hold (Metal louder than Ambient, Classical more
instrumental than Hip-Hop, and so on). Raw answers are kept for the paper.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Start collecting: swipe audio links and Blind Spot Test songs

**Files:**
- Modify: `lib/discovery.ts` (`SwipeEntry`, after `dwellMs?: number;`), `app/(tabs)/index.tsx:336-345` (`logSwipe`), `app/drop-play.tsx:48-60`, `lib/blind-test.ts`, `lib/blind-test.test.ts`, `lib/discovery-storage.ts:349-352`, `app/blind-test.tsx:75-79`

**Interfaces:**
- Consumes: `measureMissing` (Task 1).
- Produces: `type BlindTestSong = { trackId: number; title: string; artist: string; genre: string; previewUrl: string; artworkUrl: string; isNever: boolean; liked: boolean }`, `testSongs(items: TestItem[], liked: boolean[]): BlindTestSong[]`, exported `listGenres(never: string[]): string` (lib/blind-test.ts); `BlindTestResult.songs?: BlindTestSong[]`; `SwipeEntry.previewUrl?`, `SwipeEntry.artworkUrl100?`.

- [ ] **Step 1: Write the failing test** — in `lib/blind-test.test.ts` add `listGenres, testSongs` to the import from `'./blind-test.ts'`, then append:

```ts
test('testSongs keeps each song with whether it was a never and whether you liked it', () => {
  const song = (id: number, genre: string): PoolSong => ({ artist: `A${id}`, title: `T${id}`, previewUrl: `p${id}`, artworkUrl: `a${id}`, listeners: 1000, genre, itunesTrackId: id });
  const items = [
    { song: song(1, 'Country'), isNever: true },
    { song: song(2, 'Jazz'), isNever: false },
  ];
  assert.deepEqual(testSongs(items, [true, false]), [
    { trackId: 1, title: 'T1', artist: 'A1', genre: 'Country', previewUrl: 'p1', artworkUrl: 'a1', isNever: true, liked: true },
    { trackId: 2, title: 'T2', artist: 'A2', genre: 'Jazz', previewUrl: 'p2', artworkUrl: 'a2', isNever: false, liked: false },
  ]);
});

test('listGenres joins like the headline', () => {
  assert.equal(listGenres(['Country']), 'Country');
  assert.equal(listGenres(['Country', 'Metal', 'Jazz']), 'Country, Metal & Jazz');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --experimental-strip-types --test lib/blind-test.test.ts`
Expected: FAIL, `testSongs` / `listGenres` is not exported.

- [ ] **Step 3: Add `testSongs` and export `listGenres`** — in `lib/blind-test.ts`, change `function listGenres(` to `export function listGenres(`, and after `scoreTest` add:

```ts
export type BlindTestSong = {
  trackId: number;
  title: string;
  artist: string;
  genre: string;
  previewUrl: string;
  artworkUrl: string;
  isNever: boolean;
  liked: boolean;
};

/** The test's 10 songs and what you did with each, kept so Taste Decoded can explain your nevers. */
export function testSongs(items: TestItem[], liked: boolean[]): BlindTestSong[] {
  return items.map((x, i) => ({
    trackId: x.song.itunesTrackId,
    title: x.song.title,
    artist: x.song.artist,
    genre: x.song.genre,
    previewUrl: x.song.previewUrl,
    artworkUrl: x.song.artworkUrl,
    isNever: x.isNever,
    liked: liked[i] === true,
  }));
}
```

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test lib/blind-test.test.ts`
Expected: PASS.

- [ ] **Step 5: Store the songs with the result** — in `lib/discovery-storage.ts`, add `import type { BlindTestSong } from './blind-test';` with the other type imports, and replace the `BlindTestResult` line with:

```ts
/** `songs` since 2026-10-02 (Taste Decoded); older results don't have them. */
export type BlindTestResult = { never: string[]; neverLiked: number; otherLiked: number; at: number; songs?: BlindTestSong[] };
```

In `app/blind-test.tsx`, add `testSongs` to the `@/lib/blind-test` import and `import { measureMissing } from '@/lib/song-feel-api';`, then replace

```ts
      await saveBlindTest({ never, ...score, at: Date.now() });
```

with

```ts
      await saveBlindTest({ never, ...score, at: Date.now(), songs: testSongs(items, next) });
      // Measure all 10 now, so Taste Decoded can explain your nevers.
      measureMissing(items.map((x) => ({ id: x.song.itunesTrackId, previewUrl: x.song.previewUrl })));
```

- [ ] **Step 6: Keep each swipe's audio link** — in `lib/discovery.ts`, inside `SwipeEntry` after `dwellMs?: number;`, add:

```ts
  // 2026-10-02, for Taste Decoded's skip findings later: what the song
  // sounded like and looked like, so a skip can be measured long after it
  // left the queue. Same precedent as every optional field above.
  previewUrl?: string;
  artworkUrl100?: string;
```

In `app/(tabs)/index.tsx` `logSwipe`, after `collectionId: track.collectionId,` add:

```ts
      previewUrl: track.previewUrl,
      artworkUrl100: track.artworkUrl100,
```

In `app/drop-play.tsx` `handleSwipe`, after `genre: t.primaryGenreName,` add the same two lines with `t`:

```ts
      previewUrl: t.previewUrl,
      artworkUrl100: t.artworkUrl100,
```

- [ ] **Step 7: Check**

Run: `npx tsc --noEmit && npm run lint && node --experimental-strip-types --test lib/blind-test.test.ts lib/discovery.test.ts`
Expected: clean, all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/discovery.ts "app/(tabs)/index.tsx" app/drop-play.tsx lib/blind-test.ts lib/blind-test.test.ts lib/discovery-storage.ts app/blind-test.tsx
git commit -F - <<'EOF'
Taste Decoded: keep Blind Spot Test songs and each swipe's audio link

The test now saves its 10 songs with what you did with each and
measures them right away, which is the evidence for "you don't hate
country, you hate happy country". Every swipe also keeps its preview
and cover links, so skip findings can be built later without losing
the weeks of swipes in between.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Findings from saves: positions, genre twist, across everything

**Files:**
- Modify: `lib/taste-decoded.ts`, `lib/taste-decoded.test.ts`

**Interfaces:**
- Consumes: `type Baselines`, `type Cuts`, `type GenreSound` (Task 2, type-only import from `./genre-sound`); `DiscoveryTrack`, `SwipeEntry` (lib/discovery.ts).
- Produces: `position(value: number, cuts: Cuts): number`, `sideOf(pos: number): Side | null`, `songGenre(candidates: (string | undefined)[], b: Baselines): string | null`, `type DecodedSong`, `type FindingKind`, `type Finding`, `findingId(kind, genre, measure, side): string`, `baselineFor(genre: string | null, b: Baselines): GenreSound`, `decodedSaves(liked, history, feels, b): DecodedSong[]`, `genreFindings(saves, b): Finding[]`, `acrossFindings(saves, b): Finding[]`.

- [ ] **Step 1: Write the failing tests** — in `lib/taste-decoded.test.ts`, extend the top imports to:

```ts
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { Baselines, Cuts, GenreSound } from './genre-sound.ts';
import {
  acrossFindings,
  decodedSaves,
  genreFindings,
  isFullyMeasured,
  MEASURES,
  parseSongFeel,
  position,
  SIDE_WORDS,
  sideOf,
  songGenre,
  type DecodedSong,
  type Measure,
} from './taste-decoded.ts';
import type { SongFeel } from './tasteform.ts';
```

and append:

```ts
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const EVEN: Cuts = [0.1, 0.25, 0.5, 0.75, 0.9];
const sound = (cuts: Cuts = EVEN): GenreSound => ({ n: 30, cuts: Object.fromEntries(MEASURES.map((m) => [m, cuts])) as GenreSound['cuts'] });
const B: Baselines = { measuredAt: '2026-10-02', genres: { Country: sound(), Jazz: sound(), Metal: sound(), Soul: sound() }, all: sound() };
const middle = () => Object.fromEntries(MEASURES.map((m) => [m, 0.5])) as Record<Measure, number>;
const feel = (o: Partial<Record<Measure, number>> = {}): SongFeel => ({ tempo: 120, ...middle(), ...o });
const song = (id: number, genre: string | null, o: Partial<Record<Measure, number>> = {}): DecodedSong => ({
  id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  artworkUrl: '',
  previewUrl: '',
  genre,
  feel: { ...middle(), ...o },
});
const save = (id: number, genre: string): DiscoveryTrack => ({
  id,
  trackName: `Song ${id}`,
  artistId: id,
  artistName: `Artist ${id}`,
  artworkUrl100: `art${id}`,
  primaryGenreName: genre,
  previewUrl: `clip${id}`,
  trackViewUrl: '',
  collectionName: null,
});

test('position reads straight-line between cut points', () => {
  near(position(0.375, EVEN), 37.5);
  near(position(0.25, EVEN), 25);
  near(position(0.8, EVEN), 80);
});

test('position is 5 below the 10th and 95 above the 90th', () => {
  assert.equal(position(0.01, EVEN), 5);
  assert.equal(position(0.99, EVEN), 95);
});

test('a value tied across several cut points takes their middle, so typical never reads as extreme', () => {
  const flat: Cuts = [0, 0, 0, 0.1, 0.5];
  assert.equal(position(0, flat), 30);
  assert.equal(sideOf(position(0, flat)), null);
  near(position(0.05, flat), 62.5);
});

test('sideOf: 25 and below is low, 75 and above is high', () => {
  assert.equal(sideOf(25), 'low');
  assert.equal(sideOf(25.1), null);
  assert.equal(sideOf(74.9), null);
  assert.equal(sideOf(75), 'high');
});

test('songGenre takes the first candidate the baselines know', () => {
  assert.equal(songGenre(['Country', 'Jazz'], B), 'Country');
  assert.equal(songGenre([undefined, 'Jazz'], B), 'Jazz');
  assert.equal(songGenre(['Hip-Hop/Rap'], B), null);
});

test('decodedSaves keeps fully measured saves; genre from the swipe log first, then the label; iTunes labels get none', () => {
  const liked = [save(1, 'Hip-Hop/Rap'), save(2, 'Jazz'), save(3, 'Hip-Hop/Rap'), save(4, 'Country')];
  const history = [{ trackId: 1, artistId: 1, genre: 'Country', action: 'like', timestamp: 1 }] as SwipeEntry[];
  const feels: Record<number, SongFeel> = { 1: feel(), 2: feel(), 3: feel(), 4: { energy: 0.5, valence: 0.5, tempo: 120 } };
  assert.deepEqual(
    decodedSaves(liked, history, feels, B).map((s) => [s.id, s.genre]),
    [
      [1, 'Country'],
      [2, 'Jazz'],
      [3, null],
    ]
  );
});

test('genre twist speaks at 3 saves on one side, with every save in the genre as evidence', () => {
  const f = genreFindings([song(1, 'Jazz', { loudness: 0.95 }), song(2, 'Jazz', { loudness: 0.8 }), song(3, 'Jazz', { loudness: 0.92 })], B);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, 'genre:Jazz:loudness:high');
  assert.equal(f[0].sentence, "You don't just like Jazz. You like loud Jazz.");
  assert.deepEqual(
    f[0].evidence.map((e) => e.song.id),
    [1, 2, 3]
  );
  assert.equal(f[0].strength, 3 / 8);
});

test('genre twist stays quiet one save below the bar, and under 75% on a side', () => {
  assert.deepEqual(genreFindings([song(1, 'Jazz', { loudness: 0.95 }), song(2, 'Jazz', { loudness: 0.95 })], B), []);
  const half = [0.95, 0.95, 0.5, 0.5].map((l, i) => song(i + 1, 'Jazz', { loudness: l }));
  assert.deepEqual(genreFindings(half, B), []);
  const threeOfFour = [0.95, 0.95, 0.95, 0.5].map((l, i) => song(i + 1, 'Jazz', { loudness: l }));
  assert.equal(genreFindings(threeOfFour, B)[0].strength, 0.75 * (4 / 8));
});

test('songs without a genre never form a genre twist', () => {
  assert.deepEqual(genreFindings([1, 2, 3].map((id) => song(id, null, { loudness: 0.95 })), B), []);
});

test('a genre the baselines left out is placed against the all row', () => {
  const b: Baselines = { ...B, all: sound([0.6, 0.7, 0.8, 0.9, 0.95]) };
  assert.equal(genreFindings([1, 2, 3].map((id) => song(id, 'Polka')), b)[0]?.id, 'genre:Polka:energy:low');
});

const acoustic = (genres: (string | null)[]) => genres.map((g, i) => song(i + 1, g, { acousticness: 0.95 }));

test('across everything needs 6 saves over 3 genres; songs without a genre still count toward the 6', () => {
  const f = acrossFindings(acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal', null]), B);
  assert.equal(f[0].id, 'across:*:acousticness:high');
  assert.equal(f[0].sentence, '3 genres, one habit: everything you save is acoustic.');
  assert.deepEqual(acrossFindings(acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal']), B), [], '5 saves');
  assert.deepEqual(acrossFindings(acoustic(['Jazz', 'Jazz', 'Jazz', 'Country', 'Country', null]), B), [], '2 genres');
});

test('across everything says "almost" below 100%', () => {
  const songs = [...acoustic(['Jazz', 'Jazz', 'Country', 'Country', 'Metal', 'Metal', 'Soul']), song(8, 'Soul')];
  assert.equal(acrossFindings(songs, B)[0].sentence, '4 genres, one habit: almost everything you save is acoustic.');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts`
Expected: FAIL, `position` (and the rest) is not exported.

- [ ] **Step 3: Implement** — in `lib/taste-decoded.ts`, change the imports to:

```ts
import type { DiscoveryTrack, SwipeEntry } from './discovery';
import type { Baselines, Cuts, GenreSound } from './genre-sound';
import type { SongFeel } from './tasteform';
```

and append:

```ts
// ---------- Positions ----------

const CUT_AT = [10, 25, 50, 75, 90];

/**
 * A value's percentile within a genre: straight-line between the cut points, 5 below the 10th, 95 above
 * the 90th. A value equal to several cut points takes the middle of them, so a typical value (say
 * instrumentalness 0 in a vocal genre) never reads as extreme.
 */
export function position(value: number, cuts: Cuts): number {
  if (value < cuts[0]) return 5;
  if (value > cuts[4]) return 95;
  const tied = CUT_AT.filter((_, i) => cuts[i] === value);
  if (tied.length) return (tied[0] + tied[tied.length - 1]) / 2;
  for (let i = 0; i < 4; i++) {
    if (value < cuts[i + 1]) return CUT_AT[i] + ((value - cuts[i]) / (cuts[i + 1] - cuts[i])) * (CUT_AT[i + 1] - CUT_AT[i]);
  }
  return 90; // not reached: value <= cuts[4] and not tied to it
}

/** Low at or below the 25th, high at or above the 75th; normal songs never count toward a side. */
export function sideOf(pos: number): Side | null {
  return pos <= 25 ? 'low' : pos >= 75 ? 'high' : null;
}

/** The first candidate the baselines know: pool songs carry the app's genres, iTunes labels usually match nothing. */
export function songGenre(candidates: (string | undefined)[], b: Baselines): string | null {
  return candidates.find((g): g is string => !!g && g in b.genres) ?? null;
}

export function baselineFor(genre: string | null, b: Baselines): GenreSound {
  return (genre != null && b.genres[genre]) || b.all;
}

// ---------- Findings ----------

/** A saved or test song with all 8 measurements, ready to judge. */
export type DecodedSong = {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  genre: string | null;
  feel: Record<Measure, number>;
};

export type FindingKind = 'never' | 'never-all' | 'genre' | 'across';

export type Finding = {
  /** `kind:genre:measure:side`; drives "new", votes and the Sunday ping. */
  id: string;
  kind: FindingKind;
  genre: string | null;
  measure: Measure;
  side: Side;
  sentence: string;
  /** The songs behind it, each at its 0–100 position (normal is 25–75). */
  evidence: { song: DecodedSong; position: number }[];
  strength: number;
};

export const findingId = (kind: FindingKind, genre: string | null, m: Measure, side: Side) => `${kind}:${genre ?? '*'}:${m}:${side}`;

const MIN_SHARE = 0.75;
/** More songs, more weight, up to 8. */
const weight = (n: number) => Math.min(n, 8) / 8;

/** Saved songs that are fully measured, with a genre from the swipe log first, then their own label. */
export function decodedSaves(liked: DiscoveryTrack[], history: SwipeEntry[], feels: Record<number, SongFeel>, b: Baselines): DecodedSong[] {
  const swipeGenre = new Map<number, string>();
  for (const e of history) swipeGenre.set(e.trackId, e.genre); // the latest swipe wins
  return liked.flatMap((t) => {
    const feel = feels[t.id];
    if (!isFullyMeasured(feel)) return [];
    const genre = songGenre([swipeGenre.get(t.id), t.primaryGenreName], b);
    return [{ id: t.id, title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl100, previewUrl: t.previewUrl, genre, feel }];
  });
}

/** Every measure where at least 75% of the songs sit on one side, with all the songs placed as evidence. */
function lopsided(songs: DecodedSong[], against: (s: DecodedSong) => GenreSound) {
  const out: { measure: Measure; side: Side; share: number; evidence: Finding['evidence'] }[] = [];
  for (const m of MEASURES) {
    const evidence = songs.map((song) => ({ song, position: position(song.feel[m], against(song).cuts[m]) }));
    const low = evidence.filter((e) => sideOf(e.position) === 'low').length;
    const high = evidence.filter((e) => sideOf(e.position) === 'high').length;
    const share = Math.max(low, high) / songs.length;
    if (share >= MIN_SHARE) out.push({ measure: m, side: high > low ? 'high' : 'low', share, evidence });
  }
  return out;
}

/** "You don't just like Jazz. You like loud Jazz." — 3+ saves in a genre, 75%+ on one side of its normal. */
export function genreFindings(saves: DecodedSong[], b: Baselines): Finding[] {
  const byGenre = new Map<string, DecodedSong[]>();
  for (const s of saves) if (s.genre) byGenre.set(s.genre, [...(byGenre.get(s.genre) ?? []), s]);
  const out: Finding[] = [];
  for (const [genre, songs] of byGenre) {
    if (songs.length < 3) continue;
    for (const l of lopsided(songs, () => baselineFor(genre, b))) {
      const word = SIDE_WORDS[l.measure][l.side];
      out.push({
        id: findingId('genre', genre, l.measure, l.side),
        kind: 'genre',
        genre,
        measure: l.measure,
        side: l.side,
        sentence: `You don't just like ${genre}. You like ${word} ${genre}.`,
        evidence: l.evidence,
        strength: l.share * weight(songs.length),
      });
    }
  }
  return out;
}

/** "3 genres, one habit: everything you save is acoustic." — 6+ saves over 3+ genres, against the pooled row. */
export function acrossFindings(saves: DecodedSong[], b: Baselines): Finding[] {
  const genres = new Set(saves.flatMap((s) => (s.genre ? [s.genre] : [])));
  if (saves.length < 6 || genres.size < 3) return [];
  return lopsided(saves, () => b.all).map((l) => ({
    id: findingId('across', null, l.measure, l.side),
    kind: 'across' as const,
    genre: null,
    measure: l.measure,
    side: l.side,
    sentence: `${genres.size} genres, one habit: ${l.share === 1 ? 'everything' : 'almost everything'} you save is ${SIDE_WORDS[l.measure][l.side]}.`,
    evidence: l.evidence,
    strength: l.share * weight(saves.length),
  }));
}
```

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/taste-decoded.ts lib/taste-decoded.test.ts
git commit -F - <<'EOF'
Taste Decoded: genre twist and across-everything findings

Each measure is read as a song's percentile within its own genre, so
songs from different genres share one bar; values tied across cut
points land in the middle, so a typical 0 never reads as extreme. A
genre twist needs 3+ saves with 75% on one side; across everything
needs 6+ saves over 3+ genres. Saves from search or charts, whose
iTunes labels match no baseline, only count toward across everything.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Never findings, ranking, prompt, news and votes

**Files:**
- Modify: `lib/taste-decoded.ts`, `lib/taste-decoded.test.ts`

**Interfaces:**
- Consumes: `type BlindTestSong`, `listGenres` (Task 3, `./blind-test.ts`); everything from Task 4.
- Produces: `type NeverSong`, `decodedNevers(songs: BlindTestSong[], feels, b): NeverSong[]`, `neverFindings(test: { never: string[]; songs: BlindTestSong[] }, feels, b): Finding[]`, `type DecodeInput = { liked: DiscoveryTrack[]; history: SwipeEntry[]; feels: Record<number, SongFeel>; test: { never: string[]; songs?: BlindTestSong[] } | null }`, `decodeTaste(input: DecodeInput, b: Baselines): Finding[]`, `decodedPrompt(saved: number, test: { songs?: BlindTestSong[] } | null): { text: string; takeTest: boolean }`, `unseenFinding(findings: Finding[], seen: string[]): Finding | null`, `type DecodedVotes = Record<string, { agree: boolean; sent: boolean }>`, `nextVote(votes, id, agree): { votes: DecodedVotes; send: boolean }`, `markSent(votes, id): DecodedVotes`.

- [ ] **Step 1: Write the failing tests** — add `decodedNevers, decodedPrompt, decodeTaste, markSent, neverFindings, nextVote, unseenFinding, type DecodedVotes, type Finding` to the import from `'./taste-decoded.ts'`, add `import type { BlindTestSong } from './blind-test.ts';`, and append:

```ts
type Spec = [liked: boolean, o: Partial<Record<Measure, number>> | null][];
/** Never-songs for a test; `null` means it failed to measure. */
function nevers(spec: Spec, genre = 'Country') {
  const songs: BlindTestSong[] = spec.map(([liked], i) => ({
    trackId: 100 + i,
    title: `Never ${i}`,
    artist: `Artist ${i}`,
    genre,
    previewUrl: `clip${i}`,
    artworkUrl: '',
    isNever: true,
    liked,
  }));
  const feels: Record<number, SongFeel> = {};
  spec.forEach(([, o], i) => {
    if (o) feels[100 + i] = feel(o);
  });
  return { songs, feels };
}
const SAD_LIKED_HAPPY_SKIPPED: Spec = [
  [true, { valence: 0.1 }],
  [true, { valence: 0.15 }],
  [false, { valence: 0.9 }],
  [false, { valence: 0.85 }],
  [false, { valence: 0.95 }],
];

test('never, decoded: liked sad, skipped happy → you hate happy Country', () => {
  const { songs, feels } = nevers(SAD_LIKED_HAPPY_SKIPPED);
  const f = neverFindings({ never: ['Country'], songs }, feels, B);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, 'never:Country:valence:high');
  assert.equal(f[0].sentence, "You don't hate Country. You hate happy Country.");
  assert.equal(f[0].evidence.length, 5);
});

test('never, decoded stays quiet when the gap is under 25 points or the sides overlap', () => {
  const small = nevers([
    [true, { valence: 0.45 }],
    [true, { valence: 0.48 }],
    [false, { valence: 0.52 }],
  ]);
  assert.deepEqual(neverFindings({ never: ['Country'], songs: small.songs }, small.feels, B), []);
  const overlap = nevers([
    [true, { valence: 0.1 }],
    [true, { valence: 0.9 }],
    [false, { valence: 0.5 }],
  ]);
  assert.deepEqual(neverFindings({ never: ['Country'], songs: overlap.songs }, overlap.feels, B), []);
});

test('never, decoded needs 2 measured likes and 1 measured skip; an unmeasured skip is no evidence', () => {
  const { songs, feels } = nevers([
    [true, { valence: 0.1 }],
    [true, { valence: 0.15 }],
    [false, null],
  ]);
  assert.deepEqual(neverFindings({ never: ['Country'], songs }, feels, B), []);
});

test('never, decoded (all liked): 4 of 5 on one side', () => {
  const four = { instrumentalness: 0.95 };
  const { songs, feels } = nevers(
    [
      [true, four],
      [true, four],
      [true, four],
      [true, four],
      [true, {}],
    ],
    'Metal'
  );
  const f = neverFindings({ never: ['Metal'], songs }, feels, B);
  assert.equal(f[0].id, 'never-all:Metal:instrumentalness:high');
  assert.equal(f[0].sentence, 'You said never Metal, then liked all 5. 4 of 5 were instrumental.');
});

test('never, decoded (all liked) says "Every one was" when all of them are', () => {
  const { songs, feels } = nevers(
    Array.from({ length: 5 }, (): Spec[number] => [true, { instrumentalness: 0.95 }]),
    'Metal'
  );
  assert.equal(neverFindings({ never: ['Metal'], songs }, feels, B)[0].sentence, 'You said never Metal, then liked all 5. Every one was instrumental.');
});

test('several never genres join like the test headline', () => {
  const { songs, feels } = nevers(SAD_LIKED_HAPPY_SKIPPED);
  assert.equal(
    neverFindings({ never: ['Country', 'Metal'], songs }, feels, B)[0].sentence,
    "You don't hate Country & Metal. You hate happy Country & Metal."
  );
});

test('a never-song whose genre the baselines left out is placed against the all row', () => {
  const { songs, feels } = nevers([[true, {}]], 'Polka');
  assert.equal(decodedNevers(songs, feels, B)[0].genre, null);
});

test('decodeTaste: one never finding first, then the strongest, at most 3, one per measure', () => {
  const nv = nevers(SAD_LIKED_HAPPY_SKIPPED);
  const liked = [1, 2, 3, 4].map((id) => save(id, 'Jazz'));
  const feels: Record<number, SongFeel> = { ...nv.feels };
  for (const id of [1, 2, 3, 4]) feels[id] = feel({ loudness: 0.95, energy: 0.95, valence: 0.95, liveness: 0.95 });
  const f = decodeTaste({ liked, history: [], feels, test: { never: ['Country'], songs: nv.songs } }, B);
  assert.deepEqual(
    f.map((x) => x.id),
    ['never:Country:valence:high', 'genre:Jazz:energy:high', 'genre:Jazz:liveness:high']
  );
});

test('decodeTaste: an old test result without songs, or none, gives no never finding and does not throw', () => {
  assert.deepEqual(decodeTaste({ liked: [], history: [], feels: {}, test: { never: ['Country'] } }, B), []);
  assert.deepEqual(decodeTaste({ liked: [], history: [], feels: {}, test: null }, B), []);
});

test('decodeTaste: unsaving one of three songs drops the genre twist', () => {
  const liked = [1, 2, 3].map((id) => save(id, 'Jazz'));
  const feels = Object.fromEntries([1, 2, 3].map((id) => [id, feel({ loudness: 0.95 })]));
  assert.equal(decodeTaste({ liked, history: [], feels, test: null }, B).length, 1);
  assert.equal(decodeTaste({ liked: liked.slice(1), history: [], feels, test: null }, B).length, 0);
});

test('decodedPrompt asks for the test first, then saves, then patience', () => {
  const TEST = { text: 'Take the Blind Spot Test to decode your nevers.', takeTest: true };
  assert.deepEqual(decodedPrompt(10, null), TEST);
  assert.deepEqual(decodedPrompt(10, { songs: undefined }), TEST, 'a result from before songs were kept');
  const t = { songs: [] };
  assert.deepEqual(decodedPrompt(1, t), { text: 'Save 2 more songs to decode your taste.', takeTest: false });
  assert.deepEqual(decodedPrompt(2, t), { text: 'Save 1 more song to decode your taste.', takeTest: false });
  assert.deepEqual(decodedPrompt(3, t), { text: 'Keep saving. Nothing stands out yet.', takeTest: false });
});

test('unseenFinding is the strongest one not opened yet', () => {
  const a = { id: 'a' } as Finding;
  const b = { id: 'b' } as Finding;
  assert.equal(unseenFinding([a, b], ['a']), b);
  assert.equal(unseenFinding([a, b], ['a', 'b']), null);
});

test('a finding sends its first vote; later taps only change this phone', () => {
  let r = nextVote({}, 'x', true);
  assert.equal(r.send, true);
  const v: DecodedVotes = markSent(r.votes, 'x');
  r = nextVote(v, 'x', false);
  assert.equal(r.send, false);
  assert.deepEqual(r.votes.x, { agree: false, sent: true });
});

test('a vote that failed to send goes out on the next tap', () => {
  assert.equal(nextVote({ x: { agree: true, sent: false } }, 'x', true).send, true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts`
Expected: FAIL, `neverFindings` (and the rest) is not exported.

- [ ] **Step 3: Implement** — in `lib/taste-decoded.ts` add `import { listGenres, type BlindTestSong } from './blind-test.ts';` to the imports, and append:

```ts
// ---------- Never, decoded ----------

export type NeverSong = DecodedSong & { liked: boolean };

/** The Blind Spot Test's never-songs that are fully measured. A genre the baselines left out gets null (placed against `all`). */
export function decodedNevers(songs: BlindTestSong[], feels: Record<number, SongFeel>, b: Baselines): NeverSong[] {
  return songs.flatMap((s) => {
    const feel = feels[s.trackId];
    if (!s.isNever || !isFullyMeasured(feel)) return [];
    const genre = songGenre([s.genre], b);
    return [{ id: s.trackId, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl, previewUrl: s.previewUrl, genre, feel, liked: s.liked }];
  });
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const MIN_GAP = 25;

/**
 * "You don't hate Country. You hate happy Country." — 2+ measured likes and 1+ measured skip among your
 * nevers, every like on one side of every skip, averages 25+ points apart. Or, when you liked all of them:
 * "…then liked all 5. Every one was instrumental." (4+ on one side).
 */
export function neverFindings(test: { never: string[]; songs: BlindTestSong[] }, feels: Record<number, SongFeel>, b: Baselines): Finding[] {
  const nevers = decodedNevers(test.songs, feels, b);
  const liked = nevers.filter((s) => s.liked);
  const skipped = nevers.filter((s) => !s.liked);
  const allNevers = test.songs.filter((s) => s.isNever);
  const genres = listGenres(test.never);
  const place = (s: DecodedSong, m: Measure) => position(s.feel[m], baselineFor(s.genre, b).cuts[m]);
  const evidence = (m: Measure) => nevers.map((song) => ({ song, position: place(song, m) }));
  const out: Finding[] = [];
  if (liked.length >= 2 && skipped.length >= 1) {
    for (const m of MEASURES) {
      const pl = liked.map((s) => place(s, m));
      const ps = skipped.map((s) => place(s, m));
      const split = Math.min(...pl) > Math.max(...ps) || Math.max(...pl) < Math.min(...ps);
      const gap = mean(pl) - mean(ps);
      if (!split || Math.abs(gap) < MIN_GAP) continue;
      const hated: Side = gap > 0 ? 'low' : 'high'; // the skipped songs' side
      out.push({
        id: findingId('never', genres, m, hated),
        kind: 'never',
        genre: genres,
        measure: m,
        side: hated,
        sentence: `You don't hate ${genres}. You hate ${SIDE_WORDS[m][hated]} ${genres}.`,
        evidence: evidence(m),
        strength: Math.abs(gap) / 100,
      });
    }
  } else if (allNevers.length > 0 && allNevers.every((s) => s.liked) && nevers.length >= 4) {
    for (const m of MEASURES) {
      const sides = nevers.map((s) => sideOf(place(s, m)));
      for (const side of ['low', 'high'] as const) {
        const k = sides.filter((x) => x === side).length;
        if (k < 4) continue;
        out.push({
          id: findingId('never-all', genres, m, side),
          kind: 'never-all',
          genre: genres,
          measure: m,
          side,
          sentence: `You said never ${genres}, then liked all ${allNevers.length}. ${k === nevers.length ? 'Every one was' : `${k} of ${nevers.length} were`} ${SIDE_WORDS[m][side]}.`,
          evidence: evidence(m),
          strength: k / nevers.length,
        });
      }
    }
  }
  return out;
}

// ---------- Everything together ----------

export type DecodeInput = {
  liked: DiscoveryTrack[];
  history: SwipeEntry[];
  feels: Record<number, SongFeel>;
  test: { never: string[]; songs?: BlindTestSong[] } | null;
};

const byStrength = (a: Finding, z: Finding) => z.strength - a.strength || z.evidence.length - a.evidence.length;

/** At most 3 findings, no two on the same measure; the strongest Never, decoded always leads. */
export function decodeTaste(input: DecodeInput, b: Baselines): Finding[] {
  const saves = decodedSaves(input.liked, input.history, input.feels, b);
  const never = input.test?.songs ? neverFindings({ never: input.test.never, songs: input.test.songs }, input.feels, b) : [];
  const ranked = [...never.sort(byStrength).slice(0, 1), ...[...genreFindings(saves, b), ...acrossFindings(saves, b)].sort(byStrength)];
  const out: Finding[] = [];
  for (const f of ranked) if (out.length < 3 && !out.some((o) => o.measure === f.measure)) out.push(f);
  return out;
}

/** What the Decoded line says before anything speaks. Counts saves, not measured saves, so it never asks for more while measuring catches up. */
export function decodedPrompt(saved: number, test: { songs?: BlindTestSong[] } | null): { text: string; takeTest: boolean } {
  if (!test?.songs) return { text: 'Take the Blind Spot Test to decode your nevers.', takeTest: true };
  if (saved < 3) {
    const n = 3 - saved;
    return { text: `Save ${n} more ${n === 1 ? 'song' : 'songs'} to decode your taste.`, takeTest: false };
  }
  return { text: 'Keep saving. Nothing stands out yet.', takeTest: false };
}

/** The strongest finding not opened on the Decoded page yet. */
export function unseenFinding(findings: Finding[], seen: string[]): Finding | null {
  return findings.find((f) => !seen.includes(f.id)) ?? null;
}

// ---------- Votes ----------

/** "Sounds like me" / "Nope" per finding id, and whether the first one reached the server. */
export type DecodedVotes = Record<string, { agree: boolean; sent: boolean }>;

/** Records a tap. Only a finding's first vote is sent; later taps change only what this phone shows. */
export function nextVote(votes: DecodedVotes, id: string, agree: boolean): { votes: DecodedVotes; send: boolean } {
  const sent = votes[id]?.sent ?? false;
  return { votes: { ...votes, [id]: { agree, sent } }, send: !sent };
}

export function markSent(votes: DecodedVotes, id: string): DecodedVotes {
  return votes[id] ? { ...votes, [id]: { ...votes[id], sent: true } } : votes;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test lib/taste-decoded.test.ts lib/blind-test.test.ts`
Expected: PASS, 31 + the blind-test tests.

- [ ] **Step 5: Commit**

```bash
git add lib/taste-decoded.ts lib/taste-decoded.test.ts
git commit -F - <<'EOF'
Taste Decoded: never findings, ranking, prompt and votes

"You don't hate Country. You hate happy Country." needs 2+ measured
likes and a measured skip among your nevers, every like on one side of
every skip, 25+ points apart; liking all 5 has its own sentence. The
strongest never finding leads, then up to 2 more, one per measure. The
prompt asks for the test first, then saves. Only a finding's first vote
is sent, and a failed send retries on the next tap.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Storage, votes table, Sunday reminder, the YOU dot

**Files:**
- Create: `hooks/use-taste-decoded.ts`, `supabase/decoded-votes.sql`
- Modify: `lib/discovery-storage.ts` (end of the Tasteform section), `lib/supabase.ts` (end), `lib/nudge-config.ts`, `lib/nudge-config.test.ts`, `lib/nudge.ts`, `app/_layout.tsx` (mount effect only; the route and the notification tap come in Task 7), `components/tab-bar.tsx` (~line 48-55), `app/blind-test.tsx` (the Task 3 `measureMissing` line)

**Interfaces:**
- Consumes: `decodeTaste`, `decodedPrompt`, `unseenFinding`, `nextVote`, `markSent`, `type Finding`, `type DecodedVotes` (Task 5); `useSongFeel`, `loadFeels`, `measureMissing` (Task 1); `assets/genre-sound.json` (Task 2 — **must exist**).
- Produces: `loadDecodedSeen`, `saveDecodedSeen`, `loadDecodedVotes`, `saveDecodedVotes` (storage); `sendDecodedVote(v: { kind: string; measure: string; side: string; agree: boolean }): Promise<boolean>`; `nudgeContent(unseen: { sentence: string } | null): { title: string; body: string; url: string }`; `setWeeklyNudge(content): Promise<void>`; `refreshDecodedNews(): Promise<void>`, `onDecodedNews(fn: () => void): () => void`, `useTasteDecoded(liked, history): { findings: Finding[]; prompt: { text: string; takeTest: boolean }; isNew: boolean; ready: boolean; votes: DecodedVotes; vote(f: Finding, agree: boolean): Promise<void>; markSeen(): Promise<void> }`.

- [ ] **Step 1: Confirm the baselines exist**

Run: `node -e "const b=require('./assets/genre-sound.json'); console.log(Object.keys(b.genres).length, b.all.n)"`
Expected: two numbers (about 37 and 1,100). If the file is missing, finish Task 2 Step 8 first.

- [ ] **Step 2: Write the failing test** — in `lib/nudge-config.test.ts` change the import to `import { NUDGE, nudgeContent } from './nudge-config.ts';` and append:

```ts
test('the reminder announces a finding nobody has opened, else keeps the Called it text', () => {
  assert.deepEqual(nudgeContent({ sentence: "You don't hate Country. You hate happy Country." }), {
    title: 'New finding about your taste',
    body: "You don't hate Country. You hate happy Country.",
    url: '/decoded',
  });
  assert.deepEqual(nudgeContent(null), { title: NUDGE.title, body: NUDGE.body, url: NUDGE.url });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --experimental-strip-types --test lib/nudge-config.test.ts`
Expected: FAIL, `nudgeContent` is not exported.

- [ ] **Step 4: Implement `nudgeContent`** — append to `lib/nudge-config.ts`:

```ts
/** What the weekly reminder says: a Taste Decoded finding they haven't opened beats the Called it text. */
export function nudgeContent(unseen: { sentence: string } | null): { title: string; body: string; url: string } {
  return unseen
    ? { title: 'New finding about your taste', body: unseen.sentence, url: '/decoded' }
    : { title: NUDGE.title, body: NUDGE.body, url: NUDGE.url };
}
```

Run: `node --experimental-strip-types --test lib/nudge-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Reschedule with new text** — append to `lib/nudge.ts`:

```ts
/**
 * Points the weekly reminder at new text. Only when notifications are already allowed: this never asks
 * (the ask stays with the first blind like, above). Cancel first, since Expo's docs don't promise that
 * reusing an id replaces the old one.
 */
export async function setWeeklyNudge(content: { title: string; body: string; url: string }): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const current = (await Notifications.getAllScheduledNotificationsAsync()).find((n) => n.identifier === NUDGE.id);
    if (current?.content.title === content.title && current?.content.body === content.body) return;
    await Notifications.cancelScheduledNotificationAsync(NUDGE.id);
    await Notifications.scheduleNotificationAsync({
      identifier: NUDGE.id,
      content: { title: content.title, body: content.body, data: { url: content.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...NUDGE.trigger },
    });
  } catch {
    // ignore
  }
}
```

- [ ] **Step 6: Storage** — in `lib/discovery-storage.ts` add `import type { DecodedVotes } from './taste-decoded';` with the type imports, and after `saveSongFeel` append:

```ts
// ---------- Taste Decoded ----------

const DECODED_SEEN_KEY = `${STORAGE_PREFIX}:decodedSeen`;
/** Finding ids already shown on the Decoded page; any other finding is new. */
export const loadDecodedSeen = () => readJson<string[]>(DECODED_SEEN_KEY, []);
export const saveDecodedSeen = (ids: string[]) => writeJson(DECODED_SEEN_KEY, ids);

const DECODED_VOTES_KEY = `${STORAGE_PREFIX}:decodedVotes`;
export const loadDecodedVotes = () => readJson<DecodedVotes>(DECODED_VOTES_KEY, {});
export const saveDecodedVotes = (votes: DecodedVotes) => writeJson(DECODED_VOTES_KEY, votes);
```

- [ ] **Step 7: The votes table** — create `supabase/decoded-votes.sql`:

```sql
-- Taste Decoded: "Sounds like me" / "Nope" on a finding, for the paper's
-- agreement rate. Anonymous on purpose: no device id, no user id, just the
-- kind of finding and the answer. Phones can only insert; the counts are
-- read with the server key (dashboard), never by the app.

create table decoded_votes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('never', 'never-all', 'genre', 'across')),
  measure text not null check (char_length(measure) between 1 and 20),
  side text not null check (side in ('low', 'high')),
  agree boolean not null,
  created_at timestamptz not null default now()
);

alter table decoded_votes enable row level security;
revoke all on decoded_votes from anon, authenticated;
grant insert (kind, measure, side, agree) on decoded_votes to anon;
create policy add_decoded_votes on decoded_votes for insert to anon with check (true);

create view decoded_vote_counts as
  select kind, measure, side,
    count(*) filter (where agree)::int as agree,
    count(*) filter (where not agree)::int as disagree
  from decoded_votes group by kind, measure, side;
revoke all on decoded_vote_counts from anon, authenticated;
```

Append to `lib/supabase.ts`:

```ts
/** One "Sounds like me" / "Nope" on a Taste Decoded finding (supabase/decoded-votes.sql). Anonymous: no device or user id. */
export async function sendDecodedVote(v: { kind: string; measure: string; side: string; agree: boolean }): Promise<boolean> {
  if (!URL_ROOT || !KEY) return false;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/decoded_votes`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(v),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 8: The hook** — create `hooks/use-taste-decoded.ts`:

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import baselinesRaw from '../assets/genre-sound.json' with { type: 'json' };
import { useSongFeel } from '@/hooks/use-song-feel';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import {
  loadBlindTest,
  loadDecodedSeen,
  loadDecodedVotes,
  loadLikedTracks,
  loadSwipeHistory,
  saveDecodedSeen,
  saveDecodedVotes,
  type BlindTestResult,
} from '@/lib/discovery-storage';
import type { Baselines } from '@/lib/genre-sound';
import { setWeeklyNudge } from '@/lib/nudge';
import { nudgeContent } from '@/lib/nudge-config';
import { loadFeels } from '@/lib/song-feel-api';
import { sendDecodedVote } from '@/lib/supabase';
import { decodedPrompt, decodeTaste, markSent, nextVote, unseenFinding, type DecodedVotes, type Finding } from '@/lib/taste-decoded';

const BASELINES = baselinesRaw as Baselines;

// The YOU tab's red dot (components/tab-bar.tsx) listens here. Sticky, so a
// tab bar that mounts after the app-start check still hears about it.
const newsListeners = new Set<() => void>();
let hasNews = false;

export function onDecodedNews(fn: () => void): () => void {
  newsListeners.add(fn);
  if (hasNews) fn();
  return () => {
    newsListeners.delete(fn);
  };
}

/** Recompute from storage; light the YOU dot for a finding nobody has opened; point the Sunday reminder at it. App start and after the Blind Spot Test. */
export async function refreshDecodedNews(): Promise<void> {
  const [liked, history, feels, test, seen] = await Promise.all([loadLikedTracks(), loadSwipeHistory(), loadFeels(), loadBlindTest(), loadDecodedSeen()]);
  const unseen = unseenFinding(decodeTaste({ liked, history, feels, test }, BASELINES), seen);
  hasNews = unseen != null;
  if (hasNews) newsListeners.forEach((fn) => fn());
  await setWeeklyNudge(nudgeContent(unseen));
}

/** Findings for the You tab and the Decoded page. Measures saves that still need it, sharing the Tasteform's cache. */
export function useTasteDecoded(liked: DiscoveryTrack[], history: SwipeEntry[]) {
  const feels = useSongFeel(liked);
  const [test, setTest] = useState<BlindTestResult | null>(null);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [votes, setVotes] = useState<DecodedVotes>({});

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadBlindTest(), loadDecodedSeen(), loadDecodedVotes()]).then(([t, s, v]) => {
        if (cancelled) return;
        setTest(t);
        setSeen(s);
        setVotes(v);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const findings = useMemo(() => decodeTaste({ liked, history, feels, test }, BASELINES), [liked, history, feels, test]);
  const unseen = seen ? unseenFinding(findings, seen) : null;

  // Keep the Sunday reminder in step with what's on screen.
  const unseenId = unseen?.id ?? null;
  useEffect(() => {
    if (seen) setWeeklyNudge(nudgeContent(unseen));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the unseen finding changes, not its object
  }, [unseenId, seen != null]);

  async function markSeen() {
    const ids = [...new Set([...(seen ?? []), ...findings.map((f) => f.id)])];
    setSeen(ids);
    hasNews = false;
    await saveDecodedSeen(ids);
  }

  async function vote(f: Finding, agree: boolean) {
    const next = nextVote(votes, f.id, agree);
    setVotes(next.votes);
    await saveDecodedVotes(next.votes);
    if (!next.send) return;
    if (await sendDecodedVote({ kind: f.kind, measure: f.measure, side: f.side, agree })) {
      const marked = markSent(next.votes, f.id);
      setVotes(marked);
      await saveDecodedVotes(marked);
    }
  }

  return {
    findings,
    prompt: decodedPrompt(liked.length, test),
    isNew: !!findings[0] && !!seen && !seen.includes(findings[0].id),
    ready: seen != null,
    votes,
    vote,
    markSeen,
  };
}
```

- [ ] **Step 9: Wire it up**

`app/_layout.tsx`: add `import { refreshDecodedNews } from '@/hooks/use-taste-decoded';`. In the mount effect, after `startTwinSync();` add `refreshDecodedNews(); // the YOU dot and Sunday reminder for a finding nobody has opened`.

`components/tab-bar.tsx`: add `import { onDecodedNews } from '@/hooks/use-taste-decoded';` and, right after the `onSaveLanded` effect, add:

```ts
  // A Taste Decoded finding nobody has opened lights the same dot (hooks/use-taste-decoded.ts).
  useEffect(() => onDecodedNews(() => setUnseen(true)), []);
```

`app/blind-test.tsx`: add `import { refreshDecodedNews } from '@/hooks/use-taste-decoded';` and change the Task 3 line to:

```ts
      measureMissing(items.map((x) => ({ id: x.song.itunesTrackId, previewUrl: x.song.previewUrl }))).then(refreshDecodedNews);
```

- [ ] **Step 10: Check**

Run: `npx tsc --noEmit && npm run lint && node --experimental-strip-types --test lib/nudge-config.test.ts lib/taste-decoded.test.ts`
Expected: clean, all pass.

- [ ] **Step 11: Commit**

```bash
git add hooks/use-taste-decoded.ts supabase/decoded-votes.sql lib/discovery-storage.ts lib/supabase.ts lib/nudge-config.ts lib/nudge-config.test.ts lib/nudge.ts app/_layout.tsx components/tab-bar.tsx app/blind-test.tsx
git commit -F - <<'EOF'
Taste Decoded: Sunday reminder, YOU dot, votes and seen findings

A finding nobody has opened lights the YOU dot (at app start and after
the Blind Spot Test) and turns the existing Sunday 6pm reminder into
"New finding about your taste" with the sentence itself. It
reschedules only when notifications are already allowed. Votes go to an insert-only, anonymous table
(supabase/decoded-votes.sql, to run in the dashboard).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 12: Tell the user** to paste `supabase/decoded-votes.sql` into the Supabase dashboard's SQL editor and run it. Until then votes fail quietly and retry on the next tap.

---

### Task 7: The Decoded page and the share card

**Files:**
- Create: `components/decoded/finding-card.tsx`, `components/decoded/share-card.tsx`, `app/decoded.tsx`
- Modify: `app/_layout.tsx` (Stack screens ~line 113, notification response listener ~line 57-63)
- Regenerated: `.expo/types/router.d.ts` (typed routes; not committed)

**Interfaces:**
- Consumes: `useTasteDecoded` (Task 6); `type Finding`, `type DecodedSong`, `SIDE_WORDS` (Tasks 1, 4); `artworkUrl(url: string, size: number)` (lib/discovery.ts); `usePlayback()` → `{ player, status }`.
- Produces: the `/decoded` route, known to typed routes.

- [ ] **Step 1: Create `components/decoded/finding-card.tsx`**

```tsx
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { SIDE_WORDS, type DecodedSong, type Finding } from '@/lib/taste-decoded';

const COVER = 36;

type Props = {
  index: number;
  finding: Finding;
  vote: boolean | undefined;
  playingId: number | null;
  onPlay: (song: DecodedSong) => void;
  onVote: (agree: boolean) => void;
};

/** One finding: the sentence, a bar with the genre's normal shaded and your songs sliding out to where they sit, and the vote. */
export function FindingCard({ index, finding, vote, playingId, onPlay, onVote }: Props) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (width) progress.set(withSpring(1, { damping: 14, stiffness: 90 }));
  }, [width, progress]);
  const words = SIDE_WORDS[finding.measure];
  const n = finding.evidence.length;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.number}>{String(index + 1).padStart(2, '0')}</ThemedText>
      <ThemedText style={styles.sentence}>{finding.sentence}</ThemedText>
      <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <View style={styles.normal} />
        {width > 0 &&
          finding.evidence.map((e, i) => (
            <Cover
              key={e.song.id}
              song={e.song}
              x={(e.position / 100) * width}
              center={width / 2}
              row={i % 2}
              progress={progress}
              playing={playingId === e.song.id}
              onPress={() => onPlay(e.song)}
            />
          ))}
      </View>
      <View style={styles.ends}>
        <ThemedText style={styles.end}>{words.low}</ThemedText>
        <ThemedText style={styles.end}>{words.high}</ThemedText>
      </View>
      <ThemedText style={styles.based}>
        Based on {n} {n === 1 ? 'song' : 'songs'}
      </ThemedText>
      <View style={styles.votes}>
        <VoteButton label="Sounds like me" on={vote === true} onPress={() => onVote(true)} />
        <VoteButton label="Nope" on={vote === false} onPress={() => onVote(false)} />
      </View>
    </View>
  );
}

function Cover(props: {
  song: DecodedSong;
  x: number;
  center: number;
  row: number;
  progress: SharedValue<number>;
  playing: boolean;
  onPress: () => void;
}) {
  const { song, x, center, row, progress, playing, onPress } = props;
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: center + (x - center) * progress.get() - COVER / 2 }] }));
  return (
    <Animated.View style={[styles.cover, { top: row * Math.round(COVER * 0.6) }, slide]}>
      <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Play ${song.title} by ${song.artist}`}>
        <Image source={{ uri: artworkUrl(song.artworkUrl, 100) }} style={[styles.art, playing && styles.playing]} />
      </Pressable>
    </Animated.View>
  );
}

function VoteButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[Ui.outlineButton, on && styles.voteOn]}>
      <ThemedText style={styles.voteText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm, paddingVertical: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.rule },
  number: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textTertiary },
  sentence: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 28, color: Colors.text },
  bar: { height: COVER + Math.round(COVER * 0.6), marginTop: Spacing.sm },
  track: { position: 'absolute', left: 0, right: 0, top: 28, height: 2, backgroundColor: Colors.rule },
  normal: { position: 'absolute', left: '25%', width: '50%', top: 21, height: 16, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  cover: { position: 'absolute', left: 0 },
  art: { width: COVER, height: COVER, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.hairline },
  playing: { borderWidth: 2, borderColor: Colors.text },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { ...Ui.label, color: Colors.textSecondary },
  based: { fontSize: 13, color: Colors.textTertiary },
  votes: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  voteOn: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.text },
  voteText: { ...Ui.label },
});
```

- [ ] **Step 2: Create `components/decoded/share-card.tsx`**

```tsx
import { Image } from 'expo-image';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import type { Finding } from '@/lib/taste-decoded';

/** What "Share my taste" sends, shown as-is above the button: the top finding, up to 3 covers, and where it came from. */
export function ShareCard({ cardRef, finding }: { cardRef: RefObject<View | null>; finding: Finding }) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <View ref={cardRef} collapsable={false} style={styles.card}>
      <ThemedText style={styles.eyebrow}>My taste, decoded</ThemedText>
      <ThemedText style={styles.sentence}>{finding.sentence}</ThemedText>
      <View style={styles.covers}>
        {finding.evidence.slice(0, 3).map((e) => (
          <Image key={e.song.id} source={{ uri: artworkUrl(e.song.artworkUrl, 300) }} style={styles.cover} />
        ))}
      </View>
      <ThemedText style={styles.foot}>Decoded by Blindspot · {date}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.background,
  },
  eyebrow: { ...Ui.label, color: Colors.textSecondary },
  sentence: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34, color: Colors.text },
  covers: { flexDirection: 'row', gap: Spacing.sm },
  cover: { width: 72, height: 72, borderRadius: Radius.sm },
  foot: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary },
});
```

- [ ] **Step 3: Create `app/decoded.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { FindingCard } from '@/components/decoded/finding-card';
import { ShareCard } from '@/components/decoded/share-card';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTasteDecoded } from '@/hooks/use-taste-decoded';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import type { DecodedSong } from '@/lib/taste-decoded';

/** Taste Decoded: up to 3 findings, each with the songs behind it, a vote, and a card to share. */
export default function DecodedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [liked, setLiked] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadLikedTracks(), loadSwipeHistory()]).then(([l, h]) => {
        if (cancelled) return;
        setLiked(l);
        setHistory(h);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  const decoded = useTasteDecoded(liked, history);
  const { findings, ready, markSeen } = decoded;

  // Opening the page is what makes a finding no longer new.
  const shown = findings.map((f) => f.id).join('|');
  useEffect(() => {
    if (ready && shown) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per set of findings shown
  }, [ready, shown]);

  // Tap a cover to hear it; leaving the page stops it.
  const { player, status } = usePlayback();
  const [playingId, setPlayingId] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setPlayingId(null);
      };
    }, [player])
  );
  function play(song: DecodedSong) {
    if (playingId === song.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setPlayingId(song.id);
    if (!song.previewUrl) return;
    player.replace(song.previewUrl);
    player.play();
  }

  const cardRef = useRef<View>(null);
  const [note, setNote] = useState<string | null>(null);
  async function share() {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your taste' });
    } catch {
      setNote('Couldn’t open sharing. Try again.');
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={[Ui.textButton, styles.back]}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
        <ThemedText type="eyebrow">Blindspot · your taste</ThemedText>
        <ThemedText type="hero">Decoded</ThemedText>
        {ready && findings.length === 0 && <ThemedText style={styles.dim}>{decoded.prompt.text}</ThemedText>}
        {findings.map((f, i) => (
          <FindingCard
            key={f.id}
            index={i}
            finding={f}
            vote={decoded.votes[f.id]?.agree}
            playingId={status.playing ? playingId : null}
            onPlay={play}
            onVote={(agree) => decoded.vote(f, agree)}
          />
        ))}
        {findings[0] && (
          <>
            <ShareCard cardRef={cardRef} finding={findings[0]} />
            <PressableScale onPress={share} style={styles.cta}>
              <ThemedText style={styles.ctaText}>Share my taste</ThemedText>
            </PressableScale>
            {note && <ThemedText style={styles.dim}>{note}</ThemedText>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  back: { marginLeft: Spacing.sm },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  dim: { color: Colors.textSecondary },
  cta: {
    minHeight: 52,
    marginTop: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...Ui.label, color: Colors.accentText },
});
```

- [ ] **Step 4: Register the route and the reminder's tap** — in `app/_layout.tsx`, after `<Stack.Screen name="art" options={{ headerShown: false }} />` add:

```tsx
            <Stack.Screen name="decoded" options={{ headerShown: false }} />
```

Replace the comment `// Tapping the weekly "Called it" reminder opens the Liked list.` with `// Tapping the weekly reminder opens the Liked list, or the Decoded page when it announced a finding.` and the listener body `if (response.notification.request.content.data?.url === '/modal') router.push('/modal');` with:

```ts
      const url = response.notification.request.content.data?.url;
      if (url === '/modal' || url === '/decoded') router.push(url);
```

- [ ] **Step 5: Regenerate typed routes** — `.expo/types/router.d.ts` only updates when the dev server starts. Run `npx expo start --port 8090` in the background, wait until `grep -c "/decoded" .expo/types/router.d.ts` prints at least 1 (about 20 seconds), then stop the server.

- [ ] **Step 6: Check**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/decoded/finding-card.tsx components/decoded/share-card.tsx app/decoded.tsx app/_layout.tsx
git commit -F - <<'EOF'
Taste Decoded: the Decoded page and share card

Up to 3 findings, each with a bar: the genre's normal shaded, your
songs sliding out from the middle to where they sit, tap one to hear
it. "Sounds like me" / "Nope" under each, and the share card shown
right above "Share my taste", so what you see is what gets sent.
Opening the page marks the findings as seen, and the Sunday reminder
opens it when it announced a finding.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: The Decoded line on the You tab

**Files:**
- Create: `components/decoded/decoded-line.tsx`
- Modify: `app/(tabs)/explore.tsx` (imports; hooks near the top of `ProfileScreen`; right after `<Tasteform … />`)

**Interfaces:**
- Consumes: `useTasteDecoded` (Task 6), `type Finding` (Task 4), the `/decoded` route (Task 7).
- Produces: `DecodedLine({ finding: Finding | null; prompt: { text: string; takeTest: boolean }; isNew: boolean })`.

- [ ] **Step 1: Create `components/decoded/decoded-line.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Ui } from '@/constants/theme';
import type { Finding } from '@/lib/taste-decoded';

type Props = { finding: Finding | null; prompt: { text: string; takeTest: boolean }; isNew: boolean };

/** Under the Tasteform: the strongest finding in one line (the whole row opens the Decoded page), or what it still needs. */
export function DecodedLine({ finding, prompt, isNew }: Props) {
  const router = useRouter();
  const onPress = finding ? () => router.push('/decoded') : prompt.takeTest ? () => router.push('/blind-test') : undefined;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} style={styles.row}>
      <View style={styles.text}>
        <ThemedText style={styles.label}>Decoded</ThemedText>
        <Animated.View key={finding?.id ?? prompt.text} entering={isNew ? FadeIn.duration(700) : undefined}>
          <ThemedText style={finding ? styles.sentence : styles.prompt}>{finding ? finding.sentence : prompt.text}</ThemedText>
        </Animated.View>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 64,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.rule,
  },
  text: { flex: 1, gap: Spacing.xs },
  label: { ...Ui.label, color: Colors.textSecondary },
  sentence: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  prompt: { color: Colors.textSecondary },
});
```

- [ ] **Step 2: Put it under the Tasteform** — in `app/(tabs)/explore.tsx` add the imports:

```ts
import { DecodedLine } from '@/components/decoded/decoded-line';
import { useTasteDecoded } from '@/hooks/use-taste-decoded';
```

After `const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });` add (before any early return, so hook order never changes):

```ts
  const decoded = useTasteDecoded(finds, history);
```

Right after the closing `/>` of `<Tasteform … />` add:

```tsx
              {decoded.ready && <DecodedLine finding={decoded.findings[0] ?? null} prompt={decoded.prompt} isNew={decoded.isNew} />}
```

- [ ] **Step 3: Check**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/decoded/decoded-line.tsx "app/(tabs)/explore.tsx"
git commit -F - <<'EOF'
Taste Decoded: the Decoded line under the Tasteform

One line on the You tab: your strongest finding, which opens the
Decoded page, or what it still needs ("Take the Blind Spot Test to
decode your nevers" opens the test). A new finding fades in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Verify on a phone, then the changelog

**Files:**
- Modify: `changelog.md` (top of Entries), `CLAUDE.md` (Architecture: Profile tab bullet)

- [ ] **Step 1: Everything green**

Run: `node --experimental-strip-types --test lib/*.test.ts && npx tsc --noEmit && npm run lint`
Expected: all tests pass, no type or lint errors.

- [ ] **Step 2: Publish a test update** (the recipe that works on this Mac; never to branch `preview`):

```bash
rm -rf dist && npx expo export -p ios -p android && EAS_SKIP_AUTO_FINGERPRINT=1 npx eas update --branch expo-go --environment preview --skip-bundler --input-dir dist --non-interactive --message "Taste Decoded test"
```

Expected: an update group id. Give the user `exp://u.expo.dev/<projectId>/group/<groupId>` and a QR PNG on the Desktop.

- [ ] **Step 3: Phone checklist** (with the user, or report each as not checked):
  1. You tab, no test taken: the line says "Take the Blind Spot Test to decode your nevers." and opens the test.
  2. Take the test liking 2–3 "never" songs with a clear feel; back on You within a minute: the YOU dot is on, the line fades in with a finding, and it opens the Decoded page.
  3. Decoded page: covers slide from the middle to their spots; tapping one plays it; "Based on N songs" is right.
  4. Vote "Sounds like me": after the SQL ran, a row shows up in `decoded_votes`.
  5. "Share my taste" opens the share sheet with the card.
  6. Unsave one evidence song: the finding updates or goes away.

- [ ] **Step 4: Changelog and CLAUDE.md** — at the top of `changelog.md`'s Entries add:

```markdown
## [2026-10-0X] Taste Decoded: one honest sentence about your taste
The You tab now says what your saves have in common, against what each genre normally sounds like:
"You don't hate Country. You hate happy Country." Tap it for the Decoded page: up to 3 findings, each with
your songs on a bar against the genre's normal, a vote ("Sounds like me" / "Nope", counted anonymously for
the paper) and a share card. A finding you haven't opened lights the YOU dot and becomes the Sunday
reminder. Baselines: 30 measured songs per genre (`npm run measure-genre-sound`). The Blind Spot Test now
keeps its songs, and every swipe keeps its audio link for skip findings later.
```

(with the real date), and in `CLAUDE.md`'s Profile tab bullet, after the Tasteform sentence, add: `Under it, the **Decoded** line (Taste Decoded: pure findings in lib/taste-decoded.ts against assets/genre-sound.json, hook hooks/use-taste-decoded.ts, page app/decoded.tsx; spec docs/superpowers/specs/2026-10-02-taste-decoded-design.md).`

- [ ] **Step 5: Commit**

```bash
git add changelog.md CLAUDE.md
git commit -F - <<'EOF'
Taste Decoded: changelog and CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Leave the branch unmerged; merging into `main` is the user's call.
