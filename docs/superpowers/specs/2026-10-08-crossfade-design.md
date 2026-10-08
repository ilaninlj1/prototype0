# Crossfade while dragging — design

2026-10-08. From `features.md` 2026-09-04 ("Crossfade between tracks while dragging").

Swipes today: left = skip, right = reveal (the song keeps playing), down = jump genre. So the crossfade only
happens on a **left drag**: the song you're leaving fades out while the next card's song fades in. Right and
down drags don't touch the audio.

## Behavior

- Mix amount `m = clamp(-translationX / SWIPE_THRESHOLD, 0, 1)` while dragging left; `m = 0` otherwise.
- Equal-power curve so the middle doesn't dip: current volume `cos(m·π/2)`, next volume `sin(m·π/2)`.
- The next song starts (from 0) only once `m > 0.1`, so a tap or a small wobble never starts it.
- **Release without a skip** (snaps back): volumes ease back to 1 / 0 over ~200ms, then the next song pauses
  and rewinds to 0.
- **Skip commits:** the next card becomes current and keeps playing from where the faded-in preview already
  is, at full volume, with no restart or gap.
- No crossfade when the current song is paused, the next card has no preview, or the queue has no next card.

## Shape

- `hooks/use-playback.tsx` gets a second player (the "peek" player) in `PlaybackProvider`, with `peekLoad(url)`
  (load the next card's preview without playing, done when a card becomes current), `setMix(m)`, `cancelPeek()`
  and `promotePeek()` (the main player takes over the peek's source and position, or the two swap roles,
  whichever is gapless with expo-audio).
- `swipe-card.tsx` reports the mix from the pan gesture via `runOnJS`, throttled (only when `m` moved by 0.03+)
  so the JS thread isn't flooded.
- Pure math (`mixVolumes(m)`, the start threshold, the throttle step) in `lib/crossfade.ts` with tests.
