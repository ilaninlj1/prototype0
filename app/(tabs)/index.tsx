import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';

import { ActionOverlay } from '@/components/discovery/action-overlay';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  deriveGenresHeard,
  deriveSeenTrackIds,
  extractGenres,
  fetchForStrategy,
  mergeDiscoveredGenres,
  pickJumpGenre,
  refillQueue,
  type DiscoveryTrack,
  type Strategy,
  type SwipeEntry,
} from '@/lib/discovery';
import {
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadSwipeHistory,
  saveDiscoveredGenres,
} from '@/lib/discovery-storage';
import { GENRES } from '@/lib/taste-test';

function randomGenre(): string {
  return GENRES[Math.floor(Math.random() * GENRES.length)];
}

export default function HomeScreen() {
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [showActionButtons, setShowActionButtons] = useState(false);

  const lastLikedRef = useRef<DiscoveryTrack | null>(null);

  const seenTrackIds = useMemo(() => deriveSeenTrackIds(swipeHistory), [swipeHistory]);

  const currentTrack = queue[0];

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Autoplay whenever the top card changes — this never fires mid-drag, only when
  // a committed swipe actually changes queue[0].
  useEffect(() => {
    if (currentTrack) {
      player.replace(currentTrack.previewUrl);
      player.play();
    } else {
      player.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // ---------- Bootstrap ----------

  useEffect(() => {
    (async () => {
      const [history, genres] = await Promise.all([loadSwipeHistory(), loadDiscoveredGenres()]);
      setSwipeHistory(history);
      setDiscoveredGenres(genres);

      const initialStrategy: Strategy = { type: 'genre', genre: randomGenre() };
      setStrategy(initialStrategy);
      await runRefill([], initialStrategy, deriveSeenTrackIds(history), genres);

      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Queue refill ----------

  async function runRefill(
    baseQueue: DiscoveryTrack[],
    activeStrategy: Strategy,
    seenIds: Set<number>,
    knownGenres: string[]
  ) {
    try {
      const { queue: nextQueue, fetched } = await refillQueue(
        baseQueue,
        activeStrategy,
        seenIds,
        fetchForStrategy
      );
      setQueue(nextQueue);

      const merged = mergeDiscoveredGenres(knownGenres, extractGenres(fetched));
      if (merged !== knownGenres) {
        setDiscoveredGenres(merged);
        await saveDiscoveredGenres(merged);
      }
      setError(null);
    } catch {
      setError('Something went wrong fetching tracks. Check your connection and try again.');
    }
  }

  // ---------- Swipe handlers ----------

  async function logSwipe(track: DiscoveryTrack, action: SwipeEntry['action']) {
    const entry: SwipeEntry = {
      trackId: track.id,
      artistId: track.artistId,
      genre: track.primaryGenreName,
      action,
      timestamp: Date.now(),
    };
    const nextHistory = [...swipeHistory, entry];
    setSwipeHistory(nextHistory);
    await appendSwipeEntry(entry);
    return nextHistory;
  }

  async function handleSkip() {
    if (!currentTrack) return;
    const nextHistory = await logSwipe(currentTrack, 'skip');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, deriveSeenTrackIds(nextHistory), discoveredGenres);
  }

  async function handleLike() {
    if (!currentTrack) return;
    lastLikedRef.current = currentTrack;
    const nextHistory = await logSwipe(currentTrack, 'like');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    setShowActionButtons(true);
    await runRefill(nextQueue, strategy, deriveSeenTrackIds(nextHistory), discoveredGenres);
  }

  async function applyLikeStrategy(next: Strategy) {
    setShowActionButtons(false);
    setStrategy(next);
    await runRefill(queue, next, seenTrackIds, discoveredGenres);
  }

  function handleMoreFromArtist() {
    const liked = lastLikedRef.current;
    if (!liked) return;
    applyLikeStrategy({ type: 'artist', artistId: liked.artistId, artistName: liked.artistName });
  }

  function handleMoreLikeSound() {
    const liked = lastLikedRef.current;
    if (!liked) return;
    applyLikeStrategy({ type: 'genre', genre: liked.primaryGenreName });
  }

  async function handleGenreJump() {
    if (!currentTrack) return;
    const nextHistory = await logSwipe(currentTrack, 'genre-jump');
    const nextSeen = deriveSeenTrackIds(nextHistory);
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    const nextStrategy: Strategy = { type: 'genre', genre: newGenre };
    setStrategy(nextStrategy);
    setQueue([]); // discard the buffered tail — a genre jump is immediate, not queued
    await runRefill([], nextStrategy, nextSeen, discoveredGenres);
  }

  // ---------- Render ----------

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack ? (
        <>
          {currentTrack.artworkUrl100 ? (
            <Image source={{ uri: currentTrack.artworkUrl100 }} style={styles.artwork} />
          ) : null}
          <ThemedText type="subtitle">{currentTrack.trackName}</ThemedText>
          <ThemedText>{currentTrack.artistName}</ThemedText>
          <ThemedText style={styles.dim}>{currentTrack.primaryGenreName}</ThemedText>
          {!status.isLoaded && <ThemedText style={styles.dim}>Loading preview…</ThemedText>}

          <ThemedView style={styles.buttonRow}>
            <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText type="defaultSemiBold">Skip</ThemedText>
              </ThemedView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLike} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#e0f7ec" darkColor="#1d3d2f">
                <ThemedText type="defaultSemiBold">More of this</ThemedText>
              </ThemedView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGenreJump} activeOpacity={0.7}>
              <ThemedView style={styles.actionButton} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText type="defaultSemiBold">New genre</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          </ThemedView>

          <ActionOverlay
            visible={showActionButtons}
            onArtist={handleMoreFromArtist}
            onSound={handleMoreLikeSound}
          />
        </>
      ) : (
        <ThemedText>No more tracks — try again in a bit.</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artwork: {
    width: 240,
    height: 240,
    borderRadius: 12,
    alignSelf: 'center',
  },
  dim: {
    opacity: 0.6,
  },
  errorText: {
    color: '#c0392b',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});
