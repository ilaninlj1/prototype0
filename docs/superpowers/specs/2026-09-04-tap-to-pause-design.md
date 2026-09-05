# Tap-to-Pause on the Swipe Card

**Goal:** Tapping the current swipe card pauses playback; tapping again resumes; tapping after the preview has finished replays it from the start. A small play icon over the artwork signals when tapping would do something, purely gesture-based (no separate buttons).

**Scope:** `components/discovery/swipe-card.tsx`, `components/discovery/card-stack.tsx`, `app/(tabs)/index.tsx`. No interaction with queue/strategy/undo state — this is playback-only and doesn't touch `swipeHistory`, `discoveredGenres`, or anything the rest of the screen tracks.

## Gesture composition

`SwipeCard` already has a `Gesture.Pan()` for drag/swipe. Add `Gesture.Tap()` and combine them with `Gesture.Race(pan, tap)` — react-native-gesture-handler's standard composition for "either this resolves as a tap or a pan, whichever the touch turns out to be" on the same view. A tap (minimal movement, quick release) wins and fires its own handler without also triggering a drag; a real drag exceeds the tap's movement tolerance and only the pan activates. No custom thresholds needed — both gestures' defaults already handle this distinction.

## Playback state

`app/(tabs)/index.tsx` reintroduces `useAudioPlayerStatus(player)` (removed after Stage 2 as unused at the time — genuinely needed now).

- **Paused vs. playing**: `!status.playing` while a track is loaded covers this directly.
- **Ended**: `status.didJustFinish` is an event flag, true only in the single status update right after the preview ends — not safe to read later to ask "did this end". Captured into a `hasEnded` boolean state via a `useEffect` watching it, reset to `false` whenever `currentTrack?.id` changes (a fresh card is never "ended").
- Both paused and ended leave `status.playing === false`, so one combined flag drives the icon: `showPlayIcon = !!currentTrack && status.isLoaded && !status.playing`.

## Tap handler

```ts
async function handleCardTap() {
  if (!currentTrack || !status.isLoaded) return;
  if (hasEnded) {
    setHasEnded(false);
    await player.seekTo(0); // don't rely on play() implicitly restarting from the end
    player.play();
    return;
  }
  if (status.playing) {
    player.pause();
  } else {
    player.play();
  }
}
```

Explicit `seekTo(0)` before replaying rather than assuming `play()` restarts a finished player on its own — that behavior isn't documented and I'm not confident it's consistent across platforms, so this makes it deterministic regardless.

## Play icon overlay

`CardFace` gains an optional `showPlayIcon` prop (default `false`) and renders a centered, semi-transparent circle with a `▶` glyph over the artwork when true — wrapping the artwork `Image` in a relatively-positioned container so the overlay sits only over the image, not the whole card. Defaulting to `false` means `CardStack`'s static background-card rendering (which doesn't pass this prop) is unaffected — only the interactive top card, via `SwipeCard`, ever shows it.

## Prop threading

- `SwipeCard`: new `onTap: () => void` prop, wired into the composed gesture; passes `showPlayIcon` through to `CardFace`.
- `CardStack`: new `onTap` prop, passed to the top (index 0) `SwipeCard` only — background cards are already `pointerEvents="none"` and never interactive.
- `index.tsx`: `handleCardTap` wired as `onTap`; `showPlayIcon` computed as above and passed down.

## Files touched

| File | Change |
|---|---|
| `components/discovery/swipe-card.tsx` | `Gesture.Tap()` + `Gesture.Race`; `onTap`/`showPlayIcon` props; overlay in `CardFace` |
| `components/discovery/card-stack.tsx` | Thread `onTap`/`showPlayIcon` to the top card |
| `app/(tabs)/index.tsx` | Reintroduce `useAudioPlayerStatus`; `hasEnded` state; `handleCardTap` |

## Out of scope

- Any visual "scrubber"/progress indicator — this is play/pause/replay only.
- Logging a swipe-history entry or touching undo state for a tap — it's pure playback control.
