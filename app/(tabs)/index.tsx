import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { CardStack } from '@/components/discovery/card-stack';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { LikedTracksButton } from '@/components/discovery/liked-tracks-button';
import { RegionToggle } from '@/components/discovery/region-toggle';
import { SteeringRow } from '@/components/discovery/steering-row';
import type { SwipeDirection } from '@/components/discovery/swipe-physics';
import { UndoButton } from '@/components/discovery/undo-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import {
  deriveGenresHeard,
  deriveRatedGenres,
  extractGenres,
  fetchForStrategy,
  mergeDiscoveredGenres,
  pickJumpGenre,
  refillQueueWithFallback,
  REGIONS,
  type DiscoveryTrack,
  type Region,
  type Strategy,
  type SwipeEntry,
} from '@/lib/discovery';
import {
  appendLikedTrack,
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadRegion,
  loadSwipeHistory,
  saveDiscoveredGenres,
  saveRegion,
  saveSwipeHistory,
} from '@/lib/discovery-storage';
import { GENRES } from '@/lib/taste-test';

function randomGenre(): string {
  return GENRES[Math.floor(Math.random() * GENRES.length)];
}

type UndoSnapshot = {
  queue: DiscoveryTrack[];
  strategy: Strategy;
  discoveredGenres: string[];
  swipeHistory: SwipeEntry[];
};

export default function HomeScreen() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [region, setRegion] = useState<Region>('US');

  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const refillEpochRef = useRef(0);

  const currentTrack = queue[0];

  const genresHeard = useMemo(() => deriveRatedGenres(swipeHistory), [swipeHistory]);

  const currentGenre = strategy.type === 'genre' ? strategy.genre : null;
  const currentLabel = strategy.type === 'genre' ? strategy.genre : `More from: ${strategy.artistName}`;

  const { player, status } = usePlayback();
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    setHasEnded(false);
    if (currentTrack) {
      player.replace(currentTrack.previewUrl);
      player.play();
    } else {
      player.pause();
    }
  }, [currentTrack?.id]);

  useFocusEffect(
    useCallback(() => {
      return () => player.pause();
    }, [player])
  );

  useEffect(() => {
    if (status.didJustFinish) setHasEnded(true);
  }, [status.didJustFinish]);

  const showPlayIcon = !!currentTrack && status.isLoaded && !status.playing;

  async function handleCardTap() {
    if (!currentTrack || !status.isLoaded) return;
    if (hasEnded) {
      setHasEnded(false);
      await player.seekTo(0);
      player.play();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  useEffect(() => {
    (async () => {
      const [history, genres, loadedRegion] = await Promise.all([
        loadSwipeHistory(),
        loadDiscoveredGenres(),
        loadRegion(),
      ]);
      setSwipeHistory(history);
      setDiscoveredGenres(genres);
      setRegion(loadedRegion);

      const initialStrategy: Strategy = { type: 'genre', genre: randomGenre() };
      setStrategy(initialStrategy);
      await runRefill([], initialStrategy, history, genres, loadedRegion);

      setHydrated(true);
    })();
  }, []);

  async function runRefill(
    baseQueue: DiscoveryTrack[],
    activeStrategy: Strategy,
    history: SwipeEntry[],
    knownGenres: string[],
    activeRegion: Region
  ) {
    const epoch = ++refillEpochRef.current;
    try {
      const { queue: nextQueue, fetched, strategy: landedStrategy } = await refillQueueWithFallback(
        baseQueue,
        activeStrategy,
        history,
        knownGenres,
        GENRES,
        (strategy) => fetchForStrategy(strategy, activeRegion)
      );
      if (refillEpochRef.current !== epoch) return;

      setQueue(nextQueue);
      if (landedStrategy !== activeStrategy) {
        setStrategy(landedStrategy);
      }

      const merged = mergeDiscoveredGenres(knownGenres, extractGenres(fetched));
      if (merged !== knownGenres) {
        setDiscoveredGenres(merged);
        await saveDiscoveredGenres(merged);
      }
      setError(null);
    } catch {
      if (refillEpochRef.current !== epoch) return;
      setError('Something went wrong fetching tracks. Check your connection and try again.');
    }
  }

  async function logSwipe(track: DiscoveryTrack, action: SwipeEntry['action']) {
    const isSteer = action === 'steer-artist' || action === 'steer-sound';
    const entry: SwipeEntry = {
      trackId: track.id,
      trackName: track.trackName,
      artistId: track.artistId,
      artistName: track.artistName,
      genre: track.primaryGenreName,
      collectionId: track.collectionId,
      action,
      timestamp: Date.now(),
      ...(isSteer ? {} : { listenMs: Math.round(status.currentTime * 1000) }),
    };
    const nextHistory = [...swipeHistory, entry];
    setSwipeHistory(nextHistory);
    await appendSwipeEntry(entry);
    return nextHistory;
  }

  async function handleSkip(track: DiscoveryTrack) {
    const nextHistory = await logSwipe(track, 'skip');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, nextHistory, discoveredGenres, region);
  }

  async function handleLike(track: DiscoveryTrack) {
    const nextHistory = await logSwipe(track, 'like');
    await appendLikedTrack(track);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, nextHistory, discoveredGenres, region);
  }

  async function applySteeringStrategy(kind: 'artist' | 'sound', next: Strategy) {
    const nextHistory = currentTrack
      ? await logSwipe(currentTrack, kind === 'artist' ? 'steer-artist' : 'steer-sound')
      : swipeHistory;
    setStrategy(next);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, next, nextHistory, discoveredGenres, region);
  }

  function handleMoreFromArtist() {
    if (!currentTrack) return;
    captureUndoSnapshot();
    applySteeringStrategy('artist', {
      type: 'artist',
      artistId: currentTrack.artistId,
      artistName: currentTrack.artistName,
    });
  }

  function handleMoreLikeSound() {
    if (!currentTrack) return;
    captureUndoSnapshot();
    applySteeringStrategy('sound', { type: 'genre', genre: currentTrack.primaryGenreName });
  }

  async function commitGenreJump(genre: string, nextHistory: SwipeEntry[]) {
    const nextStrategy: Strategy = { type: 'genre', genre };
    setStrategy(nextStrategy);
    setQueue([]);
    await runRefill([], nextStrategy, nextHistory, discoveredGenres, region);
  }

  async function handleGenreJump(track: DiscoveryTrack) {
    const nextHistory = await logSwipe(track, 'genre-jump');
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    await commitGenreJump(newGenre, nextHistory);
  }

  function captureUndoSnapshot() {
    setUndoSnapshot({ queue, strategy, discoveredGenres, swipeHistory });
  }

  function handleCardSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    captureUndoSnapshot();
    if (direction === 'left') handleSkip(track);
    else if (direction === 'right') handleLike(track);
    else handleGenreJump(track);
  }

  async function handlePickGenre(genre: string) {
    captureUndoSnapshot();
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    await commitGenreJump(genre, nextHistory);
  }

  async function handleExplore() {
    captureUndoSnapshot();
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const target = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    await commitGenreJump(target, nextHistory);
  }

  async function handleUndo() {
    const snapshot = undoSnapshot;
    if (!snapshot) return;
    refillEpochRef.current += 1;
    setUndoSnapshot(null);
    setQueue(snapshot.queue);
    setStrategy(snapshot.strategy);
    setDiscoveredGenres(snapshot.discoveredGenres);
    setSwipeHistory(snapshot.swipeHistory);
    await Promise.all([
      saveSwipeHistory(snapshot.swipeHistory),
      saveDiscoveredGenres(snapshot.discoveredGenres),
    ]);
  }

  async function handleToggleRegion() {
    const nextRegion = REGIONS[(REGIONS.indexOf(region) + 1) % REGIONS.length];
    setRegion(nextRegion);
    await saveRegion(nextRegion);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, nextRegion);
  }

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <UndoButton disabled={!undoSnapshot} onPress={handleUndo} />
      <GenrePicker
        curatedGenres={GENRES}
        discoveredGenres={discoveredGenres}
        heardGenres={genresHeard}
        currentGenre={currentGenre}
        currentLabel={currentLabel}
        onSelect={handlePickGenre}
        onExplore={handleExplore}
      />
      <LikedTracksButton onPress={() => router.push('/modal')} />
      <RegionToggle region={region} onToggle={handleToggleRegion} />

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack ? (
        <>
          <CardStack
            queue={queue}
            onSwipe={handleCardSwipe}
            onTap={handleCardTap}
            showPlayIcon={showPlayIcon}
          />

          <SteeringRow onArtist={handleMoreFromArtist} onSound={handleMoreLikeSound} />
        </>
      ) : (
        <ThemedText style={styles.emptyText}>No more tracks — try again in a bit.</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
  },
  errorText: {
    color: Colors.destructive,
  },
});