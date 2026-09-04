import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ActionOverlay } from '@/components/discovery/action-overlay';
import { CardStack } from '@/components/discovery/card-stack';
import type { SwipeDirection } from '@/components/discovery/swipe-physics';
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
    // Keep the one card already committed to showing next, but drop the rest of the
    // buffered tail — it was backfilled under the old strategy right after the like,
    // so the queue is normally already at target depth by the time this runs. Without
    // truncating it here, refillQueue sees a full queue and no-ops, and the new
    // strategy never actually gets fetched until the stale tail drains on its own.
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, next, seenTrackIds, discoveredGenres);
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

  function handleCardSwipe(direction: SwipeDirection) {
    if (direction === 'left') handleSkip();
    else if (direction === 'right') handleLike();
    else handleGenreJump();
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
          <CardStack queue={queue} onSwipe={handleCardSwipe} />

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
  errorText: {
    color: '#c0392b',
  },
});
