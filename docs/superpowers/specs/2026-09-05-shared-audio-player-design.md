# One Shared Audio Player, App-Wide

**Goal:** The swipe screen, liked tracks list, and export history each call `useAudioPlayer(null)` independently — three separate native players that don't know about each other, so starting playback on one never stops another. There should be exactly one preview playing at a time, app-wide.

**Root cause confirmed:** `useAudioPlayer`'s underlying `useReleasingSharedObject` scopes the native player to whichever component called the hook, releasing it only on that component's own unmount. Three call sites, three independent players.

**Scope:** New `hooks/use-playback.tsx`, `app/_layout.tsx`, and the three screens that currently call `useAudioPlayer` directly (`app/(tabs)/index.tsx`, `app/modal.tsx`, `app/export-history.tsx`).

## One player, created once, shared via context

```tsx
// hooks/use-playback.tsx
const PlaybackContext = createContext<{ player: AudioPlayer; status: AudioStatus } | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  return <PlaybackContext.Provider value={{ player, status }}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() { /* throws if used outside PlaybackProvider */ }
```

`app/_layout.tsx` wraps the whole app in `<PlaybackProvider>` — it never unmounts during normal navigation, so the one `AudioPlayer` instance persists for the app's lifetime. The three screens replace their own `useAudioPlayer(null)` + `useAudioPlayerStatus(player)` calls with `const { player, status } = usePlayback()`.

This alone solves "starting playback anywhere stops whatever was playing": since every screen now calls `.replace()`/`.play()` on the *same* underlying player, starting a new preview inherently replaces whatever the old one was — no coordination code needed, just no longer having three players to coordinate between.

`setAudioModeAsync({ playsInSilentMode: true })` moves from the swipe screen's bootstrap effect into `PlaybackProvider`'s own mount effect — it's a global audio-session setting, not something specific to one screen, and the liked tracks/export history screens should get it too regardless of whether the swipe screen has been visited yet in the session.

## Leaving a screen stops its playback

With one shared player, "leaving a screen" needs an explicit pause — nothing else about sharing a player instance provides this on its own. Each of the three screens gets a `useFocusEffect` whose cleanup calls `player.pause()`:

```ts
useFocusEffect(
  useCallback(() => {
    return () => player.pause();
  }, [player])
);
```

`useFocusEffect`'s cleanup fires on both blur (another screen pushed on top, or a tab switch) and unmount — covering "navigated away" regardless of whether expo-router actually unmounts the previous screen or just stops rendering it, which isn't something to rely on. `app/(tabs)/index.tsx` doesn't use `useFocusEffect` today (its autoplay is a plain `useEffect` keyed on `currentTrack?.id`); this adds a second, independent effect for focus-based pausing rather than folding it into the existing one.

For the liked tracks list and export history (which track a local `playingId` to know which row's button shows "pause"), the same cleanup also resets `playingId` to `null` — otherwise a row could keep showing a pause icon for a track that's no longer actually playing.

**Deliberately not doing**: resuming playback when a screen regains focus. If you leave the swipe screen mid-preview and come back, it stays paused rather than auto-resuming — the existing tap-to-pause/resume gesture is already the way to restart it, and auto-resuming on refocus wasn't asked for and adds a case (should a *different* card's preview auto-start if the queue somehow advanced while away? it can't, but the question itself shows this is scope creep) that's cleaner to just not have.

## Files touched

| File | Change |
|---|---|
| `hooks/use-playback.tsx` | New — `PlaybackProvider`, `usePlayback` |
| `app/_layout.tsx` | Wrap the app in `PlaybackProvider`; move `setAudioModeAsync` there |
| `app/(tabs)/index.tsx` | Use `usePlayback()`; add pause-on-blur `useFocusEffect` |
| `app/modal.tsx` | Use `usePlayback()`; pause-on-blur also resets `playingId` |
| `app/export-history.tsx` | Same as `app/modal.tsx` |

## Out of scope

- Resuming playback on refocus (see above).
- Any lock-screen/notification "now playing" integration — `expo-audio`'s `setActiveForLockScreen` exists but nothing here currently uses it, and this fix doesn't need it.
