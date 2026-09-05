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
 * Greedy: at each step, picks the first remaining candidate (preserving
 * iTunes's original relevance order as a tie-break) that satisfies the cap
 * against the trailing window so far. If NONE do — the batch is dominated
 * enough that spreading is exhausted — takes the next remaining candidate
 * anyway rather than stall the queue below target depth. This can still
 * place two of the same album consecutively in that fully-starved case; that's
 * accepted as better than an under-filled queue.
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
    let index = remaining.findIndex((t) => {
      if (t.collectionId === undefined) return true;
      const count = trailing.filter((id) => id === t.collectionId).length;
      return count < ALBUM_SPREAD_CAP;
    });
    if (index === -1) index = 0; // nothing satisfies the cap — relax it rather than stall
    const [chosen] = remaining.splice(index, 1);
    placed.push(chosen);
    window.push(chosen.collectionId);
  }
  return placed;
}
```

A track with no `collectionId` always satisfies the cap check (`return true` immediately), which has a convenient side effect worth calling out: when nothing in a batch has a `collectionId` at all (as in every existing `refillQueue` test, which never sets it), `spreadByAlbum` always picks `remaining[0]` and is a pure identity/order-preserving pass-through — existing behavior is unaffected without touching those tests.

## `refillQueue` / `refillQueueWithFallback`: threading the window through

`refillQueue` gains one new, defaulted parameter so every existing call site (production and tests) that doesn't care about spreading keeps compiling unchanged:

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
  let attempts = 0;

  while (result.length < QUEUE_TARGET_DEPTH && attempts < MAX_REFILL_ATTEMPTS) {
    attempts += 1;
    const batch = dedupeDiscoveryTracks(await fetcher(strategy));
    fetched.push(...batch);

    const queuedIds = new Set(result.map((t) => t.id));
    const fresh = batch.filter((t) => !seenTrackIds.has(t.id) && !queuedIds.has(t.id));
    if (fresh.length === 0) continue;

    const windowSoFar = [...recentAlbumIds, ...result.map((t) => t.collectionId)];
    result = [...result, ...spreadByAlbum(fresh, windowSoFar)].slice(0, QUEUE_TARGET_DEPTH);
  }

  return { queue: result, fetched };
}
```

`windowSoFar` is recomputed each loop iteration from the live `result` (which already starts as the current queue and keeps growing), so both cross-batch spreading within one `refillQueue` call and the boundary between the already-buffered queue and newly appended tracks are covered by the same mechanism — no special-casing the first batch versus later ones.

`refillQueueWithFallback` derives the trailing history slice once and passes it to every `refillQueue` call it makes (including across genre-fallback attempts):

```ts
const recentAlbumIds = history.slice(-ALBUM_SPREAD_WINDOW).map((e) => e.collectionId);
// ...
const result = await refillQueue(currentQueue, currentStrategy, seenTrackIds, fetcher, recentAlbumIds);
```

## Testing (`lib/discovery.test.ts`)

- `spreadByAlbum`: two same-album candidates never end up adjacent when a different-album candidate is available to place between them; a candidate with no `collectionId` is never treated as matching another no-`collectionId` candidate; the cap is evaluated against `recentAlbumIds` too (a candidate matching something already in the trailing window gets deferred behind a candidate that doesn't); when every remaining candidate is the same over-represented album, the function still places all of them (never drops one) even though the cap ends up exceeded; empty `candidates` returns `[]`.
- `refillQueue`: with `recentAlbumIds` supplied and a fetched batch containing an album run, the resulting queue has no two consecutive same-`collectionId` tracks; with no `collectionId` set anywhere (existing test style), behavior is unchanged from before this change.
- No changes needed to existing `refillQueue`/`refillQueueWithFallback` tests — the new parameter is defaulted and inert when unused.

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
