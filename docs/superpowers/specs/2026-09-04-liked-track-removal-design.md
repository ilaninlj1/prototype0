# Per-Track Removal on the Liked Tracks List

**Goal:** Swiping a row left on the liked tracks list reveals a delete action that removes that track from `likedTracks` storage, using the standard swipe-to-delete pattern.

**Scope:** Bounded addition to `app/modal.tsx` and `lib/discovery-storage.ts`. No changes to `lib/discovery.ts` or the swipe screen.

## Safety mechanism: confirm, not undo

Decision (flag if you want it reversed): a confirmation dialog before deleting, not an undo-after-the-fact snackbar. `app/(tabs)/explore.tsx`'s `handleRedoSetup` already solves this exact shape of problem — `Alert.alert` with a Cancel / destructive-styled confirm pair — for an action that's *less* severe (clears genre picks, keeps rating history) than permanently deleting a liked-track record. Reusing that established pattern is simpler than introducing a new undo-snackbar/toast concept that doesn't exist anywhere else in this app, and needs no new timer or transient-state machinery.

The swipe screen's existing `UndoButton` is unrelated — it's scoped to `HomeScreen`'s own state and undoes swipe actions (skip/like/genre-jump), not reachable or relevant from this modal screen.

## Swipe component

`ReanimatedSwipeable` from `react-native-gesture-handler/ReanimatedSwipeable` (confirmed present in the installed `react-native-gesture-handler@2.28.0`, alongside the legacy `Swipeable`). Chosen over the legacy component because this codebase's other gesture code (`SwipeCard`) is already fully Reanimated-based — mixing in the older Animated-API `Swipeable` would be an inconsistency, not a simplification.

- Wraps each row. `renderRightActions` renders a red "Delete" button revealed by a left swipe.
- A ref per row (`useRef` inside the row, or a `Map<number, SwipeableRef>` at the screen level) lets the code call `.close()` explicitly:
  - On cancel (`Alert.alert`'s Cancel button): close the row, no state change.
  - On confirm: the row is about to unmount anyway (filtered out of `tracks`), so no explicit close is needed there.

## Persistence

New `lib/discovery-storage.ts` function, mirroring the existing `saveSwipeHistory`'s overwrite pattern (the screen already holds the full list in state — no need to reload from disk first):

```ts
export async function saveLikedTracks(tracks: DiscoveryTrack[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(tracks));
  } catch {
    // ignore
  }
}
```

## Flow (`app/modal.tsx`)

```
handleRequestDelete(track):
  Alert.alert('Remove from liked tracks?', `"${track.trackName}" will be removed.`, [
    { text: 'Cancel', style: 'cancel', onPress: () => close that row's Swipeable },
    { text: 'Remove', style: 'destructive', onPress: () => handleConfirmDelete(track) },
  ])

handleConfirmDelete(track):
  next = tracks.filter(t => t.id !== track.id)
  setTracks(next)
  await saveLikedTracks(next)
```

If the currently-playing track is the one being removed, stop it first (`player.pause()`) — otherwise its preview keeps playing after it's no longer in the list, with no row left to pause it from.

## Files touched

| File | Change |
|---|---|
| `lib/discovery-storage.ts` | Add `saveLikedTracks` |
| `app/modal.tsx` | Wrap each row in `ReanimatedSwipeable`; `handleRequestDelete`/`handleConfirmDelete`; stop playback if the removed track was playing |

## Out of scope

- Bulk delete / multi-select.
- Any "recently removed" recovery beyond the confirm dialog itself (no trash/archive).
