# Genre Picker

**Goal:** Swipe-down already jumps to a genre, but the choice is random (`pickJumpGenre`). Add a button on the swipe screen that opens a flat list of every genre — `discoveredGenres` plus the base `GENRES` — and lets the user jump to one directly, marking which they've already heard.

**Scope:** Bounded addition to the existing Home tab discovery flow. No changes to `lib/discovery.ts`'s pure engine, no new dependencies (uses React Native's built-in `Modal`), no nesting/categorization of the genre list.

## Component

New `components/discovery/genre-picker.tsx`, self-contained — owns both the trigger button and the list's open/closed state, so the parent only supplies data and a callback:

```ts
type GenrePickerProps = {
  genres: string[];       // already deduped + sorted
  heardGenres: Set<string>;
  onSelect: (genre: string) => void;
};
```

- A small pill button, top-right (mirrors `UndoButton`'s top-left), in the same visual language (`TouchableOpacity` / `ThemedView` / `ThemedText`).
- Tapping it opens a `Modal`: translucent backdrop (tap to dismiss, no selection), a rounded sheet sliding up from the bottom containing a scrollable list of genre rows.
- Each row: genre name, plus a checkmark (or equivalent dim/marked treatment) when `heardGenres.has(genre)`. No indicator for whichever genre the current strategy is already on — out of scope for this pass.
- Tapping a row calls `onSelect(genre)` and closes the sheet immediately.

## Genre set and heard-marking (in `app/(tabs)/index.tsx`)

- `const allGenres = useMemo(() => Array.from(new Set([...discoveredGenres, ...GENRES])).sort(), [discoveredGenres]);` — alphabetical, since the list only grows over a session and needs to stay scannable.
- `const genresHeard = useMemo(() => deriveGenresHeard(swipeHistory), [swipeHistory]);` — the same pure helper `handleGenreJump` already uses for its own selection.

## Selection behavior

Picking a genre should do exactly what a swipe-down does, minus the randomness. Refactor the shared tail out of `handleGenreJump` into:

```ts
async function commitGenreJump(genre: string, nextHistory: SwipeEntry[]) {
  const nextStrategy: Strategy = { type: 'genre', genre };
  setStrategy(nextStrategy);
  setQueue([]); // discard the buffered tail — immediate, not queued
  await runRefill([], nextStrategy, nextHistory, discoveredGenres);
}
```

`handleGenreJump` becomes: log the swipe, derive `genresHeard`, pick randomly via `pickJumpGenre`, call `commitGenreJump`. The new `handlePickGenre(genre)`:

```ts
async function handlePickGenre(genre: string) {
  captureUndoSnapshot();
  setShowActionButtons(false);
  const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
  await commitGenreJump(genre, nextHistory);
}
```

- Logs a `'genre-jump'` entry against whatever's currently showing, same as swipe-down abandoning it — skipped if the queue is already empty (nothing to attribute a swipe to).
- `captureUndoSnapshot()` is `handleCardSwipe`'s existing snapshot line (`setUndoSnapshot({ queue, strategy, discoveredGenres, swipeHistory, showActionButtons })`), factored into its own function and called from both places — a mis-tap in the list is undoable exactly like a mis-swipe, through the same one-level full-rollback mechanism already in place.
- Closes the action-overlay if it's open, matching how any other queue-changing action already invalidates a stale overlay.
- Goes through the existing `runRefill`, so it's already covered by the `refillEpochRef` guard against a stale in-flight refill clobbering things later.

## Files touched

| File | Change |
|---|---|
| `components/discovery/genre-picker.tsx` | New — trigger button + modal list |
| `app/(tabs)/index.tsx` | `allGenres`/`genresHeard` memos, `captureUndoSnapshot`, `commitGenreJump`, `handlePickGenre`, render `<GenrePicker>` |

## Out of scope

- Nesting/categorizing genres, or any indicator for the currently-active strategy genre.
- Sorting by anything other than alphabetical (e.g. heard-first, or most-recent).
