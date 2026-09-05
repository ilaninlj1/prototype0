# Spread the Queue by Album

**Bug:** While skipping through a genre, several tracks from the same album (often a compilation) surface in a row — the search results are dominated by one `collectionId`, and the queue preserves that order verbatim. Fix: no two consecutive tracks from the same album, and no more than a small number of tracks from one album within a short recent stretch of what's actually been presented.

**Scope:** `lib/discovery.ts` (`DiscoveryTrack`/`SwipeEntry` gain `collectionId`; new `spreadByAlbum`; `refillQueue`/`refillQueueWithFallback` thread a recent-albums window through), `lib/discovery.test.ts` (new coverage), `app/(tabs)/index.tsx` (`logSwipe` records `collectionId`).

## The window: recent stream, not just the live buffer

The live queue is only `QUEUE_TARGET_DEPTH` (3) tracks deep — checking spread against just that buffer would miss the actual complaint. An album that resurfaces every couple of tracks (never twice *consecutively*, never more than one deep in the live buffer at a time) still reads as "I keep getting this album" once you count the last several tracks you were actually shown, swiped or not. So the check runs against a rolling window that spans **already-swiped history plus whatever's currently queued** — sourced from `swipeHistory`, which is exactly why `collectionId` needs to be added there too, not just on `DiscoveryTrack`.

**Window = 5 tracks, cap = 1 per album within it.** This single rule subsumes "no two consecutive" as a special case — two of the same album back-to-back is 2-within-5, which a cap of 1 already forbids — so there's no separate adjacency rule to keep in sync with the cap.

## `DiscoveryTrack` and `SwipeEntry` gain `collectionId`

```ts
export type DiscoveryTrack = {
  id: number;
  trackName: string;
  artistId: number;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
  trackViewUrl: string;
  collectionId?: number; // NEW — iTunes's album id; absent for the rare result that has none
};
```

`toDiscoveryTrack` passes `r.collectionId` through unchanged (no coercion — a genuinely missing album id stays `undefined`, not collapsed onto some fake shared value that would wrongly group unrelated tracks together).

```ts
export type SwipeEntry = {
  // ...unchanged...
  collectionId?: number; // NEW — same precedent as trackName/artistName/listenMs: populated going forward, no migration
};
```

`logSwipe` (`app/(tabs)/index.tsx`) adds one field: `collectionId: track.collectionId`.

## `spreadByAlbum`: the placement algorithm

```ts
export const ALBUM_SPREAD_WINDOW = 5;
export const ALBUM_SPREAD_CAP = 1;

/**
 * Reorders `candidates` (freshly fetched, not-yet-queued tracks) so that,
 * placed one at a time after `recentAlbumIds` (oldest first — already-
 * presented history followed by whatever's currently queued), no album
 * exceeds ALBUM_SPREAD_CAP occurrences within any trailing ALBUM_SPREAD_WINDOW
 * stretch. A track with no collectionId is never constrained against
 * anything — it's treated as its own ungrouped track, not lumped in with
 * other album-less tracks.
 *
 * Greedy, with a two-tier fallback so relaxing the cap never means relaxing
 * all the way to unbounded:
 *
 *  1. Prefer the first remaining candidate (preserving iTunes's original
 *     relevance order as a tie-break) that satisfies the full window/cap
 *     rule against the trailing window so far.
 *  2. If none do, fall back to the one guarantee that doesn't relax: the
 *     first remaining candidate that at least isn't the same album as the
 *     track just placed. This is what keeps "no two consecutive" true even
 *     when the broader 1-per-5 cap has to give.
 *  3. Only if EVERY remaining candidate is the same album as the one just
 *     placed — there is no other track left to interleave with at all —
 *     does a repeat happen. This is the true floor: it can't be avoided
 *     without inventing a track that doesn't exist in what was fetched.
 */
export function spreadByAlbum(
  candidates: DiscoveryTrack[],
  recentAlbumIds: (number | undefined)[]
): DiscoveryTrack[] {
  const remaining = [...candidates];
  const placed: DiscoveryTrack[] = [];
  const window = [...recentAlbumIds];

  while (remaining.length > 0) {
    const trailing = window.slice(-(ALBUM_SPREAD_WINDOW - 1));
    const last = window[window.length - 1];

    let index = remaining.findIndex((t) => {
      if (t.collectionId === undefined) return true;
      const count = trailing.filter((id) => id === t.collectionId).length;
      return count < ALBUM_SPREAD_CAP;
    });
    if (index === -1) {
      index = remaining.findIndex((t) => t.collectionId === undefined || t.collectionId !== last);
    }
    if (index === -1) index = 0; // every remaining candidate is the same album as the one just placed

    const [chosen] = remaining.splice(index, 1);
    placed.push(chosen);
    window.push(chosen.collectionId);
  }
  return placed;
}
```

A track with no `collectionId` always satisfies tier 1 (`return true` immediately), which has a convenient side effect worth calling out: when nothing in a batch has a `collectionId` at all (as in every existing `refillQueue` test, which never sets it), `spreadByAlbum` always picks `remaining[0]` via tier 1 and is a pure identity/order-preserving pass-through — existing behavior is unaffected without touching those tests. `undefined` values elsewhere in `recentAlbumIds` (pre-migration `SwipeEntry`s — see below) are similarly inert: `undefined === t.collectionId` is always `false` for a real album id, so a slot with no recorded album can never spuriously match one, and `t.collectionId !== last` is `true` whenever `last` is `undefined`, so tier 2 works the same way against an unknown predecessor as against a known different one.

## `refillQueue` / `refillQueueWithFallback`: threading the window through

**Spreading has to see everything fetched in one `refillQueue` call before placing anything, not one batch at a time.** Spreading per-batch-as-it-arrives can't fix an adjacency forced by a dominated first batch even if a *later* batch in the same call turns out to have alternatives — and a dominated single batch is exactly the reported bug. So `refillQueue`'s loop now accumulates fetched-but-not-yet-placed candidates into a `pool` across attempts, and spreads once, after fetching stops (either because enough candidates were gathered or attempts ran out) rather than after every individual batch:

```ts
export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>,
  recentAlbumIds: (number | undefined)[] = []
): Promise<RefillResult> {
  let result = [...queue];
  const fetched: DiscoveryTrack[] = [];
  const pool: DiscoveryTrack[] = [];
  let attempts = 0;

  while (result.length + pool.length < QUEUE_TARGET_DEPTH && attempts < MAX_REFILL_ATTEMPTS) {
    attempts += 1;
    const batch = dedupeDiscoveryTracks(await fetcher(strategy));
    fetched.push(...batch);

    const queuedIds = new Set([...result, ...pool].map((t) => t.id));
    const fresh = batch.filter((t) => !seenTrackIds.has(t.id) && !queuedIds.has(t.id));
    pool.push(...fresh);
  }

  if (pool.length > 0) {
    const windowSoFar = [...recentAlbumIds, ...result.map((t) => t.collectionId)];
    result = [...result, ...spreadByAlbum(pool, windowSoFar)].slice(0, QUEUE_TARGET_DEPTH);
  }

  return { queue: result, fetched };
}
```

The loop's exit condition (`result.length + pool.length < QUEUE_TARGET_DEPTH`) fires at the same point the old per-batch-append version did, so the number of fetch attempts made in each existing test scenario is unchanged (hand-traced against all four existing `refillQueue`/`refillQueueWithFallback` tests — none of their assertions move); this only changes *when* placement happens, not how much gets fetched.

`refillQueueWithFallback` derives the trailing history slice once and passes it to every `refillQueue` call it makes (including across genre-fallback attempts):

```ts
const recentAlbumIds = history.slice(-ALBUM_SPREAD_WINDOW).map((e) => e.collectionId);
// ...
const result = await refillQueue(currentQueue, currentStrategy, seenTrackIds, fetcher, recentAlbumIds);
```

## Testing (`lib/discovery.test.ts`)

- `spreadByAlbum`:
  - Two same-album candidates never end up adjacent when a different-album candidate is available to place between them.
  - A candidate with no `collectionId` is never treated as matching another no-`collectionId` candidate.
  - The cap is evaluated against `recentAlbumIds` too (a candidate matching something already in the trailing window gets deferred behind a candidate that doesn't).
  - **Tier-2 floor:** when the full cap can't be satisfied but a *different* album is still available among the remaining candidates, that different album is placed next — never a repeat of the immediately preceding one, even though the broader window/cap is violated.
  - **Tier-3 (true floor):** when every single remaining candidate is the same album as the one just placed, the function still places all of them (never drops one) even though this does produce a repeat — there is no alternative to place instead.
  - **Pre-migration data:** a `recentAlbumIds` array containing `undefined` entries (simulating history from before this field existed) doesn't crash and doesn't cause a real-`collectionId` candidate to be treated as matching an unknown one.
  - Empty `candidates` returns `[]`.
- `refillQueue`: a scenario where the first fetch attempt returns a batch entirely of one album and a second attempt (needed to reach target depth) returns a different album confirms spreading happens across the accumulated pool, not per-batch — the first attempt's tracks and the second's end up interleaved rather than all of album A placed before any of album B is considered. With no `collectionId` set anywhere (existing test style), behavior is unchanged from before this change.
- No changes needed to existing `refillQueue`/`refillQueueWithFallback` tests — the new parameter is defaulted and inert when unused, and the pool-based restructuring was hand-verified to preserve their exact fetch-attempt counts and outputs.

## Out of scope

- Any change to how albums are *displayed* (reveal screen, Profile tab, etc.) — `collectionId` is added purely to power spreading.
- Retroactively reordering already-queued/already-swiped tracks — this only affects the order newly fetched tracks are placed in.
- Tuning `ALBUM_SPREAD_WINDOW`/`ALBUM_SPREAD_CAP` beyond picking reasonable starting values — both are named constants.
- Grouping by artist in addition to album — the bug report is specifically about albums/compilations; artist repetition isn't in scope here.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `DiscoveryTrack.collectionId`, `SwipeEntry.collectionId`; `ALBUM_SPREAD_WINDOW`, `ALBUM_SPREAD_CAP`, `spreadByAlbum`; `refillQueue` gains a defaulted `recentAlbumIds` param; `refillQueueWithFallback` derives and threads it through |
| `lib/discovery.test.ts` | New test cases per above |
| `app/(tabs)/index.tsx` | `logSwipe` records `collectionId` |
