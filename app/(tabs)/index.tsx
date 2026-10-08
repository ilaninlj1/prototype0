import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, type LayoutRectangle, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtPiece } from '@/components/art/art-piece';
import { FlyingCover } from '@/components/art/flying-cover';
import { CardStack } from '@/components/discovery/card-stack';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { LikedTracksButton } from '@/components/discovery/liked-tracks-button';
import { REVEAL_COVER, REVEAL_COVER_CENTER, RevealCard } from '@/components/discovery/reveal-card';
import { DropRing } from '@/components/drop-ring';
import { onLikeChange, saveLike } from '@/components/like-button';
import { flySave } from '@/components/save-flight';
import {
  fitCardToWidth,
  MAX_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  type CardSize,
  type SwipeDirection,
} from '@/components/discovery/swipe-physics';
import { TuneSheet, type NextMode } from '@/components/discovery/tune-sheet';
import { UndoButton } from '@/components/discovery/undo-button';
import { CreditLine } from '@/components/credits';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { addToCanvas, saveOnCanvas, undoOnCanvas, useArt } from '@/hooks/use-art';
import { usePlayback, usePreviewWhileFocused } from '@/hooks/use-playback';
import {
  deriveGenresHeard,
  extractGenres,
  fetchForStrategy,
  keepDropEntries,
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
  appendPresetChangeEntry,
  appendSwipeEntry,
  loadDiscoveredGenres,
  loadRegion,
  loadShuffleGenres,
  loadSwipeHistory,
  saveDiscoveredGenres,
  saveRegion,
  saveShuffleGenres,
  saveSwipeHistory,
} from '@/lib/discovery-storage';
import { pickSimilar } from '@/lib/charts';
import { fetchArtistListeners, fetchSimilarArtists, getTracks, trackToDiscoveryTrack } from '@/lib/pool';
import { findItunesArtist } from '@/lib/song-details';
import type { PresetId } from '@/lib/pool-types';
import { GENRES } from '@/lib/taste-test';
import { ART, collageRects, type ArtCanvas, type Mark } from '@/lib/collage';
import { hideFromDiscovery, shouldSkip } from '@/lib/human-check-api';
import { takeSteerRequest } from '@/lib/steer-request';
import { alreadyKnown, setKnownArtists } from '@/lib/known-artists';
import { loadSpotifyLibrary } from '@/lib/spotify-api';

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
  // handleCardAreaLayout and fitCardToWidth — so the card fits a small
  // screen (e.g. iPhone SE) instead of overflowing behind the button rows.
  const [cardSize, setCardSize] = useState<CardSize>({
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });

  function handleCardAreaLayout(e: LayoutChangeEvent) {
    cardAreaRef.current = e.nativeEvent.layout;
    const { width, height } = e.nativeEvent.layout;
    setCardSize(fitCardToWidth({ width, height }));
  }

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [region, setRegion] = useState<Region>('US');
  const [nextMode, setNextMode] = useState<NextMode>('genre');

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

  const currentTrack = queue[0];


  const currentGenre = strategy.type === 'genre' ? strategy.genre : null;
  const currentLabel = strategy.type === 'genre' ? strategy.genre : `More from: ${strategy.artistName}`;

  const { player, status, setMix, cancelPeek, promotePeek } = usePlayback();
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    setHasEnded(false);
    // Phase 3 logging: this is "the top card changed," the same event
    // dwellMs needs a start time for — stamped here rather than a separate
    // effect with the same dependency array.
    cardShownAtRef.current = Date.now();
  }, [currentTrack?.id]);

  // The top card plays while Home is in view. A falsy previewUrl means
  // "nothing to play" (see lib/pool.ts), so nothing is loaded.
  usePreviewWhileFocused(currentTrack?.previewUrl || undefined, queue[1]?.previewUrl);

  // ---- The collage: every swipe adds the song's cover (see lib/collage.ts) ----
  const { canvas } = useArt();
  const cardAreaRef = useRef<LayoutRectangle | null>(null);
  const stripRef = useRef<LayoutRectangle | null>(null);
  const savedIdsRef = useRef(new Set<number>());
  const [flying, setFlying] = useState<{ mark: Mark; from: { x: number; y: number }; to: { x: number; y: number }; endPx: number } | null>(null);
  const flyingIdRef = useRef<number | null>(null);

  // What a save needs to fly from the card into the You tab, read by the listener below.
  const cardAreaViewRef = useRef<View>(null);
  const isFocused = useIsFocused();
  const flightRef = useRef({ focused: false, revealId: null as number | null, tracks: [] as DiscoveryTrack[], cardHeight: 0 });
  useEffect(() => {
    flightRef.current = {
      focused: isFocused,
      revealId: revealTrack?.id ?? null,
      tracks: [revealTrack, currentTrack].filter((t): t is DiscoveryTrack => !!t),
      cardHeight: cardSize.height,
    };
  });

  // A save anywhere (double-tap, heart) gets the song's red dot. A new one
  // made right here also flies down into the You tab (components/save-flight.tsx):
  // as blurred colors if it's still blind, as the cover once revealed.
  useEffect(
    () =>
      onLikeChange((id, liked) => {
        if (!liked) return;
        const first = !savedIdsRef.current.has(id);
        savedIdsRef.current.add(id);
        saveOnCanvas(id);
        const f = flightRef.current;
        const track = f.tracks.find((t) => t.id === id);
        if (!first || !f.focused || !track?.artworkUrl100) return;
        cardAreaViewRef.current?.measureInWindow((x, y, w) =>
          flySave({ artwork: track.artworkUrl100, blind: f.revealId !== id, from: { x: x + w / 2, y: y + f.cardHeight / 2 } })
        );
      }),
    []
  );

  async function commitMark(mark: Mark) {
    const finished: ArtCanvas | undefined = await addToCanvas(mark);
    if (finished) router.push({ pathname: '/art', params: { piece: String(finished.number) } });
  }

  function markSwipe(track: DiscoveryTrack, kind: Mark['kind']) {
    const mark: Mark = { trackId: track.id, kind, saved: savedIdsRef.current.has(track.id), artwork: track.artworkUrl100 };
    const area = cardAreaRef.current;
    const strip = stripRef.current;
    if (kind === 'ghost' || !area || !strip || !mark.artwork) return commitMark(mark);
    // A reveal: once the cover has sharpened, it drops into its new tile.
    if (flying) commitMark(flying.mark); // one still in the air lands now
    const scale = strip.width / ART.width;
    const count = canvas.marks.length + (flying ? 1 : 0);
    const tile = collageRects(Math.min(count + 1, ART.slots))[Math.min(count, ART.slots - 1)];
    flyingIdRef.current = mark.trackId;
    setFlying({
      mark,
      // The revealed cover is the small square beside the title.
      from: { x: area.x + REVEAL_COVER_CENTER.x, y: area.y + REVEAL_COVER_CENTER.y },
      // The first cover lands in a collage that doesn't exist yet: it'll open up just above the label.
      to: { x: strip.x + (tile.x + tile.w / 2) * scale, y: strip.y - (count === 0 ? ART.height * scale : 0) + (tile.y + tile.h / 2) * scale },
      endPx: Math.min(tile.w, tile.h) * scale,
    });
  }

  function handleLanded(mark: Mark) {
    if (flyingIdRef.current !== mark.trackId) return; // undone mid-flight
    flyingIdRef.current = null;
    setFlying(null);
    commitMark({ ...mark, saved: mark.saved || savedIdsRef.current.has(mark.trackId) });
  }

  // Drop swipes are logged from the Play tab; reload so a feed undo can't overwrite them.
  useFocusEffect(
    useCallback(() => {
      loadSwipeHistory().then(setSwipeHistory);
    }, [])
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
      const [history, genres, loadedRegion, spotifyFile] = await Promise.all([
        loadSwipeHistory(),
        loadDiscoveredGenres(),
        loadRegion(),
        loadSpotifyLibrary('file'),
      ]);
      // Truly blind: artists from an imported Spotify file never come up blind.
      setKnownArtists(spotifyFile?.likes ?? []);
      setSwipeHistory(history);
      setDiscoveredGenres(genres);
      setRegion(loadedRegion);
      loadShuffleGenres().then((on) => on && setNextMode('random'));

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
          (strategy.type === 'artist'
            ? fetchForStrategy(strategy, activeRegion)
            : getTracks(activePreset, strategy.genre, excludeArtists).then((tracks) => tracks.map(trackToDiscoveryTrack))
          ).then((tracks) => tracks.filter((t) => !hideFromDiscovery(t.artistName) && !alreadyKnown(t.artistName))) // human-only unless AI music is on; never an artist already in your Spotify
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
      // Phase 3 logging (2026-09-16): preset is always meaningful regardless
      // of action type, so logged unconditionally, unlike listenMs/dwellMs
      // below. artistListeners/trackRank are undefined for a DiscoveryTrack
      // that never came from lib/pool.ts (the old genre-fetch/artist-
      // steering path) — same as collectionId above, no special-casing
      // needed here.
      preset,
      artistListeners: track.artistListeners,
      trackRank: track.trackRank,
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

  // Tune → Genres: with Shuffle on, each refill hops to a genre not heard
  // yet this session (the same pick a swipe-down makes); otherwise stay put.
  function nextFeedStrategy(history: SwipeEntry[]): Strategy {
    if (nextMode !== 'random') return strategy;
    const next: Strategy = { type: 'genre', genre: pickJumpGenre(discoveredGenres, deriveGenresHeard(history), GENRES, history) };
    setStrategy(next);
    return next;
  }

  // Tune → Next songs. 'artist' and 'genre' steer from the playing song;
  // 'random' lets each refill hop genres. Only genre/random is remembered.
  function handleSetNextMode(mode: NextMode) {
    if (mode === nextMode) return;
    setNextMode(mode);
    saveShuffleGenres(mode === 'random');
    if (mode === 'similar' && currentTrack) hopToSimilar(currentTrack.artistName);
    else if (mode === 'artist') handleMoreFromArtist();
    else if (mode === 'genre' && strategy.type === 'artist') handleMoreLikeSound();
  }

  // Next songs → Similar: every 3 songs, move to an artist fans of the
  // current one also play (Last.fm), never repeating one this session.
  const similarPlayedRef = useRef(new Set<string>());
  const similarCountRef = useRef(0);
  async function similarStrategy(fromArtist: string): Promise<Strategy | null> {
    const similar = await fetchSimilarArtists(fromArtist);
    // A few tries, so an AI-tagged "similar artist" is passed over, not hopped to.
    for (let i = 0; i < 3; i++) {
      const pick = pickSimilar(similar, fromArtist, similarPlayedRef.current);
      if (!pick) return null;
      similarPlayedRef.current.add(pick);
      if (await shouldSkip(pick)) continue;
      const artist = await findItunesArtist(pick);
      return artist ? { type: 'artist', artistId: artist.id, artistName: artist.name } : null;
    }
    return null;
  }
  async function hopToSimilar(fromArtist: string) {
    const epoch = ++refillEpochRef.current;
    const next = await similarStrategy(fromArtist);
    // A swipe during the lookup moved the feed on; this hop is stale.
    if (next && refillEpochRef.current === epoch) applySteeringStrategy('artist', next);
  }
  async function strategyAfterSwipe(track: DiscoveryTrack, history: SwipeEntry[], epoch: number): Promise<Strategy> {
    if (nextMode !== 'similar') return nextFeedStrategy(history);
    similarCountRef.current += 1;
    if (similarCountRef.current % 3 !== 0) return strategy;
    const next = await similarStrategy(track.artistName);
    if (!next) return strategy;
    if (refillEpochRef.current === epoch) setStrategy(next);
    return next;
  }

  async function handleSkip(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    markSwipe(track, 'ghost');
    const nextHistory = await logSwipe(track, 'skip');
    const nextSeen = markArtistSeen(track);
    const nextQueue = queue.slice(1);
    promotePeek(nextQueue[0]?.previewUrl);
    setQueue(nextQueue);
    // A similar-artist hop can take seconds; if another swipe lands first,
    // its refill wins and this one (with its older queue) is dropped.
    const epoch = ++refillEpochRef.current;
    const nextStrategy = await strategyAfterSwipe(track, nextHistory, epoch);
    if (refillEpochRef.current !== epoch) return;
    await runRefill(nextQueue, nextStrategy, nextHistory, discoveredGenres, region, preset, nextSeen);
  }

  // Swipe right: "who is this?" — flip to the reveal (and its comments)
  // without saving it. Saving is a double-tap (handleSave).
  async function handleReveal(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    markSwipe(track, 'bold');
    await logSwipe(track, 'reveal');
    markArtistSeen(track);
    setRevealTrack(track);
    setRevealListeners(track.artistListeners);
    revealIdRef.current = track.id;
    const found = track.artistListeners ?? (await fetchArtistListeners(track.artistName));
    if (revealIdRef.current === track.id) setRevealListeners(found);
  }

  // Double-tap: save to Liked while staying blind; the card stays put.
  async function handleSave(track: DiscoveryTrack) {
    const likedAt = Date.now();
    await logSwipe(track, 'like');
    await saveLike({ ...track, likedAt });
  }

  async function handleRevealDone() {
    // A double-tap on Next lands twice; only the first moves on.
    if (revealIdRef.current == null) return;
    const revealed = revealTrack;
    setRevealTrack(null);
    revealIdRef.current = null;
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    const epoch = ++refillEpochRef.current;
    const nextStrategy = revealed ? await strategyAfterSwipe(revealed, swipeHistory, epoch) : nextFeedStrategy(swipeHistory);
    if (refillEpochRef.current !== epoch) return;
    await runRefill(
      nextQueue,
      nextStrategy,
      swipeHistory,
      discoveredGenres,
      region,
      preset,
      seenArtists
    );
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

  const applyRouteSteering = useEffectEvent((kind: 'artist' | 'sound', next: Strategy) => {
    captureUndoSnapshot();
    void applySteeringStrategy(kind, next);
  });

  // Liked list → "More from this artist" / "More like this sound".
  useEffect(() => {
    if (!hydrated || !isFocused) return;
    const request = takeSteerRequest();
    if (request) applyRouteSteering(request.kind, request.strategy);
  }, [hydrated, isFocused]);

  async function commitGenreJump(genre: string, nextHistory: SwipeEntry[], excludeArtists: Set<string>) {
    if (nextMode === 'artist') setNextMode('genre');
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

  function captureUndoSnapshot() {
    setUndoSnapshot({ queue, strategy, discoveredGenres, swipeHistory, seenArtists });
  }

  function handleCardSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    captureUndoSnapshot();
    if (direction === 'left') handleSkip(track);
    else if (direction === 'right') handleReveal(track);
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
    const undone = snapshot.queue[0];
    if (undone) {
      if (flyingIdRef.current === undone.id) {
        flyingIdRef.current = null;
        setFlying(null);
      } else undoOnCanvas(undone.id);
    }
    setUndoSnapshot(null);
    setRevealTrack(null);
    revealIdRef.current = null;
    setQueue(snapshot.queue);
    setStrategy(snapshot.strategy);
    setDiscoveredGenres(snapshot.discoveredGenres);
    const restoredHistory = keepDropEntries(snapshot.swipeHistory, await loadSwipeHistory());
    setSwipeHistory(restoredHistory);
    setSeenArtists(snapshot.seenArtists);
    await Promise.all([
      saveSwipeHistory(restoredHistory),
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
        <View style={styles.headerLeft}>
          <DropRing />
          <UndoButton disabled={!undoSnapshot} onPress={handleUndo} />
        </View>
        <GenrePicker
          curatedGenres={GENRES}
          discoveredGenres={discoveredGenres}
          currentGenre={currentGenre}
          currentLabel={currentLabel}
          onSelect={handlePickGenre}
          onExplore={handleExplore}
        />
      </View>

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

      {currentTrack ? (
        <>
          <View ref={cardAreaViewRef} style={styles.cardArea} onLayout={handleCardAreaLayout}>
            {revealTrack ? (
              // The card grows to fit everything and scrolls itself, so it never clips.
              <RevealCard
                track={{ ...revealTrack, artistListeners: revealListeners ?? revealTrack.artistListeners }}
                listeners={revealListeners}
                width={cardSize.width}
                onDone={handleRevealDone}
                onSave={handleSave}
              />
            ) : (
              <CardStack
                queue={queue}
                cardSize={cardSize}
                onSwipe={handleCardSwipe}
                onDoubleTap={handleSave}
                onHold={handleCardHold}
                onMix={setMix}
                onCancelPeek={cancelPeek}
                playing={status.playing}
                showPlayIcon={showPlayIcon}
              />
            )}
          </View>

          <Pressable
            onPress={() => router.push('/art')}
            onLayout={(e) => (stripRef.current = e.nativeEvent.layout)}
            accessibilityLabel={`Your piece, ${canvas.marks.length} of ${ART.slots} songs`}>
            {/* Until the first swipe it's a single line and the card takes the room; then the covers appear above it. */}
            {canvas.marks.length > 0 && <ArtPiece canvas={canvas} style={styles.strip} />}
            {canvas.marks.length === 0 ? (
              <View style={[styles.stripCaption, styles.stripCaptionEmpty]}>
                <ThemedText style={styles.stripLabel}>Your collage starts with your first swipe</ThemedText>
              </View>
            ) : (
              <View style={styles.stripCaption}>
                <ThemedText style={styles.stripLabel}>Your collage</ThemedText>
                <ThemedText style={styles.stripLabel}>
                  {canvas.marks.length}/{ART.slots}
                </ThemedText>
              </View>
            )}
          </Pressable>

          <View style={styles.bottomRow}>
            <View style={styles.half}>
              <TuneSheet
              preset={preset}
              presetLoading={presetLoading}
              region={region}
              onSelectPreset={handleSelectPreset}
              onToggleRegion={handleToggleRegion}
              nextMode={nextMode}
              onSetNextMode={handleSetNextMode}
              />
            </View>
            <View style={styles.half}>
              <LikedTracksButton onPress={() => router.push('/modal')} />
            </View>
          </View>
          <CreditLine />
        </>
      ) : presetLoading ? (
        <ThemedView style={styles.centered}>
          <ActivityIndicator color={Colors.accent} />
        </ThemedView>
      ) : (
        <ThemedText style={styles.emptyText}>No more tracks — try again in a bit.</ThemedText>
      )}
      {flying && (
        <FlyingCover
          key={flying.mark.trackId}
          artwork={flying.mark.artwork}
          from={flying.from}
          to={flying.to}
          startPx={REVEAL_COVER}
          endPx={flying.endPx}
          delay={1500}
          onLanded={() => handleLanded(flying.mark)}
        />
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
    justifyContent: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  // Part of the page, not a box: tiles straight on the navy, a rule and a label under them.
  strip: {
    width: '100%',
    borderRadius: Radius.sm,
  },
  stripCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  stripCaptionEmpty: {
    justifyContent: 'center',
  },
  stripLabel: {
    ...Ui.label,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  // Tune and Liked: equal halves of one row.
  bottomRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  half: {
    flex: 1,
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
