# Liked Tracks List

**Goal:** Right-swipes are logged as `'like'` in swipe history but there's no way to see them. Add a screen listing every liked track — artwork, title, artist, genre — newest first, with a way to replay each preview, reachable from the swipe screen.

**Scope:** Bounded addition to the existing Home tab discovery flow. No changes to `lib/discovery.ts`'s pure engine.

## The data gap

`SwipeEntry` (what `swipeHistory` persists) is `{ trackId, artistId, genre, action, timestamp }` — no title, artist name, artwork, or preview URL. There's nothing in the existing persisted history to render a list from. This needs a second, independent store of full `DiscoveryTrack` records for likes specifically — kept separate from `swipeHistory` rather than bloating `SwipeEntry` with display fields, since the two serve different purposes (`swipeHistory` drives strategy/seen-tracking logic; this is purely for display).

`lib/discovery-storage.ts` gains:

```ts
const LIKED_TRACKS_KEY = `${STORAGE_PREFIX}:likedTracks`;

export async function loadLikedTracks(): Promise<DiscoveryTrack[]> { ... }   // same load/parse/fallback pattern as loadSwipeHistory
export async function appendLikedTrack(track: DiscoveryTrack): Promise<void> { ... } // same pattern as appendSwipeEntry
```

`app/(tabs)/index.tsx`'s `handleLike` calls `appendLikedTrack(track)` alongside its existing `logSwipe(track, 'like')` call — both fire on every right-swipe, independently.

Storage order is chronological (always appended); the screen reverses it for newest-first display, so no separate timestamp field is needed on the stored record.

## Route

`app/modal.tsx` is unused boilerplate (`"This is a modal"` + a link home) with a modal `Stack.Screen` already registered in `app/_layout.tsx`. Repurpose it as the Liked Tracks screen rather than adding a new route. Update its `Stack.Screen` `title` from `'Modal'` to `'Liked Tracks'`.

## Trigger

A small pill button, bottom-right corner (Undo occupies top-left, the genre picker's trigger occupies top-right), rendered in `app/(tabs)/index.tsx`. `onPress` calls `router.push('/modal')` (`useRouter` from `expo-router`).

## Screen (`app/modal.tsx`, rewritten)

- Reload-on-focus via `useFocusEffect` (mirrors `app/(tabs)/explore.tsx`'s existing pattern), so a track liked after the screen was last opened still shows up on return.
- One shared `useAudioPlayer` + `useAudioPlayerStatus` for the whole screen (not one per row). `playingId` state tracks which track the player's source is currently loaded with.
- List: `ScrollView` of rows, newest-first (`[...tracks].reverse()`). Each row: artwork (`expo-image`), `trackName`, `artistName`, `primaryGenreName` — same fields `CardFace` shows, but its own row layout (a list row, not a swipeable card) rather than reusing `CardFace` directly.
- Each row has a play/pause button:
  - Tapping a row whose track isn't currently loaded: `player.replace(track.previewUrl); player.play(); setPlayingId(track.id)`.
  - Tapping the row that's currently loaded and playing: `player.pause()`.
  - Tapping the row that's currently loaded and paused: `player.play()`.
  - Button icon/label reflects `playingId === track.id && status.playing`.
- Empty state: `"No liked tracks yet — swipe right on something you like."`

## Files touched

| File | Change |
|---|---|
| `lib/discovery-storage.ts` | Add `loadLikedTracks`, `appendLikedTrack` |
| `app/(tabs)/index.tsx` | `appendLikedTrack` call in `handleLike`; new trigger button + `useRouter` |
| `app/modal.tsx` | Rewritten — the Liked Tracks screen |
| `app/_layout.tsx` | Modal screen's `title` updated |

## Out of scope

- Un-liking a track from this screen, or any editing.
- Deduping (a track can only be liked once anyway, since `seenTrackIds` prevents it from resurfacing after any swipe).
- Sharing/exporting the list (already logged as a separate, larger feature idea in `features.md` — Spotify/Apple Music export).
