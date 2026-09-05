import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

type PlaybackContextValue = {
  player: AudioPlayer;
  status: AudioStatus;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * One AudioPlayer for the whole app, created once here at the root (see
 * app/_layout.tsx) rather than once per screen. Every screen previously
 * called useAudioPlayer(null) itself, which creates an independent native
 * player scoped to that component — three call sites meant three players
 * that didn't know about each other, so starting a preview on one screen
 * never stopped one already playing on another. Sharing a single instance
 * fixes that by construction: every screen's replace()/play() acts on the
 * same player, so starting a new preview always replaces whatever the old
 * one was.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  return <PlaybackContext.Provider value={{ player, status }}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}
