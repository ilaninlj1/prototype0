# Undo Button and Swipe-Dismissed Action Overlay

**Goal:** A mis-swipe is currently permanent — the track is marked seen and never resurfaces. Add a persistent Undo button that fully rolls back the single most recent swipe. Alongside it, change the action overlay ("More from this artist" / "More like this sound") from timer-driven to swipe-driven dismissal, since the two interact: undo needs to know whether the overlay was showing before the swipe it's rolling back.

**Scope:** Bounded change to the existing Home tab discovery flow (`app/(tabs)/index.tsx`, `components/discovery/*`, `lib/discovery-storage.ts`). No new dependencies, no changes to `lib/discovery.ts`'s pure engine or to the Profile tab.

## Undo

One level of undo, full rollback. "Full rollback" means: undoing a swipe restores every piece of state exactly as it was immediately before that swipe, not just the swiped track's position.

**What gets snapshotted, and when:** `handleCardSwipe(direction, track)` — the single dispatch point for every swipe, regardless of direction — captures a snapshot of `{ queue, strategy, discoveredGenres, swipeHistory, showActionButtons }` *before* doing anything else for that swipe. This becomes the one and only undo slot (`undoSnapshot` state), overwritten by each new swipe and cleared to `null` once consumed by an undo. That's what makes it "one level": there is nothing to restore again until another swipe happens.

**What undo does:** restores all five snapshotted fields via their setters, persists the restored `swipeHistory` and `discoveredGenres` back to storage, and clears the undo slot. Restoring `queue` un-pops the swiped track *and* discards anything a subsequent backfill (or a genre-jump's full requeue, or a "More from this artist/sound" strategy switch) added on top of it — the queue goes back to exactly what it was. Restoring `strategy`/`discoveredGenres` undoes a genre-jump's new strategy or a post-like artist/sound choice made via the overlay in the same window (that choice only exists between a like and the next swipe, i.e. within the swipe this undo is rolling back). Restoring `showActionButtons` re-opens the overlay if the prior swipe had already closed one from an earlier like.

Since `currentTrack` becomes the restored `queue[0]`, the existing autoplay effect (keyed on `currentTrack?.id`) restarts that track's preview automatically — "resume playing" means "plays again from the start," matching how every other current-track change already works; there's no seek/resume-position concept anywhere in this app.

**Race with in-flight refills:** `handleSkip`/`handleLike`/`handleGenreJump`/`applyLikeStrategy` all end in an async `runRefill` call. If undo fires while one is still in flight, that fetch resolving *after* the rollback would silently clobber the just-restored state with the very backfill undo was supposed to erase. Guard this with a monotonic counter (`refillEpochRef`): every `runRefill` call captures the epoch at its own start and only applies its result if the ref still matches that epoch when it resolves; `handleUndo` bumps the ref before restoring state, so any refill started before the undo is discarded on arrival. This also tightens ordering for the pre-existing (non-undo) case of two swipes firing in quick succession — the most recently *started* refill wins regardless of which resolves first, rather than whichever happens to land last by network timing.

**Persistence:** add `saveSwipeHistory(history: SwipeEntry[]): Promise<void>` to `lib/discovery-storage.ts`, mirroring the existing `saveDiscoveredGenres` — write the array directly rather than "load current, pop last, save" (which would race against the original swipe's own in-flight `appendSwipeEntry` write). Undo already has the correct trimmed array in memory; it just needs to overwrite storage with it.

**UI:** new `components/discovery/undo-button.tsx` — a small pill button in the same visual language as the action-overlay buttons (`TouchableOpacity` / `ThemedView` / `ThemedText`), absolutely positioned top-left, dimmed and `disabled` when `undoSnapshot` is `null`. Rendered unconditionally in `HomeScreen`'s main return (above the `currentTrack ? … : …` branch) so it can also recover an empty "No more tracks" state if the swipe that emptied the queue is still undoable.

## Action overlay: swipe-dismissed, not timer-dismissed

- Remove `AUTO_DISMISS_MS`, its `setTimeout`, and the `onSoundRef` ref from `action-overlay.tsx` entirely. The component still fades in on `visible=true` (400ms) and fades out on `visible=false` — it just no longer drives that transition itself.
- `handleCardSwipe` sets `showActionButtons(false)` unconditionally before dispatching to skip/like/genre-jump, so any next swipe closes it; a right-swipe's own `setShowActionButtons(true)` (in `handleLike`) then immediately reopens it for the new like.
- No more auto-default: since there's no timer, swiping away from an unanswered overlay no longer implies "More like this sound." Strategy simply doesn't change until the user explicitly taps a button. This is a deliberate behavior change from the timer-based version — confirmed as wanted, not an oversight.

## Files touched

| File | Change |
|---|---|
| `lib/discovery-storage.ts` | Add `saveSwipeHistory` |
| `components/discovery/action-overlay.tsx` | Remove auto-dismiss timer and its ref |
| `components/discovery/undo-button.tsx` | New — presentational pill button |
| `app/(tabs)/index.tsx` | `undoSnapshot` state, `refillEpochRef`, `handleUndo`, snapshot capture + overlay dismissal in `handleCardSwipe`, epoch guard in `runRefill`, render `UndoButton` |

## Out of scope

- Reverting `discoveredGenres`/`swipeHistory` further back than one swipe, or undoing an undo.
- True audio resume-from-position on undo (or anywhere else) — previews always restart from 0.
- Hardening `appendSwipeEntry`'s own pre-existing load-then-save race (unrelated to this feature; `saveSwipeHistory` sidesteps it for undo's own write but doesn't fix the general case).
