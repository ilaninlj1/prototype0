# Base "Heard" on Listen Time, Not Skip/Like

**Goal:** The genre picker's checkmark currently means "swiped left or right on a track from this genre" — but a two-second reflexive skip counts the same as actually listening. Replace that with a listen-time threshold, decoupled from which direction the swipe went.

**Scope:** `lib/discovery.ts` (`SwipeEntry`, `deriveRatedGenres`) and `app/(tabs)/index.tsx` (`logSwipe`). `deriveGenresHeard` (the broader "already explored" notion `pickJumpGenre`/`refillQueueWithFallback` use) is untouched — that's a different concept from the picker's checkmark and was deliberately kept separate from `deriveRatedGenres` last time; this change doesn't touch it.

## `SwipeEntry` gains `listenMs`

```ts
export type SwipeEntry = {
  trackId: number;
  artistId: number;
  genre: string;
  action: SwipeAction;
  timestamp: number;
  listenMs?: number;
};
```

Optional, not required — every *new* entry will have it (see below), but entries already sitting in a device's persisted `swipeHistory` were written before this field existed and genuinely won't have it. No migration; `deriveRatedGenres` treats a missing value as 0, which is what "old entries without listenMs shouldn't count as heard" means in practice.

## Measuring listen time: `status.currentTime`, not a manual timer

`logSwipe` already runs inside `HomeScreen`, which has `status` (from `usePlayback()`) in scope — no need to thread a new parameter through `handleSkip`/`handleLike`/`handleGenreJump`/`handlePickGenre`/`handleExplore`, all of which already call `logSwipe(track, action)`. `logSwipe` itself reads `status.currentTime` (seconds) at the moment it's called and converts to ms:

```ts
async function logSwipe(track: DiscoveryTrack, action: SwipeEntry['action']) {
  const entry: SwipeEntry = {
    trackId: track.id,
    artistId: track.artistId,
    genre: track.primaryGenreName,
    action,
    timestamp: Date.now(),
    listenMs: Math.round(status.currentTime * 1000),
  };
  ...
}
```

This works because `status.currentTime` is the playhead position, and nothing seeks backward except the tap-to-pause feature's explicit `seekTo(0)` on replaying a *finished* preview — so pausing and resuming doesn't lose accumulated time (the playhead only advances while actually playing), and letting a preview play to completion without replaying leaves `currentTime` sitting at the full duration. The one case this undercounts: a preview plays to completion, the user taps to replay, then swipes away almost immediately — `currentTime` only reflects the replay's brief elapsed time, not the earlier full listen. Accepting this as a known, narrow edge case rather than building a separate manually-accumulated timer that survives replays — it's rare, low-stakes for a "which genres have I explored" heuristic, and the alternative adds real complexity (tracking play/pause transitions with timestamps) for a case that, if anything, only makes an already-heard genre take one extra listen to register.

## `deriveRatedGenres`: drops the action check entirely

```ts
export const RATED_LISTEN_THRESHOLD_MS = 10000;

export function deriveRatedGenres(history: SwipeEntry[]): Set<string> {
  return new Set(
    history
      .filter((e) => (e.listenMs ?? 0) >= RATED_LISTEN_THRESHOLD_MS)
      .map((e) => e.genre)
  );
}
```

This is a real behavior change beyond "fix the skip case": a genre-jump on a track you listened to for a while now counts as heard, since swipe *direction* was never actually the thing that mattered — duration is. 10 seconds, not 5: five seconds is a sixth of the preview — you can dismiss a track that fast without registering it, which is the exact problem this fixes — while ten seconds is a third of the clip, enough to have actually heard something. It's a named constant specifically so it's a one-line change later if it feels wrong in practice.

## Tests

The two existing `deriveRatedGenres` tests assert action-based filtering and will be rewritten (not extended — their premise no longer holds): a genre-jump with `listenMs` above the threshold counts; a skip below threshold doesn't; a missing `listenMs` doesn't; a boundary case at exactly the threshold.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `SwipeEntry.listenMs`; `RATED_LISTEN_THRESHOLD_MS`; `deriveRatedGenres` redefined |
| `lib/discovery.test.ts` | Rewrite the two `deriveRatedGenres` tests; add threshold-boundary and missing-`listenMs` cases |
| `app/(tabs)/index.tsx` | `logSwipe` populates `listenMs` from `status.currentTime` |

## Out of scope

- Any migration or backfill of existing persisted `swipeHistory` entries.
- Changing `deriveGenresHeard` or anything `pickJumpGenre`/`refillQueueWithFallback` use.
- Tuning `RATED_LISTEN_THRESHOLD_MS` beyond picking a reasonable starting value.
