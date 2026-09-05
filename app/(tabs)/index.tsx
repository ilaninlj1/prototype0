import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ActionOverlay } from '@/components/discovery/action-overlay';
import { CardStack } from '@/components/discovery/card-stack';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { LikedTracksButton } from '@/components/discovery/liked-tracks-button';
import type { SwipeDirection } from '@/components/discovery/swipe-physics';
import { UndoButton } from '@/components/discovery/undo-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import {
  deriveGenresHeard,
  deriveRatedGenres,
  extractGenres,
  fetchForStrategy,
  mergeDiscoveredGenres,
  pickJumpGenre,
  refillQueueWithFallback,
  type DiscoveryTrack,
  type Strategy,
  type SwipeEntry,
} from '@/lib/discovery';
import {
  appendLikedTrack,
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadSwipeHistory,
  saveDiscoveredGenres,
  saveSwipeHistory,
} from '@/lib/discovery-storage';
import { GENRES } from '@/lib/taste-test';

function randomGenre(): string {
  return GENRES[Math.floor(Math.random() * GENRES.length)];
}

// Full state needed to roll a single swipe back exactly as it was — see
// handleCardSwipe (where this is captured) and handleUndo (where it's restored).
type UndoSnapshot = {
  queue: DiscoveryTrack[];
  strategy: Strategy;
  discoveredGenres: string[];
  swipeHistory: SwipeEntry[];
  showActionButtons: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [showActionButtons, setShowActionButtons] = useState(false);

  const lastLikedRef = useRef<DiscoveryTrack | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  // Bumped by every runRefill call and by handleUndo, so a refill that's still
  // in flight when an undo (or a newer refill) lands can't clobber state with
  // a stale result once it finally resolves.
  const refillEpochRef = useRef(0);

  const currentTrack = queue[0];

  // Only genres actually rated (skip/like) count as "heard" for the picker's
  // checkmark — deriveGenresHeard below is a different, broader notion used by
  // the jump-selection engine, not what should drive this display.
  const genresHeard = useMemo(() => deriveRatedGenres(swipeHistory), [swipeHistory]);

  // Drives the genre picker's trigger label and its scroll-to/highlight —
  // null while on an artist strategy, since there's no single genre to point at.
  const currentGenre = strategy.type === 'genre' ? strategy.genre : null;
  const currentLabel = strategy.type === 'genre' ? strategy.genre : `More from: ${strategy.artistName}`;

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  // status.didJustFinish is an event flag — true only in the single status
  // update right after a preview ends, not safe to read later to ask "did
  // this end". Captured here so a tap after that point knows to replay from
  // the start rather than try to "resume" a track already at its end.
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Autoplay whenever the top card changes — this never fires mid-drag, only when
  // a committed swipe actually changes queue[0].
  useEffect(() => {
    setHasEnded(false);
    if (currentTrack) {
      player.replace(currentTrack.previewUrl);
      player.play();
    } else {
      player.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  useEffect(() => {
    if (status.didJustFinish) setHasEnded(true);
  }, [status.didJustFinish]);

  // Paused and "finished" both leave status.playing false, so one flag covers
  // showing the play icon for either; the tap handler below distinguishes them.
  const showPlayIcon = !!currentTrack && status.isLoaded && !status.playing;

  // Tap-to-pause on the swipe card — pure playback control, no interaction
  // with queue/strategy/undo state at all.
  async function handleCardTap() {
    if (!currentTrack || !status.isLoaded) return;
    if (hasEnded) {
      setHasEnded(false);
      await player.seekTo(0); // don't rely on play() implicitly restarting a finished player
      player.play();
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  // ---------- Bootstrap ----------

  useEffect(() => {
    (async () => {
      const [history, genres] = await Promise.all([loadSwipeHistory(), loadDiscoveredGenres()]);
      setSwipeHistory(history);
      setDiscoveredGenres(genres);

      const initialStrategy: Strategy = { type: 'genre', genre: randomGenre() };
      setStrategy(initialStrategy);
      await runRefill([], initialStrategy, history, genres);

      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Queue refill ----------

  // `history` (not just a seen-ids set) is required here because a strategy that
  // can't fill the queue on its own falls back to another genre — via the same
  // priority order as a swipe-down genre-jump — instead of dead-ending on an
  // empty queue; picking that fallback genre needs the full swipe history.
  async function runRefill(
    baseQueue: DiscoveryTrack[],
    activeStrategy: Strategy,
    history: SwipeEntry[],
    knownGenres: string[]
  ) {
    const epoch = ++refillEpochRef.current;
    try {
      const { queue: nextQueue, fetched, strategy: landedStrategy } = await refillQueueWithFallback(
        baseQueue,
        activeStrategy,
        history,
        knownGenres,
        GENRES,
        fetchForStrategy
      );
      // Superseded by a newer refill, or by an undo that rolled back the swipe
      // this refill was fetching for — discard rather than clobber current state.
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

  async function handleSkip(track: DiscoveryTrack) {
    const nextHistory = await logSwipe(track, 'skip');
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, nextHistory, discoveredGenres);
  }

  async function handleLike(track: DiscoveryTrack) {
    lastLikedRef.current = track;
    const nextHistory = await logSwipe(track, 'like');
    await appendLikedTrack(track); // independent of swipeHistory — see lib/discovery-storage.ts
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    setShowActionButtons(true);
    await runRefill(nextQueue, strategy, nextHistory, discoveredGenres);
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
    await runRefill(preserved, next, swipeHistory, discoveredGenres);
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

  // Shared tail of "jump to this genre right now": set strategy, discard the
  // buffered tail (a jump is immediate, not queued), refill from scratch.
  // Used by both the random swipe-down jump and the genre picker's chosen one.
  async function commitGenreJump(genre: string, nextHistory: SwipeEntry[]) {
    const nextStrategy: Strategy = { type: 'genre', genre };
    setStrategy(nextStrategy);
    setQueue([]);
    await runRefill([], nextStrategy, nextHistory, discoveredGenres);
  }

  async function handleGenreJump(track: DiscoveryTrack) {
    const nextHistory = await logSwipe(track, 'genre-jump');
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    await commitGenreJump(newGenre, nextHistory);
  }

  // Snapshot everything a swipe (or a genre pick) can touch before touching any
  // of it, so a later undo can restore it exactly — see UndoSnapshot / handleUndo.
  function captureUndoSnapshot() {
    setUndoSnapshot({ queue, strategy, discoveredGenres, swipeHistory, showActionButtons });
  }

  function handleCardSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    captureUndoSnapshot();
    // Any next swipe dismisses a still-open overlay from an earlier like — not
    // a timer. A right-swipe's own handleLike immediately reopens it for the
    // new like.
    setShowActionButtons(false);
    if (direction === 'left') handleSkip(track);
    else if (direction === 'right') handleLike(track);
    else handleGenreJump(track);
  }

  async function handlePickGenre(genre: string) {
    captureUndoSnapshot();
    setShowActionButtons(false);
    // Same as swipe-down abandoning whatever's currently showing — except
    // there's nothing to log a swipe against if the queue's already empty.
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    await commitGenreJump(genre, nextHistory);
  }

  // The picker's "Explore" row: same random-jump selection swipe-down already
  // uses, just triggered by a tap instead of a gesture.
  async function handleExplore() {
    captureUndoSnapshot();
    setShowActionButtons(false);
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const target = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    await commitGenreJump(target, nextHistory);
  }

  async function handleUndo() {
    const snapshot = undoSnapshot;
    if (!snapshot) return;
    // Invalidate any refill still in flight from the swipe being undone, so it
    // can't resolve later and clobber the state we're about to restore.
    refillEpochRef.current += 1;
    setUndoSnapshot(null);
    setQueue(snapshot.queue);
    setStrategy(snapshot.strategy);
    setDiscoveredGenres(snapshot.discoveredGenres);
    setSwipeHistory(snapshot.swipeHistory);
    setShowActionButtons(snapshot.showActionButtons);
    await Promise.all([
      saveSwipeHistory(snapshot.swipeHistory),
      saveDiscoveredGenres(snapshot.discoveredGenres),
    ]);
  }

  // ---------- Render ----------

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

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack ? (
        <>
          <CardStack
            queue={queue}
            onSwipe={handleCardSwipe}
            onTap={handleCardTap}
            showPlayIcon={showPlayIcon}
          />

          <ActionOverlay
            visible={showActionButtons}
            onArtist={handleMoreFromArtist}
            onSound={handleMoreLikeSound}
          />
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
