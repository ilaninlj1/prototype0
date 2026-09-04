# Swipe-Based Music Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home tab's ten-track blind quiz with a continuous, Tinder-style swipe feed for music discovery, built on the iTunes Search API and `expo-audio`, with card physics via `react-native-gesture-handler` + `react-native-reanimated`.

**Architecture:** A new `lib/discovery.ts` (pure logic + iTunes fetch) and `lib/discovery-storage.ts` (AsyncStorage persistence) drive a queue/strategy engine; `app/(tabs)/index.tsx` owns the queue/strategy state and the single audio player, rendering a new `components/discovery/` card stack. `lib/taste-test.ts` and `app/(tabs)/explore.tsx` (Profile tab) are untouched.

**Tech Stack:** Expo Router v6 / React Native 0.81 / React 19, `expo-audio`, `expo-image`, `@react-native-async-storage/async-storage`, `react-native-gesture-handler` ~2.28, `react-native-reanimated` ~4.1 — all already installed, no new dependencies. Automated tests use Node's built-in test runner (`node --test`, which type-strips `.ts` directly on this project's Node 24 — no test framework installed or needed) for every pure function; anything touching AsyncStorage, live network, or React Native rendering is verified manually in the running Expo app, matching this repo's existing convention (no test runner is configured, per `CLAUDE.md`).

**Spec:** `docs/superpowers/specs/2026-09-04-swipe-discovery-design.md`

## Global Constraints

- Keep using the iTunes Search API and `expo-audio` — no alternative data source or audio library.
- Card physics must use `react-native-gesture-handler` + `react-native-reanimated` (drag-follow and Tinder-style tilt), not a pre-built swipe-deck library.
- Reuse the existing theming primitives (`ThemedText`, `ThemedView`, `constants/theme.ts`, `hooks/use-theme-color.ts`) for all new UI — no new styling system.
- Do not modify `app/(tabs)/explore.tsx` (Profile tab) or `lib/taste-test.ts` (types, constants, storage keys, or exported functions) in any task.
- `lib/discovery.ts` must import nothing from `lib/taste-test.ts` and nothing that pulls in a React Native native module (this is what keeps its pure functions runnable under plain `node --test`); the only permitted bridge between the two features is `app/(tabs)/index.tsx` importing `GENRES` from `lib/taste-test.ts` and passing it as a plain argument into `lib/discovery.ts` functions.
- New persisted state lives under its own AsyncStorage key prefix, `blindspotDiscovery:*`, distinct from the quiz's `blindTasteTest:*` keys.
- No hand-curated sub-genre taxonomy anywhere — genre relatedness is a plain case-insensitive substring check; the discovered-genre catalog is built purely from `primaryGenreName` values iTunes actually returns.
- Queue target depth is 3 (current card + 2 buffered ahead); never block showing an already-buffered card on a user choice.
- After every task, run `npx tsc --noEmit` from the project root and confirm no errors before moving on.
- Any plain function called directly (not via `runOnJS`) from inside a Reanimated worklet (a `Gesture.Pan()` handler, `useAnimatedStyle`, etc.) must start with a `'worklet';` directive as its first statement — `resolveSwipeDirection` and `rotationForDrag` in `components/discovery/swipe-physics.ts` both need this (added retroactively to Task 7's code below after Task 8's review caught the omission; the directive is inert under plain `node --test`, so it doesn't affect that file's existing tests).
- Every `*.test.ts` file's relative imports of local `.ts` modules must include the explicit `.ts` extension (e.g. `from './discovery.ts'`) — `node --test` treats a file containing `import` syntax as ESM regardless of `package.json`, and ESM resolution (unlike CommonJS) doesn't infer extensions. This needs `tsconfig.json`'s `compilerOptions.allowImportingTsExtensions: true` (added in Task 1) so `tsc --noEmit` accepts it too — that flag is genuinely required and stays. **Do not add `"type": "module"` to `package.json`** to solve this or anything else: it isn't needed for `node --test` and it breaks this repo's existing CommonJS-style Node-executed scripts (`scripts/reset-project.js`, `eslint.config.js`). Regular `.ts`/`.tsx` source files consumed by Metro/Expo (everything outside a `*.test.ts` file) keep their existing extensionless import style — do not add `.ts` extensions there.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/discovery.ts` (new) | Types, pure track/genre helpers, iTunes fetch + parsing, queue/strategy engine (`refillQueue`). Zero AsyncStorage import — this is what makes it unit-testable under plain `node --test`. |
| `lib/discovery.test.ts` (new) | `node:test` coverage for every pure function in `discovery.ts`. |
| `lib/discovery-storage.ts` (new) | AsyncStorage persistence for swipe history and the discovered-genres catalog. Split out from `discovery.ts` specifically so importing it (which pulls in the AsyncStorage native module and is non-functional outside a React Native runtime) never breaks the automated tests. Manually verified in-app, mirroring `lib/taste-test.ts`'s untested persistence functions. |
| `components/discovery/swipe-physics.ts` (new) | Pure gesture-decision math (commit direction, tilt angle) — no React/JSX, so it's independently unit-testable. |
| `components/discovery/swipe-physics.test.ts` (new) | `node:test` coverage for `swipe-physics.ts`. |
| `components/discovery/swipe-card.tsx` (new) | `CardFace` (presentational) and `SwipeCard` (draggable, gesture-driven) components. |
| `components/discovery/card-stack.tsx` (new) | Renders up to 3 queued tracks: the top one interactive via `SwipeCard`, the rest static via `CardFace`. |
| `components/discovery/action-overlay.tsx` (new) | The post-"like" "More from this artist" / "More like this sound" buttons with their auto-fade. |
| `app/(tabs)/index.tsx` (rewritten) | Owns queue/strategy/history state and the single `useAudioPlayer` instance; renders the card stack and action overlay. |
| `CLAUDE.md` (modified) | Architecture section updated to describe the new Home tab flow. |
| `changelog.md` (modified) | New entry for this feature. |

---

## Task 1: Discovery types and pure track/history helpers

**Files:**
- Create: `lib/discovery.ts`
- Create: `lib/discovery.test.ts`
- Modify: `tsconfig.json` (add one compiler option — see Step 0 below)

**Interfaces:**
- Produces: `DiscoveryTrack`, `SwipeAction`, `SwipeEntry`, `Strategy` types; `dedupeDiscoveryTracks(tracks: DiscoveryTrack[]): DiscoveryTrack[]`; `extractGenres(tracks: DiscoveryTrack[]): string[]`; `mergeDiscoveredGenres(existing: string[], found: string[]): string[]`; `isGenreRelated(searchTerm: string, trackGenre: string): boolean`; `deriveSeenTrackIds(history: SwipeEntry[]): Set<number>`; `deriveVisitedArtistIds(history: SwipeEntry[]): Set<number>`; `deriveGenresHeard(history: SwipeEntry[]): Set<string>`; `pickJumpGenre(discoveredGenres: string[], genresHeard: Set<string>, allGenres: string[], history: SwipeEntry[]): string`.

- [ ] **Step 0: Allow `.ts`-extension imports in `tsconfig.json`**

Test files under `node --test` need an explicit `.ts` extension on relative imports (see Global Constraints) — add the one compiler option that lets `tsc --noEmit` accept that. In `tsconfig.json`, add `"allowImportingTsExtensions": true` alongside the existing `"strict": true`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "allowImportingTsExtensions": true,
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

Do not touch `package.json` in this or any task — see Global Constraints.

- [ ] **Step 1: Write the failing tests**

Create `lib/discovery.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeDiscoveryTracks,
  extractGenres,
  mergeDiscoveredGenres,
  isGenreRelated,
  deriveSeenTrackIds,
  deriveVisitedArtistIds,
  deriveGenresHeard,
  pickJumpGenre,
  type DiscoveryTrack,
  type SwipeEntry,
} from './discovery.ts';

function track(overrides: Partial<DiscoveryTrack>): DiscoveryTrack {
  return {
    id: 1,
    trackName: 'Track',
    artistId: 10,
    artistName: 'Artist',
    artworkUrl100: 'https://example.com/art.jpg',
    primaryGenreName: 'Rock',
    previewUrl: 'https://example.com/preview.m4a',
    ...overrides,
  };
}

test('dedupeDiscoveryTracks keeps the first occurrence of each id', () => {
  const tracks = [
    track({ id: 1, trackName: 'A' }),
    track({ id: 1, trackName: 'B' }),
    track({ id: 2 }),
  ];
  const result = dedupeDiscoveryTracks(tracks);
  assert.equal(result.length, 2);
  assert.equal(result[0].trackName, 'A');
});

test('extractGenres returns distinct genres in first-seen order', () => {
  const tracks = [
    track({ id: 1, primaryGenreName: 'Rock' }),
    track({ id: 2, primaryGenreName: 'Pop' }),
    track({ id: 3, primaryGenreName: 'Rock' }),
  ];
  assert.deepEqual(extractGenres(tracks), ['Rock', 'Pop']);
});

test('mergeDiscoveredGenres appends only new genres, preserving order', () => {
  const result = mergeDiscoveredGenres(['Rock', 'Pop'], ['Pop', 'Jazz']);
  assert.deepEqual(result, ['Rock', 'Pop', 'Jazz']);
});

test('mergeDiscoveredGenres returns the same array reference when nothing new', () => {
  const existing = ['Rock'];
  assert.equal(mergeDiscoveredGenres(existing, ['Rock']), existing);
});

test('isGenreRelated matches substrings in either direction, case-insensitively', () => {
  assert.equal(isGenreRelated('Hip-Hop', 'Hip-Hop/Rap'), true);
  assert.equal(isGenreRelated('rock', 'Alternative Rock'), true);
  assert.equal(isGenreRelated('Jazz', 'Pop'), false);
});

test('isGenreRelated rejects empty terms', () => {
  assert.equal(isGenreRelated('', 'Rock'), false);
  assert.equal(isGenreRelated('Rock', ''), false);
});

test('derive* helpers collect distinct values from swipe history', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 10, genre: 'Rock', action: 'skip', timestamp: 1 },
    { trackId: 2, artistId: 10, genre: 'Rock', action: 'like', timestamp: 2 },
    { trackId: 3, artistId: 20, genre: 'Pop', action: 'genre-jump', timestamp: 3 },
  ];
  assert.deepEqual(deriveSeenTrackIds(history), new Set([1, 2, 3]));
  assert.deepEqual(deriveVisitedArtistIds(history), new Set([10, 20]));
  assert.deepEqual(deriveGenresHeard(history), new Set(['Rock', 'Pop']));
});

test('pickJumpGenre prefers an unexplored discovered genre', () => {
  const genre = pickJumpGenre(['Rock', 'Jazz'], new Set(['Rock']), ['Rock', 'Pop'], []);
  assert.equal(genre, 'Jazz');
});

test('pickJumpGenre falls back to allGenres when nothing discovered is unexplored', () => {
  const genre = pickJumpGenre(['Rock'], new Set(['Rock']), ['Rock', 'Pop'], []);
  assert.equal(genre, 'Pop');
});

test('pickJumpGenre falls back to the least-recently-heard genre once everything is explored', () => {
  const history: SwipeEntry[] = [
    { trackId: 1, artistId: 1, genre: 'Rock', action: 'skip', timestamp: 100 },
    { trackId: 2, artistId: 1, genre: 'Pop', action: 'skip', timestamp: 50 },
  ];
  const genre = pickJumpGenre(['Rock'], new Set(['Rock', 'Pop']), ['Rock', 'Pop'], history);
  assert.equal(genre, 'Pop'); // heard longer ago than Rock
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/discovery.test.ts`
Expected: FAIL — `lib/discovery.ts` doesn't exist yet, so the import fails.

- [ ] **Step 3: Write the implementation**

Create `lib/discovery.ts`:

```ts
// ---------- Types ----------

export type DiscoveryTrack = {
  id: number;
  trackName: string;
  artistId: number;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
};

export type SwipeAction = 'skip' | 'like' | 'genre-jump';

export type SwipeEntry = {
  trackId: number;
  artistId: number;
  genre: string;
  action: SwipeAction;
  timestamp: number;
};

export type Strategy =
  | { type: 'genre'; genre: string }
  | { type: 'artist'; artistId: number; artistName: string };

// ---------- Pure track helpers ----------

export function dedupeDiscoveryTracks(tracks: DiscoveryTrack[]): DiscoveryTrack[] {
  const map = new Map<number, DiscoveryTrack>();
  for (const t of tracks) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values());
}

/** Distinct primaryGenreName values among tracks, in first-seen order. */
export function extractGenres(tracks: DiscoveryTrack[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tracks) {
    if (!seen.has(t.primaryGenreName)) {
      seen.add(t.primaryGenreName);
      out.push(t.primaryGenreName);
    }
  }
  return out;
}

/** Appends any genres in `found` not already in `existing`, preserving `existing`'s order. */
export function mergeDiscoveredGenres(existing: string[], found: string[]): string[] {
  const known = new Set(existing);
  const additions = found.filter((g) => !known.has(g));
  return additions.length > 0 ? [...existing, ...additions] : existing;
}

/** Case-insensitive substring relation, either direction — no external genre taxonomy. */
export function isGenreRelated(searchTerm: string, trackGenre: string): boolean {
  const a = searchTerm.trim().toLowerCase();
  const b = trackGenre.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// ---------- Derive sets from swipe history ----------

export function deriveSeenTrackIds(history: SwipeEntry[]): Set<number> {
  return new Set(history.map((e) => e.trackId));
}

export function deriveVisitedArtistIds(history: SwipeEntry[]): Set<number> {
  return new Set(history.map((e) => e.artistId));
}

export function deriveGenresHeard(history: SwipeEntry[]): Set<string> {
  return new Set(history.map((e) => e.genre));
}

// ---------- Genre-jump selection ----------

/**
 * Picks the genre for a swipe-down "jump", in priority order:
 * 1. Random from discoveredGenres not yet heard.
 * 2. Random from allGenres not yet heard.
 * 3. The least-recently-heard genre across discoveredGenres ∪ allGenres (by most
 *    recent occurrence in history), once everything has been heard.
 */
export function pickJumpGenre(
  discoveredGenres: string[],
  genresHeard: Set<string>,
  allGenres: string[],
  history: SwipeEntry[]
): string {
  const unexploredDiscovered = discoveredGenres.filter((g) => !genresHeard.has(g));
  if (unexploredDiscovered.length > 0) {
    return unexploredDiscovered[Math.floor(Math.random() * unexploredDiscovered.length)];
  }

  const unexploredBroad = allGenres.filter((g) => !genresHeard.has(g));
  if (unexploredBroad.length > 0) {
    return unexploredBroad[Math.floor(Math.random() * unexploredBroad.length)];
  }

  const pool = Array.from(new Set([...discoveredGenres, ...allGenres]));
  if (pool.length === 0) {
    throw new Error('pickJumpGenre: no genres available');
  }

  let leastRecent = pool[0];
  let leastRecentAt = Infinity;
  for (const genre of pool) {
    let lastHeardAt = -Infinity;
    for (const entry of history) {
      if (entry.genre === genre && entry.timestamp > lastHeardAt) {
        lastHeardAt = entry.timestamp;
      }
    }
    if (lastHeardAt < leastRecentAt) {
      leastRecentAt = lastHeardAt;
      leastRecent = genre;
    }
  }
  return leastRecent;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/discovery.test.ts`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery.ts lib/discovery.test.ts
git commit -m "Add discovery types and pure track/history helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 2: iTunes fetch and response parsing

**Files:**
- Modify: `lib/discovery.ts` (append)
- Modify: `lib/discovery.test.ts` (append)

**Interfaces:**
- Consumes: `DiscoveryTrack`, `Strategy`, `isGenreRelated` (Task 1).
- Produces: `parseGenreSearchResponse(json: unknown, searchedGenre: string): DiscoveryTrack[]`; `parseArtistLookupResponse(json: unknown): DiscoveryTrack[]`; `fetchTracksByGenre(genre: string): Promise<DiscoveryTrack[]>`; `fetchTracksByArtist(artistId: number): Promise<DiscoveryTrack[]>`; `fetchForStrategy(strategy: Strategy): Promise<DiscoveryTrack[]>`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/discovery.test.ts`:

```ts
import { parseGenreSearchResponse, parseArtistLookupResponse } from './discovery.ts';

test('parseGenreSearchResponse maps fields and drops genre-unrelated results', () => {
  const json = {
    results: [
      { trackId: 1, trackName: 'Song A', artistId: 10, artistName: 'Band', artworkUrl100: 'a', primaryGenreName: 'Alternative Rock', previewUrl: 'p1' },
      { trackId: 2, trackName: 'Song B', artistId: 11, artistName: 'Singer', artworkUrl100: 'b', primaryGenreName: 'Pop', previewUrl: 'p2' },
      { trackId: 3, trackName: 'Song C', artistId: 12, artistName: 'Nobody', artworkUrl100: 'c', primaryGenreName: 'Jazz' },
    ],
  };
  const result = parseGenreSearchResponse(json, 'Rock');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].primaryGenreName, 'Alternative Rock');
});

test('parseArtistLookupResponse skips the artist entry and previewless tracks', () => {
  const json = {
    results: [
      { wrapperType: 'artist', artistId: 10, artistName: 'Band' },
      { wrapperType: 'track', trackId: 1, trackName: 'Song A', artistId: 10, artistName: 'Band', artworkUrl100: 'a', primaryGenreName: 'Rock', previewUrl: 'p1' },
      { wrapperType: 'track', trackId: 2, trackName: 'Song B', artistId: 10, artistName: 'Band', artworkUrl100: 'b', primaryGenreName: 'Rock' },
    ],
  };
  const result = parseArtistLookupResponse(json);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});
```

(Add the import alongside the existing one at the top of the file rather than as a second `import` block — Node's module loader is fine with it either way, but keep the file's imports together.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/discovery.test.ts`
Expected: FAIL — `parseGenreSearchResponse`/`parseArtistLookupResponse` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `lib/discovery.ts`:

```ts
// ---------- iTunes fetch layer ----------

function toDiscoveryTrack(r: any): DiscoveryTrack {
  return {
    id: r.trackId,
    trackName: r.trackName ?? 'Unknown Title',
    artistId: r.artistId,
    artistName: r.artistName ?? 'Unknown Artist',
    artworkUrl100: r.artworkUrl100 ?? '',
    primaryGenreName: r.primaryGenreName ?? '',
    previewUrl: r.previewUrl,
  };
}

function hasPreview(r: any): boolean {
  return typeof r.previewUrl === 'string' && r.previewUrl.length > 0;
}

/** Pure: maps + filters a genre-search JSON response, dropping genre-unrelated results. */
export function parseGenreSearchResponse(json: unknown, searchedGenre: string): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results
    .filter(hasPreview)
    .map(toDiscoveryTrack)
    .filter((t) => isGenreRelated(searchedGenre, t.primaryGenreName));
}

/** Pure: maps + filters an artist-lookup JSON response. Its first result is the artist itself. */
export function parseArtistLookupResponse(json: unknown): DiscoveryTrack[] {
  const results: any[] = Array.isArray((json as any)?.results) ? (json as any).results : [];
  return results.filter((r) => r.wrapperType === 'track' && hasPreview(r)).map(toDiscoveryTrack);
}

export async function fetchTracksByGenre(genre: string): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=25`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed for ${genre}`);
  const json = await res.json();
  return parseGenreSearchResponse(json, genre);
}

export async function fetchTracksByArtist(artistId: number): Promise<DiscoveryTrack[]> {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=25`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes lookup failed for artist ${artistId}`);
  const json = await res.json();
  return parseArtistLookupResponse(json);
}

export async function fetchForStrategy(strategy: Strategy): Promise<DiscoveryTrack[]> {
  return strategy.type === 'genre'
    ? fetchTracksByGenre(strategy.genre)
    : fetchTracksByArtist(strategy.artistId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/discovery.test.ts`
Expected: PASS, all tests green (12 total).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery.ts lib/discovery.test.ts
git commit -m "Add iTunes fetch layer with genre-relatedness filtering

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 3: Discovery persistence (AsyncStorage)

**Files:**
- Create: `lib/discovery-storage.ts`

**Interfaces:**
- Consumes: `SwipeEntry` (Task 1).
- Produces: `loadSwipeHistory(): Promise<SwipeEntry[]>`; `appendSwipeEntry(entry: SwipeEntry): Promise<void>`; `loadDiscoveredGenres(): Promise<string[]>`; `saveDiscoveredGenres(genres: string[]): Promise<void>`.

No automated test file for this task: importing `@react-native-async-storage/async-storage` outside a React Native runtime resolves to a non-functional stub rather than throwing (confirmed by hand against this project's `node_modules`), so a plain `node --test` run would pass or fail meaninglessly either way. This mirrors `lib/taste-test.ts`'s own persistence functions, which are likewise untested — verification happens manually once Task 6 wires this into a running screen.

- [ ] **Step 1: Write the implementation**

Create `lib/discovery-storage.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SwipeEntry } from './discovery';

// All persistence is best-effort: a read/write failure falls back to an empty
// result rather than throwing, mirroring lib/taste-test.ts's pattern.

const STORAGE_PREFIX = 'blindspotDiscovery';
const SWIPE_HISTORY_KEY = `${STORAGE_PREFIX}:swipeHistory`;
const DISCOVERED_GENRES_KEY = `${STORAGE_PREFIX}:discoveredGenres`;

export async function loadSwipeHistory(): Promise<SwipeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SWIPE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Appends one swipe to the all-time history. Never overwrites existing entries. */
export async function appendSwipeEntry(entry: SwipeEntry): Promise<void> {
  try {
    const existing = await loadSwipeHistory();
    existing.push(entry);
    await AsyncStorage.setItem(SWIPE_HISTORY_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

export async function loadDiscoveredGenres(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISCOVERED_GENRES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDiscoveredGenres(genres: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCOVERED_GENRES_KEY, JSON.stringify(genres));
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/discovery-storage.ts
git commit -m "Add AsyncStorage persistence for discovery swipe history and genres

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 4: Queue/strategy refill engine

**Files:**
- Modify: `lib/discovery.ts` (append)
- Modify: `lib/discovery.test.ts` (append)

**Interfaces:**
- Consumes: `DiscoveryTrack`, `Strategy`, `dedupeDiscoveryTracks` (Task 1).
- Produces: `QUEUE_TARGET_DEPTH: number`; `MAX_REFILL_ATTEMPTS: number`; `RefillResult` type (`{ queue: DiscoveryTrack[]; fetched: DiscoveryTrack[] }`); `refillQueue(queue: DiscoveryTrack[], strategy: Strategy, seenTrackIds: Set<number>, fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>): Promise<RefillResult>`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/discovery.test.ts` (add `refillQueue, MAX_REFILL_ATTEMPTS` to the existing import from `./discovery`):

```ts
test('refillQueue tops the queue up to target depth, skipping seen and duplicate tracks', async () => {
  const seen = new Set([1]);
  const batch = [track({ id: 1 }), track({ id: 2 }), track({ id: 3 }), track({ id: 4 })];
  const fetcher = async () => batch;
  const { queue, fetched } = await refillQueue([], { type: 'genre', genre: 'Rock' }, seen, fetcher);
  assert.equal(queue.length, 3);
  assert.deepEqual(queue.map((t) => t.id), [2, 3, 4]);
  assert.equal(fetched.length, 4); // every returned track counts as discovered, shown or not
});

test('refillQueue does nothing when already at target depth', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [];
  };
  const full = [track({ id: 1 }), track({ id: 2 }), track({ id: 3 })];
  const { queue } = await refillQueue(full, { type: 'genre', genre: 'Rock' }, new Set(), fetcher);
  assert.equal(calls, 0);
  assert.deepEqual(queue, full);
});

test('refillQueue stops retrying once a strategy stops producing anything new', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [track({ id: 1 })]; // always the same already-seen track
  };
  const { queue } = await refillQueue([], { type: 'genre', genre: 'Rock' }, new Set([1]), fetcher);
  assert.equal(queue.length, 0);
  assert.equal(calls, MAX_REFILL_ATTEMPTS);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/discovery.test.ts`
Expected: FAIL — `refillQueue`/`MAX_REFILL_ATTEMPTS` not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `lib/discovery.ts`:

```ts
// ---------- Queue engine ----------

export const QUEUE_TARGET_DEPTH = 3;
export const MAX_REFILL_ATTEMPTS = 5;

export type RefillResult = {
  queue: DiscoveryTrack[];
  fetched: DiscoveryTrack[];
};

/**
 * Tops `queue` up to QUEUE_TARGET_DEPTH by calling `fetcher` for more tracks under
 * `strategy`, skipping anything in `seenTrackIds` or already queued. `fetched`
 * accumulates every track any fetch attempt returned — including duplicates that
 * never make it into the queue — since a genre only needs to have been *returned*
 * by iTunes to count as discovered (see lib/discovery-storage.ts's genre catalog).
 * Gives up after MAX_REFILL_ATTEMPTS fetches that add nothing new, rather than
 * looping forever against an exhausted strategy.
 */
export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>
): Promise<RefillResult> {
  let result = [...queue];
  const fetched: DiscoveryTrack[] = [];
  let attempts = 0;

  while (result.length < QUEUE_TARGET_DEPTH && attempts < MAX_REFILL_ATTEMPTS) {
    attempts += 1;
    const batch = dedupeDiscoveryTracks(await fetcher(strategy));
    fetched.push(...batch);

    const queuedIds = new Set(result.map((t) => t.id));
    const fresh = batch.filter((t) => !seenTrackIds.has(t.id) && !queuedIds.has(t.id));
    if (fresh.length === 0) continue;

    result = [...result, ...fresh].slice(0, QUEUE_TARGET_DEPTH);
  }

  return { queue: result, fetched };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/discovery.test.ts`
Expected: PASS, all tests green (15 total).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery.ts lib/discovery.test.ts
git commit -m "Add queue refill engine with injectable fetcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 5: Action overlay component (plain version)

**Files:**
- Create: `components/discovery/action-overlay.tsx`

**Interfaces:**
- Produces: `ActionOverlay({ visible: boolean; onArtist: () => void; onSound: () => void }): JSX.Element | null`. `onSound` fires automatically ~4s after `visible` becomes true, unless the overlay is hidden first.

No automated test — this is a presentational React Native component; JSX can't run under plain `node --test` (type-stripping erases TypeScript types but doesn't transform JSX). Verified manually once wired into `index.tsx` in Task 6.

- [ ] **Step 1: Write the implementation**

Create `components/discovery/action-overlay.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const AUTO_DISMISS_MS = 4000;

type ActionOverlayProps = {
  visible: boolean;
  onArtist: () => void;
  onSound: () => void;
};

export function ActionOverlay({ visible, onArtist, onSound }: ActionOverlayProps) {
  const onSoundRef = useRef(onSound);
  onSoundRef.current = onSound;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onSoundRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <ThemedView style={styles.container} lightColor="transparent" darkColor="transparent">
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discovery/action-overlay.tsx
git commit -m "Add action overlay component for post-like artist/sound choice

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 6: Wire the Home tab to the discovery engine (Stage 1 checkpoint)

**Files:**
- Modify: `app/(tabs)/index.tsx` (full rewrite)

**Interfaces:**
- Consumes: everything from Task 1/2/4 (`lib/discovery.ts`), Task 3 (`lib/discovery-storage.ts`), Task 5 (`ActionOverlay`), and `GENRES` from `lib/taste-test.ts` (the only permitted cross-import per Global Constraints).
- Produces: the Home tab screen. No other file depends on this one.

This task has no automated test — it's the manual-testing checkpoint for everything built in Tasks 1-5, using plain tap targets instead of swipe gestures (those come in Stage 2).

- [ ] **Step 1: Replace `app/(tabs)/index.tsx`**

```tsx
import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';

import { ActionOverlay } from '@/components/discovery/action-overlay';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  deriveGenresHeard,
  deriveSeenTrackIds,
  extractGenres,
  fetchForStrategy,
  mergeDiscoveredGenres,
  pickJumpGenre,
  refillQueue,
  type DiscoveryTrack,
  type Strategy,
  type SwipeEntry,
} from '@/lib/discovery';
import {
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadSwipeHistory,
  saveDiscoveredGenres,
} from '@/lib/discovery-storage';
import { GENRES } from '@/lib/taste-test';

function randomGenre(): string {
  return GENRES[Math.floor(Math.random() * GENRES.length)];
}

export default function HomeScreen() {
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [showActionButtons, setShowActionButtons] = useState(false);

  const lastLikedRef = useRef<DiscoveryTrack | null>(null);

  const seenTrackIds = useMemo(() => deriveSeenTrackIds(swipeHistory), [swipeHistory]);

  const currentTrack = queue[0];

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Autoplay whenever the top card changes — this never fires mid-drag, only when
  // a committed swipe actually changes queue[0].
  useEffect(() => {
    if (currentTrack) {
      player.replace(currentTrack.previewUrl);
      player.play();
    } else {
      player.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // ---------- Bootstrap ----------

  useEffect(() => {
    (async () => {
      const [history, genres] = await Promise.all([loadSwipeHistory(), loadDiscoveredGenres()]);
      setSwipeHistory(history);
      setDiscoveredGenres(genres);

      const initialStrategy: Strategy = { type: 'genre', genre: randomGenre() };
      setStrategy(initialStrategy);
      await runRefill([], initialStrategy, deriveSeenTrackIds(history), genres);

      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Queue refill ----------

  async function runRefill(
    baseQueue: DiscoveryTrack[],
    activeStrategy: Strategy,
    seenIds: Set<number>,
    knownGenres: string[]
  ) {
    try {
      const { queue: nextQueue, fetched } = await refillQueue(
        baseQueue,
        activeStrategy,
        seenIds,
        fetchForStrategy
      );
      setQueue(nextQueue);

      const merged = mergeDiscoveredGenres(knownGenres, extractGenres(fetched));
      if (merged !== knownGenres) {
        setDiscoveredGenres(merged);
        await saveDiscoveredGenres(merged);
      }
      setError(null);
    } catch {
      setError('Something went wrong fetching tracks. Check your connection and try again.');
    }
  }

  // ---------- Swipe handlers ----------

  async function logSwipe(track: DiscoveryTrack, action: SwipeEntry['action']) {
    const entry: SwipeEntry = {
      trackId: track.id,
      artistId: track.artistId,
      genre: track.primaryGenreName,
      action,
      timestamp: Date.now(),
    };
    const nextHistory = [...swipeHistory, entry];
    setSwipeHistory(nextHistory);
    await appendSwipeEntry(entry);
    return nextHistory;
  }

  async function handleSkip() {
    if (!currentTrack) return;
    const nextHistory = await logSwipe(currentTrack, 'skip');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, deriveSeenTrackIds(nextHistory), discoveredGenres);
  }

  async function handleLike() {
    if (!currentTrack) return;
    lastLikedRef.current = currentTrack;
    const nextHistory = await logSwipe(currentTrack, 'like');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    setShowActionButtons(true);
    await runRefill(nextQueue, strategy, deriveSeenTrackIds(nextHistory), discoveredGenres);
  }

  async function applyLikeStrategy(next: Strategy) {
    setShowActionButtons(false);
    setStrategy(next);
    await runRefill(queue, next, seenTrackIds, discoveredGenres);
  }

  function handleMoreFromArtist() {
    const liked = lastLikedRef.current;
    if (!liked) return;
    applyLikeStrategy({ type: 'artist', artistId: liked.artistId, artistName: liked.artistName });
  }

  function handleMoreLikeSound() {
    const liked = lastLikedRef.current;
    if (!liked) return;
    applyLikeStrategy({ type: 'genre', genre: liked.primaryGenreName });
  }

  async function handleGenreJump() {
    if (!currentTrack) return;
    const nextHistory = await logSwipe(currentTrack, 'genre-jump');
    const nextSeen = deriveSeenTrackIds(nextHistory);
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    const nextStrategy: Strategy = { type: 'genre', genre: newGenre };
    setStrategy(nextStrategy);
    setQueue([]); // discard the buffered tail — a genre jump is immediate, not queued
    await runRefill([], nextStrategy, nextSeen, discoveredGenres);
  }

  // ---------- Render ----------

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack ? (
        <>
          {currentTrack.artworkUrl100 ? (
            <Image source={{ uri: currentTrack.artworkUrl100 }} style={styles.artwork} />
          ) : null}
          <ThemedText type="subtitle">{currentTrack.trackName}</ThemedText>
          <ThemedText>{currentTrack.artistName}</ThemedText>
          <ThemedText style={styles.dim}>{currentTrack.primaryGenreName}</ThemedText>
          {!status.isLoaded && <ThemedText style={styles.dim}>Loading preview…</ThemedText>}

          <ThemedView style={styles.buttonRow}>
            <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText type="defaultSemiBold">Skip</ThemedText>
              </ThemedView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLike} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#e0f7ec" darkColor="#1d3d2f">
                <ThemedText type="defaultSemiBold">More of this</ThemedText>
              </ThemedView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGenreJump} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText type="defaultSemiBold">New genre</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          </ThemedView>

          <ActionOverlay
            visible={showActionButtons}
            onArtist={handleMoreFromArtist}
            onSound={handleMoreLikeSound}
          />
        </>
      ) : (
        <ThemedText>No more tracks — try again in a bit.</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artwork: {
    width: 240,
    height: 240,
    borderRadius: 12,
    alignSelf: 'center',
  },
  dim: {
    opacity: 0.6,
  },
  errorText: {
    color: '#c0392b',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test in Expo**

Run: `npm start`, then open on a device/simulator.

Check each of these, in order:
1. App opens straight into a track card (no setup screen) — artwork, title, artist, genre all show, and the preview starts playing automatically.
2. Tap **Skip** a few times — a new track loads and plays each time, no visible gap/silence.
3. Tap **More of this** — the two overlay buttons ("More from this artist" / "More like this sound") appear; the *next* card is already showing and playing (not blocked on the overlay).
4. Tap **More from this artist** — subsequent Skips should surface tracks by that same artist (check the artist name on following cards).
5. Let the overlay time out without tapping (wait ~4s after a "More of this") — it should disappear on its own and behave as if "More like this sound" had been tapped (check the genre on the next few cards trends toward what was just liked).
6. Tap **New genre** — the very next card should be a visibly different genre, immediately (no lag showing an old-genre card first).
7. Force-quit and reopen the app — no track already swiped in this run should reappear.
8. Turn off network and tap Skip — the error banner should appear instead of a crash.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Rewrite Home tab as a tap-driven discovery feed (Stage 1)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 7: Swipe-physics pure logic

**Files:**
- Create: `components/discovery/swipe-physics.ts`
- Create: `components/discovery/swipe-physics.test.ts`

**Interfaces:**
- Produces: `SwipeDirection` (`'left' | 'right' | 'down'`); `SwipeThresholds` type; `DEFAULT_SWIPE_THRESHOLDS`; `resolveSwipeDirection(translationX: number, translationY: number, thresholds?: SwipeThresholds): SwipeDirection | null`; `rotationForDrag(translateX: number, cardWidth: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `components/discovery/swipe-physics.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSwipeDirection, rotationForDrag } from './swipe-physics.ts';

test('resolveSwipeDirection returns right past the horizontal threshold', () => {
  assert.equal(resolveSwipeDirection(150, 0), 'right');
});

test('resolveSwipeDirection returns left past the negative horizontal threshold', () => {
  assert.equal(resolveSwipeDirection(-150, 0), 'left');
});

test('resolveSwipeDirection returns down when vertical drag dominates and passes its threshold', () => {
  assert.equal(resolveSwipeDirection(20, 150), 'down');
});

test('resolveSwipeDirection prefers down over right on a dominant diagonal drag', () => {
  assert.equal(resolveSwipeDirection(100, 150), 'down');
});

test('resolveSwipeDirection returns null under every threshold', () => {
  assert.equal(resolveSwipeDirection(10, 10), null);
});

test('rotationForDrag is proportional and clamped to +/-12 degrees', () => {
  assert.equal(rotationForDrag(0, 300), 0);
  assert.equal(rotationForDrag(300, 300), 12);
  assert.equal(rotationForDrag(-600, 300), -12);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test components/discovery/swipe-physics.test.ts`
Expected: FAIL — `swipe-physics.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `components/discovery/swipe-physics.ts`:

```ts
export type SwipeDirection = 'left' | 'right' | 'down';

export type SwipeThresholds = {
  horizontal: number;
  vertical: number;
};

export const DEFAULT_SWIPE_THRESHOLDS: SwipeThresholds = {
  horizontal: 120,
  vertical: 120,
};

/**
 * Resolves a completed drag gesture to a commit direction, or null to spring back.
 * A predominantly-downward drag past its threshold wins over horizontal movement,
 * so a diagonal down-right drag reads as "down" rather than "right".
 */
export function resolveSwipeDirection(
  translationX: number,
  translationY: number,
  thresholds: SwipeThresholds = DEFAULT_SWIPE_THRESHOLDS
): SwipeDirection | null {
  'worklet';
  if (translationY > thresholds.vertical && translationY > Math.abs(translationX)) {
    return 'down';
  }
  if (translationX > thresholds.horizontal) return 'right';
  if (translationX < -thresholds.horizontal) return 'left';
  return null;
}

/** Tilt angle in degrees for the Tinder-style rotation, proportional to horizontal drag. */
export function rotationForDrag(translateX: number, cardWidth: number): number {
  'worklet';
  const maxRotation = 12; // degrees
  const ratio = Math.max(-1, Math.min(1, translateX / cardWidth));
  return ratio * maxRotation;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test components/discovery/swipe-physics.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/discovery/swipe-physics.ts components/discovery/swipe-physics.test.ts
git commit -m "Add pure swipe-commit and tilt-angle logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 8: Draggable SwipeCard component

**Files:**
- Create: `components/discovery/swipe-card.tsx`

**Interfaces:**
- Consumes: `DiscoveryTrack` (`lib/discovery.ts`), `resolveSwipeDirection`, `rotationForDrag`, `SwipeDirection` (Task 7).
- Produces: `CardFace({ track: DiscoveryTrack }): JSX.Element` (presentational, reused by `card-stack.tsx` for the static background cards); `SwipeCard({ track: DiscoveryTrack; onSwipe: (direction: SwipeDirection) => void }): JSX.Element`.

No automated test — gesture handling and Reanimated worklets need a device/simulator. Verified manually in Task 9, once the card is actually on screen.

- [ ] **Step 1: Write the implementation**

Create `components/discovery/swipe-card.tsx`:

```tsx
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DiscoveryTrack } from '@/lib/discovery';
import { resolveSwipeDirection, rotationForDrag, type SwipeDirection } from './swipe-physics';

const CARD_WIDTH = 320;
const FLY_OUT_DISTANCE = 600;

export function CardFace({ track }: { track: DiscoveryTrack }) {
  return (
    <ThemedView style={styles.card}>
      {track.artworkUrl100 ? (
        <Image source={{ uri: track.artworkUrl100 }} style={styles.artwork} />
      ) : null}
      <ThemedView style={styles.info}>
        <ThemedText type="subtitle">{track.trackName}</ThemedText>
        <ThemedText>{track.artistName}</ThemedText>
        <ThemedText style={styles.dim}>{track.primaryGenreName}</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

type SwipeCardProps = {
  track: DiscoveryTrack;
  onSwipe: (direction: SwipeDirection) => void;
};

export function SwipeCard({ track, onSwipe }: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  function commit(direction: SwipeDirection) {
    onSwipe(direction);
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const direction = resolveSwipeDirection(e.translationX, e.translationY);
      if (direction === 'right') {
        translateX.value = withTiming(FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('right'));
      } else if (direction === 'left') {
        translateX.value = withTiming(-FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('left'));
      } else if (direction === 'down') {
        translateY.value = withTiming(FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('down'));
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotationForDrag(translateX.value, CARD_WIDTH)}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>
        <CardFace track={track} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
  },
  artwork: {
    width: '100%',
    height: CARD_WIDTH,
  },
  info: {
    padding: 16,
    gap: 4,
  },
  dim: {
    opacity: 0.6,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/discovery/swipe-card.tsx
git commit -m "Add draggable SwipeCard with Tinder-style tilt

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 9: Card stack and gesture wiring (Stage 2 checkpoint)

**Files:**
- Create: `components/discovery/card-stack.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `CardFace`, `SwipeCard` (Task 8); `SwipeDirection` (Task 7); `DiscoveryTrack` (`lib/discovery.ts`).
- Produces: `CardStack({ queue: DiscoveryTrack[]; onSwipe: (direction: SwipeDirection) => void }): JSX.Element`.

- [ ] **Step 1: Create `components/discovery/card-stack.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';

import type { DiscoveryTrack } from '@/lib/discovery';
import { CardFace, SwipeCard } from './swipe-card';
import type { SwipeDirection } from './swipe-physics';

const STACK_DEPTH = 3;

type CardStackProps = {
  queue: DiscoveryTrack[];
  onSwipe: (direction: SwipeDirection) => void;
};

export function CardStack({ queue, onSwipe }: CardStackProps) {
  const visible = queue.slice(0, STACK_DEPTH);

  return (
    <View style={styles.container}>
      {visible
        .map((track, index) => ({ track, index }))
        .reverse()
        .map(({ track, index }) =>
          index === 0 ? (
            <View key={track.id} style={styles.layer}>
              <SwipeCard track={track} onSwipe={onSwipe} />
            </View>
          ) : (
            <View
              key={track.id}
              pointerEvents="none"
              style={[
                styles.layer,
                { transform: [{ scale: 1 - index * 0.04 }, { translateY: index * 10 }] },
              ]}>
              <CardFace track={track} />
            </View>
          )
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  layer: {
    position: 'absolute',
  },
});
```

- [ ] **Step 2: Wire `CardStack` into `app/(tabs)/index.tsx`, replacing the tap-button row**

In `app/(tabs)/index.tsx`:

Replace this import:
```tsx
import { ActionOverlay } from '@/components/discovery/action-overlay';
```
with:
```tsx
import { ActionOverlay } from '@/components/discovery/action-overlay';
import { CardStack } from '@/components/discovery/card-stack';
import type { SwipeDirection } from '@/components/discovery/swipe-physics';
```

Add this dispatcher near the other handlers (after `handleGenreJump`):
```tsx
function handleCardSwipe(direction: SwipeDirection) {
  if (direction === 'left') handleSkip();
  else if (direction === 'right') handleLike();
  else handleGenreJump();
}
```

Replace the whole block from the leading `{currentTrack.artworkUrl100 ? (...) : null}` artwork check down through the `<ThemedView style={styles.buttonRow}>...</ThemedView>` block (that is: the bare artwork `Image`, the `trackName`/`artistName`/`primaryGenreName` `ThemedText`s, the `!status.isLoaded` loading text, and the Skip / More of this / New genre `TouchableOpacity`s — all of Stage 1's placeholder track display, now fully superseded by `CardFace`'s own rendering of the same fields inside the card) with just:
```tsx
          <CardStack queue={queue} onSwipe={handleCardSwipe} />
```

That placeholder block and the real card would otherwise render as two independent siblings in the parent's flex column — the plain, unstyled placeholder stacking directly above the properly-styled card — rather than the placeholder being replaced by it. This applies on every platform Expo targets, not just web; it's just most visually obvious there.

Since `status` (from `useAudioPlayerStatus`) was only read by the removed `!status.isLoaded` check, remove that hook call too, and its `useAudioPlayerStatus` import (keep `useAudioPlayer` and the `player` it returns — still needed for playback). Remove the now-unused `expo-image` `Image` import (no longer referenced anywhere in this file). Remove the now-unused `buttonRow`, `actionButton`, `artwork`, and `dim` entries from the `styles` `StyleSheet.create` object at the bottom of the file (all were only used by the removed block).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual test in Expo**

Run: `npm start`.

Check each of these:
1. The top card can be dragged with a finger/mouse and follows the touch smoothly, tilting like a Tinder card as it moves horizontally.
2. Releasing under every threshold springs the card back to center.
3. A firm swipe right flies the card off-screen right, the next card (already loaded) appears immediately and starts playing, and the two action-overlay buttons appear.
4. A firm swipe left flies the card off left and advances with no gap.
5. A firm swipe down flies the card off downward and the next card is visibly a different genre.
6. Up to 2 more cards are visible stacked behind the top one, slightly scaled/offset.
7. Re-run the full checklist from Task 6 Step 3 (skip repeats, artist/sound strategy switching, overlay auto-default, offline error banner) — all of it should still work identically, just gesture-driven instead of tap-driven.

- [ ] **Step 5: Commit**

```bash
git add components/discovery/card-stack.tsx "app/(tabs)/index.tsx"
git commit -m "Wire card stack with real drag/tilt physics (Stage 2)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 10: Reanimated fade for the action overlay

**Files:**
- Modify: `components/discovery/action-overlay.tsx`

**Interfaces:**
- Consumes/Produces: unchanged from Task 5 — `ActionOverlay({ visible, onArtist, onSound })`. No caller (`app/(tabs)/index.tsx`) needs to change.

- [ ] **Step 1: Replace `components/discovery/action-overlay.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const AUTO_DISMISS_MS = 4000;
const FADE_MS = 400;

type ActionOverlayProps = {
  visible: boolean;
  onArtist: () => void;
  onSound: () => void;
};

export function ActionOverlay({ visible, onArtist, onSound }: ActionOverlayProps) {
  const [rendered, setRendered] = useState(visible);
  const opacity = useSharedValue(0);
  const onSoundRef = useRef(onSound);
  onSoundRef.current = onSound;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: FADE_MS });
      opacity.value = withDelay(AUTO_DISMISS_MS, withTiming(0, { duration: FADE_MS }));
      const timer = setTimeout(() => onSoundRef.current(), AUTO_DISMISS_MS + FADE_MS);
      return () => clearTimeout(timer);
    }
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      if (finished) runOnJS(setRendered)(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual test in Expo**

Run: `npm start`. Swipe right on a card and confirm: the two buttons fade in (not an abrupt pop-in), stay for ~4s, fade out smoothly, and "More like this sound" fires automatically right after the fade completes. Tap a button mid-display and confirm it fades out immediately rather than waiting out the timer.

- [ ] **Step 4: Commit**

```bash
git add components/discovery/action-overlay.tsx
git commit -m "Animate the action overlay's fade with Reanimated (Stage 3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```

---

## Task 11: Cleanup and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `changelog.md`

- [ ] **Step 1: Lint and type-check sweep**

Run: `npm run lint` and `npx tsc --noEmit`.
Fix anything flagged — in particular, double-check there's no leftover unused style entry in `app/(tabs)/index.tsx` or `components/discovery/*.tsx` from earlier stages (Task 9 Step 2 already removed the tap-button styles; this is a final check, not expected to find much).

- [ ] **Step 2: Update `CLAUDE.md`'s architecture section**

Replace the existing "Home tab (`app/(tabs)/index.tsx`)" bullet (the one describing the `setup → playing → reveal → summary` state machine) with:

```markdown
- **Home tab (`app/(tabs)/index.tsx`)**: a continuous swipe-based discovery feed. A stack of up to 3 tracks (`components/discovery/card-stack.tsx`) is kept loaded via `lib/discovery.ts`'s `refillQueue`; the top card is draggable (`components/discovery/swipe-card.tsx`, built on `react-native-gesture-handler` + `react-native-reanimated`) and tilts like a Tinder card as it's dragged. Its preview autoplays via `expo-audio` whenever it becomes the top card, uninterrupted by dragging. Swipe left skips; swipe right logs a "like" and shows `components/discovery/action-overlay.tsx`'s "More from this artist" / "More like this sound" choice (auto-defaulting to sound after ~4s) to steer what backfills the queue next; swipe down immediately jumps to a genre not yet heard, preferring the empirically-built `discoveredGenres` catalog over the hand-picked `GENRES` list. All swipes, seen tracks, and discovered genres persist under `blindspotDiscovery:*` in `lib/discovery-storage.ts`, entirely separate from the quiz's `blindTasteTest:*` keys below — the two features share no data.
```

Update the line above listing `lib/taste-test.ts` as "the app's only non-UI module" to note it no longer is — add a sentence noting `lib/discovery.ts` (pure logic + iTunes fetch) and `lib/discovery-storage.ts` (AsyncStorage persistence) as the Home tab's equivalent modules, kept deliberately separate from `taste-test.ts` so the Profile tab (still built on the quiz's data model) is unaffected.

- [ ] **Step 3: Add a changelog entry**

Add to the top of the Entries section in `changelog.md`:

```markdown
## [2026-09-04] Replaced the blind quiz with a swipe-based discovery feed

The Home tab no longer runs a ten-track setup → playing → reveal → summary quiz.
It's now a continuous Tinder-style swipe feed: drag a card left to skip, right to
signal "more of this" (choosing artist or sound to steer what's next), or down to
jump to a genre not yet heard. Tracks and playback still come from the iTunes
Search API and expo-audio; card physics use react-native-gesture-handler and
react-native-reanimated. New history (`lib/discovery.ts`, `lib/discovery-storage.ts`,
`blindspotDiscovery:*` storage) is entirely separate from the quiz's
`lib/taste-test.ts` and `blindTasteTest:*` data — the Profile tab is unchanged and
untouched, and will read as stale until it's redesigned separately.
```

- [ ] **Step 4: Final full verification**

Run: `node --test lib/discovery.test.ts components/discovery/swipe-physics.test.ts` — expect all tests passing.
Run: `npx tsc --noEmit` — expect no errors.
Run: `npm run lint` — expect no errors.
Run the app (`npm start`) once more and step through the full manual checklist from Task 9 Step 4 end to end.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md changelog.md
git commit -m "Document the swipe-discovery feed in CLAUDE.md and changelog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016Vtfaj8MuDe8kfYmjx2oi2"
```
