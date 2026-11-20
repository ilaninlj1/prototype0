import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { createPlaybackCrossfade } from '@/lib/playback-crossfade';

// Left alone, the iPhone fills Now Playing (Dynamic Island, Control Center, lock screen) from the
// preview file's own tags, cover and title included, which gives a blind card away. Naming the
// player ourselves replaces that, for every song, since the player can't tell blind from revealed.
const BLIND_NOW_PLAYING = { title: 'Listening blind', artist: 'Blindspot' };

type PlaybackContextValue = ReturnType<typeof createPlaybackCrossfade<AudioPlayer>> & {
  player: AudioPlayer;
  status: AudioStatus;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

// Screens share the current player; a silent second player peeks at the next card.
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const first = useAudioPlayer(null);
  const second = useAudioPlayer(null);
  const [player, setPlayer] = useState(first);
  // Keep each status subscription attached to its native player across swaps.
  const firstStatus = useAudioPlayerStatus(first);
  const secondStatus = useAudioPlayerStatus(second);
  const status = player === first ? firstStatus : secondStatus;
  const crossfade = useMemo(() => {
    const fade = createPlaybackCrossfade(first, second, setPlayer, {
      now: Date.now,
      // Wrapped: browsers throw "Illegal invocation" when these are called as methods of another object.
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    });
    // Opening the app never starts music on its own: the first song waits for a tap.
    fade.holdNext();
    return fade;
  }, [first, second]);

  useEffect(() => {
    // iOS only takes our Now Playing words from a player that doesn't mix with other apps' audio.
    setAudioModeAsync({ playsInSilentMode: true, ...(Platform.OS === 'ios' ? { interruptionMode: 'doNotMix' as const } : null) }).catch(
      () => {}
    );
  }, []);

  // Whichever player is current owns Now Playing; the crossfade swaps players, so this follows it.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    try {
      player.setActiveForLockScreen(true, BLIND_NOW_PLAYING);
    } catch {
      // A missing native method must never stop the music.
    }
  }, [player]);

  useEffect(() => {
    crossfade.refresh();
  }, [firstStatus.isLoaded, firstStatus.playing, secondStatus.isLoaded, secondStatus.playing, crossfade]);

  // Stop fades before useAudioPlayer releases its native objects.
  useLayoutEffect(() => () => crossfade.stopPreview(), [crossfade]);

  return <PlaybackContext.Provider value={{ player, status, ...crossfade }}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}

/**
 * Play `url` while this screen is focused, and take the shared player back
 * when you return to it (another screen may have loaded a different song in
 * the meantime). Pauses when the screen loses focus.
 */
export function usePreviewWhileFocused(url: string | undefined, nextUrl?: string) {
  const { playPreview, stopPreview, peekLoad } = usePlayback();
  // Blur stops both players; a card change must not pause a promoted preview.
  useFocusEffect(
    useCallback(() => () => stopPreview(), [stopPreview])
  );
  useFocusEffect(
    useCallback(() => { playPreview(url); }, [url, playPreview])
  );
  useFocusEffect(
    useCallback(() => { peekLoad(url ? nextUrl : undefined); }, [url, nextUrl, peekLoad])
  );
}
