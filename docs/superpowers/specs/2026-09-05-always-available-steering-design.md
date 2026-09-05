# Always-Available Steering (Replace the Post-Like Overlay)

**Goal:** "More from this artist" / "More like this sound" currently only appear in `ActionOverlay` after a right-swipe (like) — but wanting more of a sound and liking a specific track are different judgments, and gating steering on liking means you can't redirect discovery without also rating the current track. Make both steering choices available at any time, independent of any swipe, via a persistent row alongside the card. Remove `ActionOverlay` entirely.

**Scope:** `components/discovery/action-overlay.tsx` (deleted), `components/discovery/steering-row.tsx` (new), `app/(tabs)/index.tsx` (steering handlers, undo, render), `lib/discovery.ts` (`SwipeAction`, `deriveGenrePath`, `deriveTopArtists`, `rankGenresByVisits`), `lib/discovery.test.ts` (updated/new coverage).

## Behavior

- Tapping a steering control **does not touch the currently showing card** — it keeps playing, stays swipeable (left/right/down) exactly as before. Steering only changes `strategy`, which affects what gets fetched for *subsequent* cards.
- It **does** write a `SwipeEntry` to `swipeHistory`, so the Profile tab's genre path can show deliberate redirects, not just passive drift — but that entry carries no `listenMs` and is excluded from visit-count ranking and artist stats (see below), since no listening happened.
- It **is undoable**, the same way a mis-swipe or a mis-tapped genre-jump is.

## `SwipeAction` gains `'steer-artist' | 'steer-sound'`

```ts
export type SwipeAction = 'skip' | 'like' | 'genre-jump' | 'steer-artist' | 'steer-sound';
```

Logged through the existing `logSwipe` (not a parallel function) against `currentTrack` — same `trackId`/`trackName`/`artistId`/`artistName`/`genre` as any other entry — but `listenMs` is omitted for these two actions specifically:

```ts
// app/(tabs)/index.tsx, logSwipe
const isSteer = action === 'steer-artist' || action === 'steer-sound';
const entry: SwipeEntry = {
  trackId: track.id,
  trackName: track.trackName,
  artistId: track.artistId,
  artistName: track.artistName,
  genre: track.primaryGenreName,
  action,
  timestamp: Date.now(),
  ...(isSteer ? {} : { listenMs: Math.round(status.currentTime * 1000) }),
};
```

Omitting `listenMs` (rather than recording it) is what keeps this from double-counting: the same track gets a *second*, separate entry later with its own `listenMs` when it's actually swiped away, and `averageListenMs`/`rankGenresByListenTime`/`deriveRatedGenres` already treat a missing `listenMs` as "don't count it" — so steering is automatically invisible to listen-time and "heard" derivations with no further code change.

## `deriveGenrePath`: a steer entry always opens a new visit

Current rule: a same-genre entry merges into the running visit. New rule: **a steer entry never merges**, regardless of genre — it always starts a new `GenreVisit`, since it represents a deliberate re-arrival rather than a continuation. A non-steer entry still merges into the current run when its genre matches.

```ts
const STEER_ACTIONS = new Set<SwipeAction>(['steer-artist', 'steer-sound']);

export function deriveGenrePath(entries: SwipeEntry[]): GenreVisit[] {
  const visits: GenreVisit[] = [];
  for (const entry of entries) {
    const current = visits[visits.length - 1];
    const continuesRun = current && current.genre === entry.genre && !STEER_ACTIONS.has(entry.action);
    if (continuesRun) {
      current.trackCount += 1;
      current.listenMs += entry.listenMs ?? 0;
    } else {
      visits.push({ genre: entry.genre, trackCount: 1, listenMs: entry.listenMs ?? 0, startedAt: entry.timestamp });
    }
  }
  return visits;
}
```

This is the one function used for both purposes — the Profile screen's path display calls it on unfiltered session entries (so a steer shows up as its own segment, even `Pop → Pop`), while `rankGenresByVisits` calls it on pre-filtered entries (see next section), so the forced boundary never affects the visit count.

## `rankGenresByVisits`: filters steer entries out before counting

```ts
export function rankGenresByVisits(sessions: Session[]): { genre: string; visits: number }[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const heardEntries = session.entries.filter((e) => !STEER_ACTIONS.has(e.action));
    for (const visit of deriveGenrePath(heardEntries)) {
      counts.set(visit.genre, (counts.get(visit.genre) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([genre, visits]) => ({ genre, visits }))
    .sort((a, b) => b.visits - a.visits);
}
```

## `deriveTopArtists`: steer entries excluded from grouping, not from name resolution

Name resolution still scans full history (a steer entry does carry `artistName`, no reason to discard that signal). Grouping (`trackCount`, `listenSum`, `listenCount`) runs over history with steer entries filtered out first, so steering can't inflate an artist's displayed track count without an actual track being judged:

```ts
export function deriveTopArtists(history: SwipeEntry[], minTracks = 2): ArtistStat[] {
  const overallAverage = averageListenMs(history); // unaffected: steer entries never have listenMs anyway

  const names = new Map<number, string>();
  for (const entry of [...history].sort((a, b) => a.timestamp - b.timestamp)) {
    if (entry.artistName) names.set(entry.artistId, entry.artistName);
  }

  const judged = history.filter((e) => !STEER_ACTIONS.has(e.action));
  const groups = new Map<number, { count: number; listenSum: number; listenCount: number }>();
  for (const entry of judged) {
    /* unchanged aggregation */
  }
  /* unchanged filtering/sorting */
}
```

## No change needed

- `deriveRatedGenres` — already excludes entries without `listenMs`.
- `deriveGenresHeard` (the broad "already explored" set `pickJumpGenre`/`refillQueueWithFallback` use) — a steer entry's genre is always already represented by whatever entry showed that track, so this stays untouched; steering *did* touch that territory, which matches this function's already-broad definition.
- `rankGenresByListenTime`, `derivePlayedToEndButSkipped` — steer entries contribute 0 / are filtered by `action === 'skip'` respectively, already correct.

## UI: `SteeringRow` replaces `ActionOverlay`

`components/discovery/action-overlay.tsx` is deleted. New `components/discovery/steering-row.tsx`: a static two-pill row, same visual styling as today's overlay buttons, but no `visible` prop, no fade animation, no auto-dismiss — it's simply rendered or not, by the parent's existing `currentTrack ? (...) : (...)` branch:

```tsx
type SteeringRowProps = { onArtist: () => void; onSound: () => void };
export function SteeringRow({ onArtist, onSound }: SteeringRowProps) { /* two TouchableOpacity pills, same style as the old overlay's buttons */ }
```

## `app/(tabs)/index.tsx` changes

- Remove: `showActionButtons` state, `lastLikedRef`, the `ActionOverlay` import, every `setShowActionButtons(...)` call, and `handleLike`'s `lastLikedRef.current = track` line.
- `UndoSnapshot` drops the `showActionButtons` field (nothing left to restore).
- `applyLikeStrategy` → renamed `applySteeringStrategy(kind: 'artist' | 'sound', next: Strategy)`. Body is the same shape as today (`queue.slice(0, 1)` still preserves "the card currently committed to show" — it's just that this is now the still-showing current card, not the next-queued one) plus one new line: logs the steer entry against `currentTrack` before switching strategy.
- `handleMoreFromArtist`/`handleMoreLikeSound` read `currentTrack` instead of `lastLikedRef.current`; both call `captureUndoSnapshot()` first, same as every other history-touching handler, then `applySteeringStrategy(...)`.
- Render: `<SteeringRow onArtist={handleMoreFromArtist} onSound={handleMoreLikeSound} />` replaces `<ActionOverlay .../>`, inside the `currentTrack` branch next to `CardStack`.

## Testing (`lib/discovery.test.ts`)

- `deriveGenrePath`: a steer entry starts a new visit even when its genre matches the previous entry's; a non-steer entry still merges into a run that a steer entry opened, provided the genre matches.
- `rankGenresByVisits`: a steer entry contributes nothing to the visit count, including when it's the only entry for a genre in a session.
- `deriveTopArtists`: an artist reaching `minTracks` only via steer entries is excluded; a steer entry's `artistName` still resolves a name for an artist that also has qualifying judged entries.
- `deriveRatedGenres`, `rankGenresByListenTime`, `derivePlayedToEndButSkipped`: one boundary case each confirming a steer entry (no `listenMs`, action outside their filters) is inert.

## Files touched

| File | Change |
|---|---|
| `components/discovery/action-overlay.tsx` | Deleted |
| `components/discovery/steering-row.tsx` | New — static two-pill row |
| `lib/discovery.ts` | `SwipeAction` gains steer variants; `deriveGenrePath`'s run-boundary rule; `rankGenresByVisits` and `deriveTopArtists` filter steer entries out of counting |
| `lib/discovery.test.ts` | New/updated cases per above |
| `app/(tabs)/index.tsx` | Drop `showActionButtons`/`lastLikedRef`/`ActionOverlay`; rename+extend `applyLikeStrategy`; rewire `handleMoreFromArtist`/`handleMoreLikeSound` to `currentTrack` + undo; render `SteeringRow` |

## Out of scope

- Any visual distinction between a "steered" visit and a "drifted" one in the genre-path chain beyond the boundary itself (e.g. `Pop → Pop` renders as two plain segments, not annotated) — a display polish for later if it reads as confusing in practice.
- Changing `deriveGenresHeard`, `pickJumpGenre`, or `refillQueueWithFallback`.
- Any change to swipe-gesture directions or `swipe-physics.ts`.
