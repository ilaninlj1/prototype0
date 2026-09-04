# Swipe-based music discovery — design

Date: 2026-09-04
Status: approved, pending implementation plan

## Summary

Replace Blindspot's ten-track blind quiz (`setup → playing → reveal → summary`) on
the Home tab with a continuous, Tinder-style swipe feed for music discovery. A stack
of track cards (artwork, title, artist, genre) plays each track's preview
automatically when it's on top; swiping left skips, swiping right signals "more of
this" (with a follow-up choice of artist vs. sound), and swiping down jumps to an
unheard genre. The queue always stays 2-3 tracks deep so there's no gap between
cards.

The Profile tab (`app/(tabs)/explore.tsx`) and the quiz's own library
(`lib/taste-test.ts`) are explicitly out of scope and untouched — see "Relationship
to the existing quiz" below.

## Non-goals

- No redesign of the Profile tab. It keeps working off whatever quiz history
  already exists; it will simply stop receiving new entries. Redesigning it for
  the new interaction model is a future, separate piece of work.
- No genre-picker / onboarding screen. The first cards are seeded randomly.
- No weighted/blended recommendation strategy (mixing several recent artists or
  genres at once). One active strategy at a time — see "Strategy engine".
- No changes to `lib/taste-test.ts` or its storage keys.

## Relationship to the existing quiz

`app/(tabs)/explore.tsx` (Profile) imports `clearGenrePicks`, `isMismatch`,
`loadGenrePicks`, `loadHistory`, `GenrePicks`, and `HistoryEntry` from
`lib/taste-test.ts`, and its entire UI (mismatch rate, stated-vs-actual genres,
"Redo setup") is built on the quiz's rating/pool data model. The new swipe feed has
no equivalent concepts (no 1-5 rating, no liked/disliked pool, no mismatch), so
force-fitting swipe actions into that model would be an arbitrary mapping that
muddies both.

Decision: keep `lib/taste-test.ts` and `app/(tabs)/explore.tsx` completely
untouched. The new feature lives entirely in a new module, `lib/discovery.ts`, with
its own AsyncStorage key prefix (`blindspotDiscovery:*`, vs. the quiz's
`blindTasteTest:*`). Profile is provably unaffected by this change; it will read as
stale until it's redesigned in a later pass, which is expected and accepted.

`discovery.ts` does not import from `taste-test.ts` except reading the existing
`GENRES` constant (a read-only list, kept as the single genre vocabulary across
both features). Its own shuffle/dedupe helpers are reimplemented locally rather
than reused, so each module stays independently reasoned about and neither can be
broken by changes to the other.

## Data model

New file `lib/discovery.ts`:

```ts
type DiscoveryTrack = {
  id: number;              // trackId
  trackName: string;
  artistId: number;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
};

type SwipeAction = 'skip' | 'like' | 'genre-jump';

type SwipeEntry = {
  trackId: number;
  artistId: number;
  genre: string;
  action: SwipeAction;
  timestamp: number;
};

type Strategy =
  | { type: 'genre'; genre: string }
  | { type: 'artist'; artistId: number; artistName: string };
```

## Persistence

One new AsyncStorage key, `blindspotDiscovery:swipeHistory`, holding
`SwipeEntry[]` — append-only, same best-effort pattern as
`taste-test.ts`'s `loadHistory`/`appendHistoryEntry` (read/write failures fall back
to empty rather than throwing).

On hydrate, derive three in-memory `Set`s from `swipeHistory` (no separate storage
keys for these — single source of truth):

- `seenTrackIds` — every `trackId` that has ever appeared as a swipe entry.
  Used to filter fetches so a track is never shown twice.
- `visitedArtistIds` — every `artistId` from swipe entries.
- `genresHeard` — every `genre` from swipe entries. A genre counts as "heard" once
  a track of it reached the top of the stack and played, **regardless of swipe
  direction** (skip, like, and genre-jump all imply the track was heard).

## iTunes fetch layer

- `fetchTracksByGenre(genre: string): Promise<DiscoveryTrack[]>` — same
  `search?term=...&entity=song&limit=25` endpoint shape as the quiz's
  `fetchGenreTracks`, but mapped to `DiscoveryTrack` (no `pool`/`sourceGenre`).
- `fetchTracksByArtist(artistId: number): Promise<DiscoveryTrack[]>` — the iTunes
  **lookup** endpoint: `https://itunes.apple.com/lookup?id={artistId}&entity=song&limit=25`.
- Both filter out results with no `previewUrl` and map through the same shape.

## Queue and strategy engine

- `queue: DiscoveryTrack[]`, target depth 3 (current top card + 2 buffered ahead).
- `strategy: Strategy` — one active strategy at a time; it alone determines what
  gets fetched to refill the queue. Recommended over a weighted/blended multi-strategy
  feed as YAGNI — the spec describes one active preference at a time ("tapping
  *either* loads the next queue accordingly"), and blending is real complexity with
  no stated need yet.
- `refillQueue()` runs after every pop or strategy change: fetch from the current
  strategy, filter out `seenTrackIds` and anything already in the queue, dedupe,
  append until the queue is back to target depth.

### Swipe left — skip

Pop the queue, show/play the next buffered card. No strategy change, no overlay.
Backfill continues under whatever strategy is already active. Log a `'skip'` swipe
entry.

### Swipe right — "more of this"

The already-buffered next card shows and plays **immediately** — never blocked on a
button tap. Two buttons ("More from this artist" / "More like this sound") overlay
for ~4 seconds and only steer the *next backfill* (future cards), not the
immediately-next card:

- "More from this artist" → `strategy = { type: 'artist', artistId, artistName }`
  of the track that was just swiped.
- "More like this sound" → `strategy = { type: 'genre', genre }` of the track that
  was just swiped.
- Untapped after ~4s → defaults to the "More like this sound" behavior.

Log a `'like'` swipe entry immediately on the swipe (not on the button tap).

### Swipe down — genre jump

Pick a random genre from `GENRES` not in `genresHeard`; once all genres have been
heard, fall back to the least-recently-heard one (derived from `swipeHistory`
order) rather than a hard stop. Unlike swipe-right, this is **immediate**: discard
the buffered queue tail and fetch fresh for the new genre right away, since a
genre jump reads as "pivot now," not "steer the future." Set
`strategy = { type: 'genre', genre: newGenre }`. Log a `'genre-jump'` swipe entry.

## Initial seed

No setup/onboarding screen. On first load (and on every cold start), pick a random
genre from `GENRES` and seed the queue from it via `fetchTracksByGenre`. Returning
users are not specially seeded from anything — this is a deliberate simplification
(see Non-goals).

## UI / gesture structure

New `components/discovery/`:

- `swipe-card.tsx` — one draggable card. `Gesture.Pan()` (react-native-gesture-handler)
  driving Reanimated shared values for `translateX`/`translateY`; rotation
  interpolated from `translateX` for the Tinder-style tilt. Commit thresholds
  (distance and/or velocity) resolve to left/right/down; under threshold, spring
  back to center. Exposes `onSwipe(direction)` to the parent.
- `card-stack.tsx` — renders up to 3 queue entries: the top one is the interactive
  `SwipeCard`; the 1-2 behind are static (translateY/scale offset only,
  non-interactive), purely for the stacked-depth look.
- `action-overlay.tsx` — the two post-like buttons with their ~4s auto-fade.

`app/(tabs)/index.tsx` is rewritten to own `queue`/`strategy` state (via
`lib/discovery.ts`), own the single `useAudioPlayer` instance wired to whichever
track is currently on top (autoplay on top-card change; playback is undisturbed by
dragging — only a committed swipe changes the source), and render `<CardStack>` +
conditionally `<ActionOverlay>` after a right-swipe.

## File layout

- New: `lib/discovery.ts`, `components/discovery/swipe-card.tsx`,
  `components/discovery/card-stack.tsx`, `components/discovery/action-overlay.tsx`.
- Rewritten: `app/(tabs)/index.tsx`.
- Untouched: `lib/taste-test.ts`, `app/(tabs)/explore.tsx`, all theming
  (`components/themed-text.tsx`, `components/themed-view.tsx`,
  `constants/theme.ts`, `hooks/use-theme-color.ts`).

## Staged implementation (each stage lands as one commit, runnable in Expo)

1. **Data layer + placeholder UI.** All of `lib/discovery.ts` — fetch, persistence,
   queue/backfill, strategy, no-repeat filtering. `index.tsx` shows the top card
   (artwork/title/artist/genre) with plain Skip / Like buttons (no gesture yet) and
   a temporary "New genre" button standing in for swipe-down; the two post-like
   buttons render as regular buttons. This proves out all the logic — persistence,
   no-repeats, queue depth, artist lookup, genre-jump — before any gesture work is
   layered on.
2. **Real gesture physics.** Swap the tap buttons for `SwipeCard`/`CardStack`:
   actual drag, tilt, and commit thresholds via `react-native-gesture-handler` +
   `react-native-reanimated`, mapped to the same handlers built in stage 1. Visual
   stack of up to 3 cards.
3. **Polish + cleanup.** Proper Reanimated fade on the action overlay (replacing
   any plain timer from stage 1), delete the dead setup/playing/reveal/summary code
   and now-unused styles from `index.tsx`, update `CLAUDE.md`'s architecture
   section to describe the new Home tab flow, add a `changelog.md` entry.

## Testing

No test runner is configured in this repo (per `CLAUDE.md`); verification is
manual, by running the app via `npm start` / `npm run ios` and exercising each
stage's behavior directly. `npx tsc --noEmit` should be run after each stage as a
type-check gate.
