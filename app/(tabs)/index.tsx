import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardStack } from '@/components/discovery/card-stack';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { LikedTracksButton } from '@/components/discovery/liked-tracks-button';
import { RevealCard } from '@/components/discovery/reveal-card';
import {
  computeCardSize,
  MAX_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  type CardSize,
  type SwipeDirection,
} from '@/components/discovery/swipe-physics';
import { TuneSheet } from '@/components/discovery/tune-sheet';
import { UndoButton } from '@/components/discovery/undo-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
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
  appendPresetChangeEntry,
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadRegion,
  loadSwipeHistory,
  saveDiscoveredGenres,
  saveRegion,
  saveSwipeHistory,
} from '@/lib/discovery-storage';
import { fetchArtistListeners, getTracks, trackToDiscoveryTrack } from '@/lib/pool';
import type { PresetId } from '@/lib/pool-types';
import { GENRES } from '@/lib/taste-test';

function randomGenre(): string {
  return GENRES[Math.floor(Math.random() * GENRES.length)];
}

type UndoSnapshot = {
  queue: DiscoveryTrack[];
  strategy: Strategy;
  discoveredGenres: string[];
  swipeHistory: SwipeEntry[];
  seenArtists: Set<string>;
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starts at the card's max size (a reasonable default before the first
  // layout pass) then shrinks to whatever cardArea actually measures — see
  // handleCardAreaLayout and computeCardSize — so the card fits a small
  // screen (e.g. iPhone SE) instead of overflowing behind the button rows.
  const [cardSize, setCardSize] = useState<CardSize>({
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });

  function handleCardAreaLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setCardSize(computeCardSize({ width, height }));
  }

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [region, setRegion] = useState<Region>('US');

  // Preset and genre (strategy) are independent axes — see runRefill's
  // fetcher branch below. Not persisted (yet): resets to the default A on
  // every launch, same as every other piece of state here except region
  // and the two AsyncStorage-backed lists.
  const [preset, setPreset] = useState<PresetId>('A');
  const [presetLoading, setPresetLoading] = useState(false);
  // Per-session pool exclusion (spec: "maintain a per-session seen-artist
  // set and exclude those artists when refilling"). Deliberately plain
  // state, not persisted — resets each launch, unlike swipeHistory.
  const [seenArtists, setSeenArtists] = useState<Set<string>>(new Set());

  // The track just liked, shown face-up until tapped away. It stays at
  // queue[0] meanwhile, so its preview keeps playing through the reveal.
  const [revealTrack, setRevealTrack] = useState<DiscoveryTrack | null>(null);
  // undefined while looking the count up, null if Last.fm doesn't have it.
  const [revealListeners, setRevealListeners] = useState<number | null | undefined>(undefined);
  const revealIdRef = useRef<number | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const refillEpochRef = useRef(0);
  // Phase 3 logging (2026-09-16). Wall-clock timestamp of when the current
  // top-of-stack card first appeared — stamped in the currentTrack?.id
  // effect below (the one that already replaces the preview player), not a
  // separate effect, since "the top card changed" is the same event either
  // way. logSwipe reads Date.now() - this at swipe time for dwellMs.
  const cardShownAtRef = useRef(Date.now());
  // How many cards have been skip/like/genre-jump-ed since the last preset
  // change (or session start) — read and reset by handleSelectPreset,
  // incremented by handleSkip/handleLike/handleGenreJump. Not steering:
  // steering doesn't dismiss the current card (see applySteeringStrategy).
  const cardsSeenSincePresetChangeRef = useRef(0);

  const genresHeard = useMemo(() => deriveRatedGenres(swipeHistory), [swipeHistory]);

  const currentGenre = strategy.type === 'genre' ? strategy.genre : null;
  const currentLabel = strategy.type === 'genre' ? strategy.genre : `More from: ${strategy.artistName}`;

  const { player, status } = usePlayback();
  const [hasEnded, setHasEnded] = useState(false);

  // Today's drop plays before the feed; its cards replace the feed's while active.
  const daily = useDailyDrop();
  const [likedFlash, setLikedFlash] = useState(false);
  const currentTrack = daily.active ? daily.cards[0] : queue[0];

  useEffect(() => {
    setHasEnded(false);
    // Phase 3 logging: this is "the top card changed," the same event
    // dwellMs needs a start time for — stamped here rather than a separate
    // effect with the same dependency array.
    cardShownAtRef.current = Date.now();
    // A falsy previewUrl means "nothing to play" (the stub deliberately
    // uses this now — see lib/pool.ts), not an error — pause rather than
    // hand expo-audio an empty/invalid source. Defensive for real tracks
    // too: previewUrl is typed as guaranteed non-empty, but that's a type
    // contract, not a runtime guarantee against every future data source.
    if (currentTrack?.previewUrl) {
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

  // Triggered by a ~400ms hold on the card now, not a tap — see
  // components/discovery/swipe-card.tsx's onHold. Toggle logic itself is
  // unchanged; only the gesture that fires it moved, since a plain tap now
  // belongs to skip/like.
  async function handleCardHold() {
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
      // Literal initial values, not the preset/seenArtists state — this
      // effect runs once, at mount, before anything could have changed
      // them, so reading the state itself would just be an unnecessary
      // (and lint-flagged) dependency on values that are always still 'A' /
      // empty here.
      await runRefill([], initialStrategy, history, genres, loadedRegion, 'A', new Set());

      setHydrated(true);
    })();
  }, []);

  async function runRefill(
    baseQueue: DiscoveryTrack[],
    activeStrategy: Strategy,
    history: SwipeEntry[],
    knownGenres: string[],
    activeRegion: Region,
    activePreset: PresetId,
    excludeArtists: Set<string>
  ) {
    const epoch = ++refillEpochRef.current;
    try {
      const { queue: nextQueue, fetched, strategy: landedStrategy } = await refillQueueWithFallback(
        baseQueue,
        activeStrategy,
        history,
        knownGenres,
        GENRES,
        // Artist strategies (steering) are unchanged — real iTunes lookup,
        // preset-agnostic. Genre strategies (initial load, swipe-down,
        // genre picker) route through the pool instead of the old
        // genre-term search — see bugs.md's 2026-09-14 entry on why that
        // path is retired here, not patched.
        (strategy) =>
          strategy.type === 'artist'
            ? fetchForStrategy(strategy, activeRegion)
            : getTracks(activePreset, strategy.genre, excludeArtists).then((tracks) => tracks.map(trackToDiscoveryTrack))
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

  async function logSwipe(track: DiscoveryTrack, action: SwipeEntry['action'], source?: 'drop') {
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
      // Phase 3 logging (2026-09-16): preset is always meaningful regardless
      // of action type, so logged unconditionally, unlike listenMs/dwellMs
      // below. artistListeners/trackRank are undefined for a DiscoveryTrack
      // that never came from lib/pool.ts (the old genre-fetch/artist-
      // steering path) — same as collectionId above, no special-casing
      // needed here.
      preset,
      artistListeners: track.artistListeners,
      trackRank: track.trackRank,
      ...(source ? { source } : {}),
      ...(isSteer
        ? {}
        : {
            listenMs: Math.round(status.currentTime * 1000),
            // Wall-clock time this card was the top of the stack, distinct
            // from listenMs — see SwipeEntry's own comment. Skipped for
            // steering for the same reason listenMs is: the card doesn't
            // actually leave, so there's no real endpoint to measure yet.
            dwellMs: Date.now() - cardShownAtRef.current,
          }),
    };
    const nextHistory = [...swipeHistory, entry];
    setSwipeHistory(nextHistory);
    await appendSwipeEntry(entry);
    return nextHistory;
  }

  function markArtistSeen(track: DiscoveryTrack): Set<string> {
    const next = new Set(seenArtists);
    next.add(track.artistName);
    setSeenArtists(next);
    return next;
  }

  async function handleSkip(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    const nextHistory = await logSwipe(track, 'skip');
    const nextSeen = markArtistSeen(track);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, nextHistory, discoveredGenres, region, preset, nextSeen);
  }

  async function handleLike(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    const likedAt = Date.now();
    await logSwipe(track, 'like');
    markArtistSeen(track);
    setRevealTrack(track);
    setRevealListeners(track.artistListeners);
    revealIdRef.current = track.id;
    const found = track.artistListeners ?? (await fetchArtistListeners(track.artistName));
    if (revealIdRef.current === track.id) setRevealListeners(found);
    await appendLikedTrack({ ...track, artistListeners: found ?? undefined, likedAt });
  }

  async function handleRevealDone() {
    setRevealTrack(null);
    revealIdRef.current = null;
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    await runRefill(nextQueue, strategy, swipeHistory, discoveredGenres, region, preset, seenArtists);
  }

  async function applySteeringStrategy(kind: 'artist' | 'sound', next: Strategy) {
    const nextHistory = currentTrack
      ? await logSwipe(currentTrack, kind === 'artist' ? 'steer-artist' : 'steer-sound')
      : swipeHistory;
    setStrategy(next);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    // Steering redirects the strategy; it doesn't count as "seen" the way a
    // swipe-away does — "more from this artist" would be self-defeating if
    // it did, and "more like this sound" isn't a judgment on the artist.
    await runRefill(preserved, next, nextHistory, discoveredGenres, region, preset, seenArtists);
  }

  function handleMoreFromArtist() {
    if (daily.active || !currentTrack) return;
    captureUndoSnapshot();
    applySteeringStrategy('artist', {
      type: 'artist',
      artistId: currentTrack.artistId,
      artistName: currentTrack.artistName,
    });
  }

  function handleMoreLikeSound() {
    if (daily.active || !currentTrack) return;
    captureUndoSnapshot();
    applySteeringStrategy('sound', { type: 'genre', genre: currentTrack.primaryGenreName });
  }

  async function commitGenreJump(genre: string, nextHistory: SwipeEntry[], excludeArtists: Set<string>) {
    const nextStrategy: Strategy = { type: 'genre', genre };
    setStrategy(nextStrategy);
    setQueue([]);
    // Genre changes independently of preset — activePreset here is
    // whatever's currently selected, untouched by this jump.
    await runRefill([], nextStrategy, nextHistory, discoveredGenres, region, preset, excludeArtists);
  }

  async function handleGenreJump(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    const nextHistory = await logSwipe(track, 'genre-jump');
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    const nextSeen = markArtistSeen(track);
    await commitGenreJump(newGenre, nextHistory, nextSeen);
  }

  async function handleDropSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    if (direction === 'down') return;
    const liked = direction === 'right';
    await logSwipe(track, liked ? 'like' : 'skip', 'drop');
    if (liked) {
      setLikedFlash(true);
      setTimeout(() => setLikedFlash(false), 600);
    }
    if ((await daily.vote(liked)) === 'done') {
      setUndoSnapshot(null);
      router.push('/drop-results');
    }
  }

  // Undo inside the drop: take back the vote and its swipe-log entry.
  async function handleDropUndo() {
    daily.undo();
    const i = swipeHistory.findLastIndex((e) => e.source === 'drop');
    if (i === -1) return;
    const next = swipeHistory.filter((_, j) => j !== i);
    setSwipeHistory(next);
    await saveSwipeHistory(next);
  }

  function captureUndoSnapshot() {
    setUndoSnapshot({ queue, strategy, discoveredGenres, swipeHistory, seenArtists });
  }

  function handleCardSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    captureUndoSnapshot();
    if (direction === 'left') handleSkip(track);
    else if (direction === 'right') handleLike(track);
    else handleGenreJump(track);
  }

  async function handlePickGenre(genre: string) {
    captureUndoSnapshot();
    if (currentTrack) cardsSeenSincePresetChangeRef.current += 1;
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextSeen = currentTrack ? markArtistSeen(currentTrack) : seenArtists;
    await commitGenreJump(genre, nextHistory, nextSeen);
  }

  async function handleExplore() {
    captureUndoSnapshot();
    if (currentTrack) cardsSeenSincePresetChangeRef.current += 1;
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const target = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    const nextSeen = currentTrack ? markArtistSeen(currentTrack) : seenArtists;
    await commitGenreJump(target, nextHistory, nextSeen);
  }

  async function handleSelectPreset(newPreset: PresetId) {
    if (newPreset === preset || presetLoading) return;
    // Phase 3 logging (2026-09-16): the stated purpose is deciding whether
    // people actually move between presets — read the counter before
    // resetting it, not after, and before setPreset so `preset` here is
    // still the FROM value.
    await appendPresetChangeEntry({
      from: preset,
      to: newPreset,
      timestamp: Date.now(),
      cardsSeenBeforeSwitch: cardsSeenSincePresetChangeRef.current,
    });
    cardsSeenSincePresetChangeRef.current = 0;
    setPreset(newPreset);
    setPresetLoading(true);
    setQueue([]);
    // Preset changes independently of genre — strategy (and therefore the
    // active genre) is passed through unchanged.
    await runRefill([], strategy, swipeHistory, discoveredGenres, region, newPreset, seenArtists);
    setPresetLoading(false);
  }

  async function handleUndo() {
    const snapshot = undoSnapshot;
    if (!snapshot) return;
    refillEpochRef.current += 1;
    setUndoSnapshot(null);
    setRevealTrack(null);
    revealIdRef.current = null;
    setQueue(snapshot.queue);
    setStrategy(snapshot.strategy);
    setDiscoveredGenres(snapshot.discoveredGenres);
    setSwipeHistory(snapshot.swipeHistory);
    setSeenArtists(snapshot.seenArtists);
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
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, nextRegion, preset, seenArtists);
  }

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.headerRow}>
        <UndoButton
          disabled={daily.active ? !daily.canUndo : !undoSnapshot}
          onPress={daily.active ? handleDropUndo : handleUndo}
        />
        {daily.active ? (
          <ThemedView style={styles.dropPill} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={styles.dropPillText}>
              Daily Drop · {daily.played + 1}/5
            </ThemedText>
          </ThemedView>
        ) : (
          <GenrePicker
            curatedGenres={GENRES}
            discoveredGenres={discoveredGenres}
            heardGenres={genresHeard}
            currentGenre={currentGenre}
            currentLabel={currentLabel}
            onSelect={handlePickGenre}
            onExplore={handleExplore}
          />
        )}
      </View>

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack || daily.active ? (
        <>
          <View style={styles.cardArea} onLayout={handleCardAreaLayout}>
            {daily.active ? (
              <CardStack
                queue={daily.cards}
                cardSize={cardSize}
                onSwipe={handleDropSwipe}
                onHold={handleCardHold}
                playing={status.playing}
                showPlayIcon={showPlayIcon}
                allowDown={false}
              />
            ) : revealTrack ? (
              <RevealCard track={revealTrack} listeners={revealListeners} size={cardSize} onDone={handleRevealDone} />
            ) : (
              <CardStack
                queue={queue}
                cardSize={cardSize}
                onSwipe={handleCardSwipe}
                onHold={handleCardHold}
                playing={status.playing}
                showPlayIcon={showPlayIcon}
              />
            )}
            {likedFlash && (
              <ThemedView style={styles.likedFlash} backgroundColor="transparent" pointerEvents="none">
                <ThemedText type="subtitle" style={styles.likedFlashText}>
                  Liked
                </ThemedText>
              </ThemedView>
            )}
          </View>

          <View style={styles.bottomRow}>
            <TuneSheet
              preset={preset}
              presetLoading={presetLoading}
              region={region}
              onSelectPreset={handleSelectPreset}
              onToggleRegion={handleToggleRegion}
              onMoreFromArtist={handleMoreFromArtist}
              onMoreLikeSound={handleMoreLikeSound}
            />
            <LikedTracksButton onPress={() => router.push('/modal')} />
          </View>
        </>
      ) : presetLoading ? (
        <ThemedView style={styles.centered}>
          <ActivityIndicator color={Colors.accent} />
        </ThemedView>
      ) : (
        <ThemedText style={styles.emptyText}>No more tracks — try again in a bit.</ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'stretch',
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dropPill: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  dropPillText: {
    color: Colors.accentText,
  },
  likedFlash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likedFlashText: {
    color: Colors.positive,
    fontSize: 32,
    lineHeight: 36,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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