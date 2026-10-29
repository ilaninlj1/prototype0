import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, type LayoutRectangle, Pressable, StyleSheet, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindsNewsSheet } from '@/components/finds-news-sheet';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { onLikeChange, saveLike } from '@/components/like-button';
import { flySave } from '@/components/save-flight';
import {
  MAX_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  type CardSize,
  type SwipeDirection,
} from '@/components/discovery/swipe-physics';
import { TuneSheet, type NextMode } from '@/components/discovery/tune-sheet';
import { UndoButton } from '@/components/discovery/undo-button';
import { CreditLine } from '@/components/credits';
import { ActionRow } from '@/components/home/action-row';
import { ChromeFade } from '@/components/home/chrome-fade';
import { CornerPause } from '@/components/home/corner-pause';
import { DetailsSheet } from '@/components/home/details-sheet';
import { FeedStatus } from '@/components/home/feed-status';
import { FlyingPrint } from '@/components/home/flying-print';
import { GenreStamp } from '@/components/home/genre-stamp';
import { ListenCard, StackFace, type ListenCardHandle } from '@/components/home/listen-card';
import { LISTEN_INFO_HEIGHT, ListenInfo } from '@/components/home/listen-info';
import { MapButton } from '@/components/home/map-button';
import { slotCenter, type StripRect } from '@/components/home/piece-strip';
import { SavedToast } from '@/components/home/saved-toast';
import { BottleAskCard } from '@/components/bottles/bottle-ask';
import { KeepMoment } from '@/components/bottles/keep-moment';
import { BottleOpening, type OpeningGeometry } from '@/components/bottles/bottle-opening';
import { LaunchLight } from '@/components/bottles/launch-light';
import { SEA_HEIGHT, SeaLine, seaX } from '@/components/bottles/sea-line';
import { songLight, useBottles } from '@/hooks/use-bottles';
import { queueBottleNow, seaPosition } from '@/lib/bottle-countdown';
import { revealLine } from '@/lib/bottle-journey';
import type { FeedMode } from '@/lib/bottles';
import { allDecks, deckCounts, deckLabel, pickDeck, type Deck } from '@/lib/decks';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useHomeChrome } from '@/hooks/use-home-chrome';
import { cluesLine } from '@/lib/home-copy';
import { pickStatus, statusText, type StatusItem } from '@/lib/status-line';
import { addToPiece, forkPiece, saveOnPiece, undoOnPiece, useArt } from '@/hooks/use-art';
import { useCoverColors } from '@/hooks/use-cover-colors';
import { addRevealToEditions, undoRevealInEditions, useEditions } from '@/hooks/use-editions';
import { useSound } from '@/hooks/use-sound';
import { useFindsNews } from '@/hooks/use-finds-news';
import { usePlayback, usePreviewWhileFocused } from '@/hooks/use-playback';
import {
  countSongsHeard,
  deriveGenresHeard,
  deriveSeenTrackIds,
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
  loadLikedTracks,
  loadRegion,
  loadShuffleGenres,
  loadSoundFilter,
  loadSwipeHistory,
  saveDiscoveredGenres,
  saveRegion,
  saveShuffleGenres,
  saveSoundFilter,
  saveSwipeHistory,
} from '@/lib/discovery-storage';
import { pickSimilar } from '@/lib/charts';
import { genreUnderDark, heardIds, refillSource } from '@/lib/dark-map';
import { loadMapView } from '@/lib/dark-map-app';
import { deckPool, fetchArtistListeners, fetchSimilarArtists, getTracks, getTracksBySound, getTracksNear, nearestBySound, trackToDiscoveryTrack } from '@/lib/pool';
import { deckSize } from '@/lib/pool-config';
import { ANY_FILTER, DIMENSIONS, describeFilter, isActive, relax, type SoundFilter } from '@/lib/sound-filter';
import { findItunesArtist } from '@/lib/song-details';
import type { PresetId } from '@/lib/pool-types';
import { GENRES } from '@/lib/taste-test';
import { createActionLock } from '@/lib/action-lock';
import {
  fail as failLoad,
  IDLE,
  simulate,
  start as startLoad,
  stop as stopLoad,
  succeed as succeedLoad,
  type FeedAction,
  type FeedLoad,
  type NetworkTest,
} from '@/lib/feed-load';
import { type PieceMark } from '@/lib/piece';
import { recipeFor, type PrintRecipe } from '@/lib/print-recipe';
import { moreLikeLabel } from '@/lib/sound';
import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';
import { loadSoundMap, mapPointOf, type MapPoint } from '@/lib/sound-map';
import { restlessness, tasteDistance, TIER_LABEL, tierFor } from '@/lib/taste-distance';
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
  /** Where on the Dark Map the feed was, if anywhere: undoing a jump into the dark leaves it. */
  mapFocus: MapFocus | null;
  /** The sound deck in charge, if any (lib/decks.ts). */
  deck: Deck | null;
  /** The card was revealed when the action happened (Next, or down from a reveal): undo shows it revealed again. */
  revealed: { track: DiscoveryTrack; recipe: PrintRecipe | null; listeners: number | null | undefined } | null;
};

type Stamp = { id: number; genre: string; fresh: boolean };
/** A spot on the Dark Map that Home is serving songs from. */
type MapFocus = { point: MapPoint; words: string };
type Flight = { mark: Omit<PieceMark, 'branch'>; from: { x: number; y: number }; to: { x: number; y: number }; endSize: number };

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hydrated, setHydrated] = useState(false);
  // The feed's loading, as explicit states (lib/feed-load.ts): waiting, failed, stopped. Retry re-runs the last load.
  const [load, setLoad] = useState<FeedLoad>(IDLE);
  const lastRefillRef = useRef<Parameters<typeof runRefill> | null>(null);
  // Tune → Test network (not saved): the feed's loading can be made slow or offline on purpose, to see these states.
  const [networkTest, setNetworkTest] = useState<NetworkTest>('off');
  const networkTestRef = useRef<NetworkTest>('off');

  // Starts at the card's max size (a reasonable default before the first
  // layout pass) then shrinks to whatever cardArea actually measures — see
  // handleCardAreaLayout and fitCardToWidth — so the card fits a small
  // screen (e.g. iPhone SE) instead of overflowing behind the button rows.
  // Where the card area and Home itself sit, for the sea and a bottle opening onto the card (components/bottles/).
  const [cardArea, setCardArea] = useState<LayoutRectangle | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  // Until Home has measured itself (some web views never report it), the window stands in: Home is full width.
  const win = useWindowDimensions();
  const [cardSize, setCardSize] = useState<CardSize>({
    width: MAX_CARD_WIDTH,
    height: MAX_CARD_HEIGHT,
  });

  function handleCardAreaLayout(e: LayoutChangeEvent) {
    cardAreaRef.current = e.nativeEvent.layout;
    setCardArea(e.nativeEvent.layout);
    const { width, height } = e.nativeEvent.layout;
    // A square, as big as fits above its words, never wider than the mockup's 340.
    const side = Math.max(160, Math.min(width, height - LISTEN_INFO_HEIGHT - Spacing.xl, CARD_MAX));
    setCardSize({ width: side, height: side });
  }

  const [queue, setQueue] = useState<DiscoveryTrack[]>([]);
  const [strategy, setStrategy] = useState<Strategy>({ type: 'genre', genre: 'Pop' });
  const [swipeHistory, setSwipeHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);
  const [region, setRegion] = useState<Region>('US');
  // Bottles (hooks/use-bottles.ts): strangers' saves wash up here, and yours float.
  const bottles = useBottles(region);
  const [nextMode, setNextMode] = useState<NextMode>('genre');
  // Tune → Sound. The ref is what refills read, so a refill always uses the latest switches.
  const [soundFilter, setSoundFilter] = useState<SoundFilter>(ANY_FILTER);
  const soundFilterRef = useRef<SoundFilter>(ANY_FILTER);
  const [loosened, setLoosened] = useState<string[]>([]);
  // The Dark Map: while set, every refill comes from the songs nearest this spot (lib/pool.ts getTracksNear).
  const [mapFocus, setMapFocusState] = useState<MapFocus | null>(null);
  const mapFocusRef = useRef<MapFocus | null>(null);
  function setMapFocus(focus: MapFocus | null) {
    mapFocusRef.current = focus;
    setMapFocusState(focus);
  }
  // A sound deck (lib/decks.ts): Details' tiles and the What to swipe page. While set, every refill comes from it.
  const [deck, setDeckState] = useState<Deck | null>(null);
  const deckRef = useRef<Deck | null>(null);
  function setDeck(next: Deck | null) {
    deckRef.current = next;
    setDeckState(next);
  }
  // The MAP button's share, recomputed each time Home is focused.
  const [litShare, setLitShare] = useState<number | null>(null);

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

  const { news, dismissNews, syncReleases } = useFindsNews();
  const [newsSheetVisible, setNewsSheetVisible] = useState(false);
  // New-release checks wait until the feed has its first cards.
  const hasCards = queue.length > 0;
  useEffect(() => {
    if (hydrated && hasCards) syncReleases();
  }, [hydrated, hasCards, syncReleases]);

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


  const currentGenre = strategy.type === 'genre' && !mapFocus ? strategy.genre : null;
  const currentLabel = mapFocus ? 'Dark map' : deck ? deckLabel(deck) : strategy.type === 'genre' ? strategy.genre : `More from: ${strategy.artistName}`;

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

  // ---- The piece: every swipe adds the song's print (see lib/piece.ts) ----
  const { piece } = useArt();
  const { unseen: editionReady } = useEditions();
  const pieceRef = useRef(piece);
  pieceRef.current = piece;
  const cardAreaRef = useRef<LayoutRectangle | null>(null);
  const stripRef = useRef<StripRect | null>(null);
  const savedIdsRef = useRef(new Set<number>());
  const [savedIds, setSavedIds] = useState(new Set<number>());
  const [flying, setFlying] = useState<Flight | null>(null);
  const flyingIdRef = useRef<number | null>(null);
  const cardRef = useRef<ListenCardHandle>(null);
  // One action at a time: every swipe, button and Undo takes it first (lib/action-lock.ts).
  const lock = useRef(createActionLock()).current;
  // The revealed song's recipe, frozen when the swipe commits: the card, the flight and the mark all use it.
  const revealRecipeRef = useRef<PrintRecipe | null>(null);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [moreLike, setMoreLike] = useState<{ ids: Set<number>; label: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [revealHeard, setRevealHeard] = useState(1);

  // How much of the top song you've heard: the furthest point the player reached, against 80% of the preview.
  // It decides how settled a print looks in your piece, and how big a skip's ring is.
  const furthestRef = useRef(0);
  useEffect(() => {
    furthestRef.current = 0;
  }, [currentTrack?.id]);
  useEffect(() => {
    furthestRef.current = Math.max(furthestRef.current, status.currentTime);
  }, [status.currentTime]);
  const heardNow = () => (status.duration > 0 ? Math.min(1, furthestRef.current / (status.duration * 0.8)) : 0);

  useEffect(() => {
    loadLikedTracks().then((liked) => {
      const ids = new Set(liked.map((t) => t.id));
      ids.forEach((id) => savedIdsRef.current.add(id));
      setSavedIds(ids);
    });
  }, []);

  // The top card's sound and print. Cards underneath show their still print from the index.
  const { record: topSound } = useSound(currentTrack);
  const coverColors = useCoverColors(currentTrack?.artworkUrl100 ? [currentTrack.artworkUrl100] : []);
  const liveRecipe = useMemo(
    () =>
      currentTrack
        ? recipeFor(currentTrack.id, topSound?.status === 'measured' ? topSound.features : null, coverColors[currentTrack.artworkUrl100] ?? null)
        : null,
    [currentTrack, topSound, coverColors]
  );
  const topRecipe = revealTrack && revealRecipeRef.current ? revealRecipeRef.current : liveRecipe;

  // How far the top song is from what you've saved (sound only): close songs stay calm, far ones get restless.
  const saveSounds = useMemo(
    () =>
      [...savedIds].flatMap((id) => {
        if (id === currentTrack?.id) return [];
        const indexed = soundFor(id);
        if (indexed) return [indexed];
        const cached = soundLookup.peek(id);
        return cached?.status === 'measured' ? [cached.features] : [];
      }),
    [savedIds, currentTrack?.id]
  );
  const depth = topSound?.status === 'measured' ? tasteDistance(topSound.features, saveSounds) : null;
  const topTier = depth == null ? null : tierFor(depth);
  useEffect(() => {
    if (currentTrack) bottles.noteTier(currentTrack.id, topTier);
  }, [currentTrack, topTier, bottles]);

  // A card leaving the top, however it left, settles its bottle news (hooks/use-bottles.ts exit).
  // Undo brings a card back instead, so that change is skipped and its news taken back.
  const prevTopRef = useRef<DiscoveryTrack | null>(null);
  const undoingRef = useRef(false);
  const settleExit = useEffectEvent((left: DiscoveryTrack) => {
    // The sea's bottle only moves on plain swiping, never while you're steering, in a deck or in the dark.
    const counts = !deckRef.current && !mapFocusRef.current && strategy.type !== 'artist';
    void bottles.exit(left, savedIdsRef.current.has(left.id), swipeHistory, counts);
  });
  useEffect(() => {
    const prev = prevTopRef.current;
    prevTopRef.current = currentTrack ?? null;
    if (prev?.id === currentTrack?.id) return;
    if (undoingRef.current) {
      undoingRef.current = false;
      return;
    }
    if (prev) settleExit(prev);
  }, [currentTrack]);

  // A stranger's bottle reaching the top opens onto the card (components/bottles/bottle-opening.tsx), once per bottle.
  const [opening, setOpening] = useState<{ key: string; color: string } | null>(null);
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = currentTrack?.via === 'bottle' ? currentTrack.bottleId : undefined;
    if (!currentTrack || !id || openedRef.current === id) return;
    openedRef.current = id;
    setOpening({ key: id, color: songLight(currentTrack.id) });
  }, [currentTrack]);
  const underIds = queue
    .slice(1, 3)
    .map((t) => t.id)
    .join(',');
  const underRecipes = useMemo(
    () => queue.slice(1, 3).map((t) => recipeFor(t.id, soundFor(t.id), null)),
    // Only the two cards underneath matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [underIds]
  );

  // What a save needs to fly from the card into the You tab, read by the listener below.
  const cardAreaViewRef = useRef<ViewInstance>(null);
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

  // A save anywhere (double-tap, heart, Save) gets the song's red ring. A new one
  // made right here also flies down into the You tab (components/save-flight.tsx):
  // as blurred colors if it's still blind, as the cover once revealed.
  useEffect(
    () =>
      onLikeChange((id, liked) => {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (liked) next.add(id);
          else next.delete(id);
          return next;
        });
        if (!liked) return;
        const first = !savedIdsRef.current.has(id);
        savedIdsRef.current.add(id);
        saveOnPiece(id);
        const f = flightRef.current;
        const track = f.tracks.find((t) => t.id === id);
        if (!first || !f.focused || !track?.artworkUrl100) return;
        cardAreaViewRef.current?.measureInWindow((x, y, w) =>
          flySave({ artwork: track.artworkUrl100, blind: f.revealId !== id, from: { x: x + w / 2, y: y + f.cardHeight / 2 } })
        );
      }),
    []
  );

  async function commitMark(mark: Omit<PieceMark, 'branch'>) {
    const finished = await addToPiece(mark);
    if (finished) router.push({ pathname: '/art', params: { piece: String(finished.number) } });
  }

  function markSwipe(track: DiscoveryTrack, kind: PieceMark['kind'], recipe?: PrintRecipe) {
    const saved = savedIdsRef.current.has(track.id);
    // A skip stays blind: its mark carries no song.
    const heard = heardNow();
    if (kind === 'skip') return commitMark({ trackId: track.id, kind, saved, heard, recipe: recipeFor(track.id, soundFor(track.id), null) });
    const mark: Omit<PieceMark, 'branch'> = {
      trackId: track.id,
      kind,
      saved,
      heard,
      recipe: recipe ?? recipeFor(track.id, soundFor(track.id), null),
      song: { title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100, previewUrl: track.previewUrl || undefined },
    };
    // Every reveal joins the next Edition; the 5th makes it (lib/edition.ts).
    addRevealToEditions({
      ...mark.song!,
      trackId: track.id,
      recipe: mark.recipe,
      heard,
      sound: soundFor(track.id) ?? (topSound?.status === 'measured' ? topSound.features : null),
    });
    if (flying) commitMark(flying.mark); // one still in the air lands now
    flyingIdRef.current = track.id;
    // The print badge appears ~700ms into the reveal; it takes off from there into its slot.
    setTimeout(async () => {
      if (flyingIdRef.current !== track.id) return; // undone meanwhile
      const from = await cardRef.current?.badgeCenter().catch(() => null);
      const strip = stripRef.current;
      if (flyingIdRef.current !== track.id) return;
      if (!from || !strip) {
        // No flight possible: the print still joins the piece.
        flyingIdRef.current = null;
        commitMark(mark);
        return;
      }
      const to = slotCenter(pieceRef.current, strip);
      setFlying({ mark, from, to: { x: to.x, y: to.y }, endSize: to.size });
    }, 800);
  }

  function handleLanded(mark: Omit<PieceMark, 'branch'>) {
    if (flyingIdRef.current !== mark.trackId) return; // undone mid-flight
    flyingIdRef.current = null;
    setFlying(null);
    commitMark({ ...mark, saved: mark.saved || savedIdsRef.current.has(mark.trackId) });
  }

  // Drop swipes are logged from the Play tab; reload so a feed undo can't overwrite them.
  useFocusEffect(
    useCallback(() => {
      loadSwipeHistory().then(setSwipeHistory);
      loadMapView().then((v) => setLitShare(v?.litShare ?? null));
    }, [])
  );

  useEffect(() => {
    if (status.didJustFinish) setHasEnded(true);
  }, [status.didJustFinish]);


  // A tap on the card pauses or plays; once the preview has run out, it starts over.
  async function handleTogglePlay() {
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
      const [history, genres, loadedRegion, spotifyFile, savedFilter] = await Promise.all([
        loadSwipeHistory(),
        loadDiscoveredGenres(),
        loadRegion(),
        loadSpotifyLibrary('file'),
        loadSoundFilter(),
      ]);
      const filter = { ...ANY_FILTER, ...savedFilter };
      soundFilterRef.current = filter;
      setSoundFilter(filter);
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
      // Show the screen right away; the feed panel says it's finding songs.
      setHydrated(true);
      await runRefill([], initialStrategy, history, genres, loadedRegion, 'A', new Set());
    })();
    // Once, at mount: it reads everything it needs from storage, not from state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    lastRefillRef.current = [baseQueue, activeStrategy, history, knownGenres, activeRegion, activePreset, excludeArtists];
    // Only an empty feed shows the waiting panel; a refill behind a playing card stays quiet unless it fails.
    if (baseQueue.length === 0) setLoad((prev) => startLoad(prev, activeStrategy.type === 'genre' ? activeStrategy.genre : activeStrategy.artistName, Date.now()));
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
          simulate(networkTestRef.current, () => {
            // In the dark the map serves the songs, even over artist steering (lib/dark-map.ts refillSource).
            const source = refillSource(strategy.type, mapFocusRef.current != null, isActive(soundFilterRef.current));
            const genre = strategy.type === 'genre' ? strategy.genre : randomGenre();
            const fetched = deckRef.current
              ? deckTracks(history, excludeArtists, activePreset, genre)
              : source === 'map'
                ? mapTracks(history, excludeArtists, activePreset, genre)
                : strategy.type === 'artist'
                  ? fetchForStrategy(strategy, activeRegion)
                  : source === 'sorted'
                    ? Promise.resolve(sortedTracks(activePreset, genre, excludeArtists))
                    : getTracks(activePreset, genre, excludeArtists).then((tracks) => tracks.map(trackToDiscoveryTrack));
            return fetched.then((tracks) => tracks.filter((t) => !hideFromDiscovery(t.artistName) && !alreadyKnown(t.artistName))); // human-only unless AI music is on; never an artist already in your Spotify
          },
          (ms) => new Promise((r) => setTimeout(r, ms)))
      );
      if (refillEpochRef.current !== epoch) return;

      setQueue(nextQueue);
      setLoad((prev) => (nextQueue.length === 0 ? failLoad(prev, 'empty') : succeedLoad()));
      void mixBottle(epoch, landedStrategy, history, nextQueue);
      if (landedStrategy !== activeStrategy) {
        setStrategy(landedStrategy);
      }

      const merged = mergeDiscoveredGenres(knownGenres, extractGenres(fetched));
      if (merged !== knownGenres) {
        setDiscoveredGenres(merged);
        await saveDiscoveredGenres(merged);
      }
    } catch {
      if (refillEpochRef.current !== epoch) return;
      setLoad((prev) => failLoad(prev, 'offline'));
    }
  }

  // A stranger's bottle goes out into the sea a few songs ahead (lib/bottle-countdown.ts); the effect below puts it in
  // the queue once it's the next song.
  async function mixBottle(epoch: number, activeStrategy: Strategy, history: SwipeEntry[], nextQueue: DiscoveryTrack[]) {
    if (nextQueue.length === 0 || refillEpochRef.current !== epoch) return;
    const steering = activeStrategy.type === 'artist' || (!!moreLike && nextQueue.some((t) => moreLike.ids.has(t.id)));
    const mode: FeedMode = deckRef.current ? 'deck' : mapFocusRef.current ? 'map' : steering ? 'artist' : isActive(soundFilterRef.current) ? 'sorted' : 'genre';
    const seen = deriveSeenTrackIds(history);
    await bottles.ensureIncoming({
      genre: activeStrategy.type === 'genre' ? activeStrategy.genre : null,
      mode,
      songsHeard: countSongsHeard(history),
      offline: networkTestRef.current === 'offline',
      accept: (t) => !seen.has(t.id) && !savedIdsRef.current.has(t.id) && !hideFromDiscovery(t.artistName) && !alreadyKnown(t.artistName),
    });
  }
  const incoming = bottles.incoming;
  useEffect(() => {
    if (!incoming || !queueBottleNow(incoming.stepsLeft)) return;
    setQueue((q) => (q.length > 0 && !q.some((t) => t.id === incoming.track.id) ? [q[0], incoming.track, ...q.slice(1)] : q));
  }, [incoming, queue.length]);

  // The panel's buttons. Cancel abandons the load: back to where you were if there's an undo, otherwise just stop.
  function handleFeedAction(action: FeedAction) {
    if (action === 'retry') {
      const args = lastRefillRef.current;
      if (args) void runRefill(...args);
    } else if (action === 'another') {
      lock.release();
      void handleExplore();
    } else {
      ++refillEpochRef.current;
      if (undoSnapshot) {
        setLoad(IDLE);
        lock.release();
        void handleUndo();
      } else setLoad((prev) => stopLoad(prev));
    }
  }

  // Sort by sound: matching catalog songs only. If fewer than 3 match in this genre, let go of one switch at a
  // time (finest first, lib/sound-filter.ts relax) and say which, so the feed never runs dry.
  function sortedTracks(activePreset: PresetId, genre: string, excludeArtists: Set<string>): DiscoveryTrack[] {
    let filter = soundFilterRef.current;
    let tracks = getTracksBySound(activePreset, genre, excludeArtists, filter, deckSize);
    const dropped: string[] = [];
    while (tracks.length < 3) {
      const next = relax(filter);
      if (!next) break;
      filter = next.filter;
      dropped.push(DIMENSIONS.find((d) => d.key === next.dropped)!.label.toLowerCase());
      tracks = getTracksBySound(activePreset, genre, excludeArtists, filter, deckSize);
    }
    setLoosened(dropped);
    return tracks;
  }

  // A sound deck's next songs: unheard, any genre, one per artist. When it runs dry, back to the genre.
  async function deckTracks(history: SwipeEntry[], excludeArtists: Set<string>, activePreset: PresetId, genre: string): Promise<DiscoveryTrack[]> {
    const d = deckRef.current;
    const keep = (a: string) => !excludeArtists.has(a) && !hideFromDiscovery(a) && !alreadyKnown(a);
    const picked = d ? pickDeck(deckPool(), d, { heard: heardIds(history), keep, n: deckSize, rand: Math.random }) : [];
    if (picked.length > 0) return picked;
    setDeck(null);
    return (await getTracks(activePreset, genre, excludeArtists)).map(trackToDiscoveryTrack);
  }

  // Start a deck. The card that was playing leaves like a genre jump (a revealed one was already logged).
  async function startDeck(next: Deck) {
    if (!lock.take()) return;
    captureUndoSnapshot();
    setDetailsOpen(false);
    const wasRevealed = !!currentTrack && revealTrack?.id === currentTrack.id;
    if (currentTrack && !wasRevealed) {
      cardsSeenSincePresetChangeRef.current += 1;
      markSwipe(currentTrack, 'skip');
    }
    forkPiece();
    setStamp({ id: Date.now(), genre: deckLabel(next), fresh: false });
    const nextHistory = currentTrack && !wasRevealed ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextSeen = currentTrack ? markArtistSeen(currentTrack) : seenArtists;
    setRevealTrack(null);
    revealIdRef.current = null;
    revealRecipeRef.current = null;
    setMoreLike(null);
    setMapFocus(null);
    const under = genreUnderDark(strategy, currentTrack?.primaryGenreName ?? null, GENRES);
    if (under !== strategy) setStrategy(under);
    if (nextMode === 'artist') setNextMode('genre');
    setDeck(next);
    setQueue([]);
    await runRefill([], under, nextHistory, discoveredGenres, region, preset, nextSeen);
  }

  // ✕ on the "Swiping: …" line: back to the genre, keeping the card that's playing.
  async function leaveDeck() {
    if (!deckRef.current) return;
    setDeck(null);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, region, preset, seenArtists);
  }

  // In the dark: the unheard songs nearest the map spot. When that spot has nothing left, leave the dark and go
  // back to the genre, so the feed never stalls.
  async function mapTracks(history: SwipeEntry[], excludeArtists: Set<string>, activePreset: PresetId, genre: string): Promise<DiscoveryTrack[]> {
    const focus = mapFocusRef.current;
    const near = focus ? getTracksNear(focus.point, deckSize, heardIds(history), excludeArtists, (a) => !hideFromDiscovery(a) && !alreadyKnown(a)) : [];
    if (near.length > 0) return near;
    setMapFocus(null);
    return (await getTracks(activePreset, genre, excludeArtists)).map(trackToDiscoveryTrack);
  }

  async function handleChangeSoundFilter(filter: SoundFilter) {
    soundFilterRef.current = filter;
    setSoundFilter(filter);
    setLoosened([]);
    saveSoundFilter(filter);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, region, preset, seenArtists);
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
      ...(track.via === 'map' ? { source: 'map' as const } : track.via === 'bottle' ? { source: 'bottle' as const } : {}),
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
    // In the dark the map picks the songs: no Similar hops or genre shuffles out of it.
    if (mapFocusRef.current) return strategy;
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
    markSwipe(track, 'skip');
    const nextHistory = await logSwipe(track, 'skip');
    const nextSeen = markArtistSeen(track);
    const nextQueue = queue.slice(1);
    promotePeek(nextQueue[0]?.previewUrl);
    setQueue(nextQueue);
    lock.release();
    // A similar-artist hop can take seconds; if another swipe lands first,
    // its refill wins and this one (with its older queue) is dropped.
    const epoch = ++refillEpochRef.current;
    const nextStrategy = await strategyAfterSwipe(track, nextHistory, epoch);
    if (refillEpochRef.current !== epoch) return;
    await runRefill(nextQueue, nextStrategy, nextHistory, discoveredGenres, region, preset, nextSeen);
  }

  // Swipe right: who is this? The card reveals in place, its print joins the
  // piece, and the next 3 songs are the closest in sound (More like this).
  // Saving stays separate: double-tap or Save. The lock is released when the
  // reveal has settled (ListenCard's onRevealSettled).
  async function handleReveal(track: DiscoveryTrack) {
    ++refillEpochRef.current;
    cardsSeenSincePresetChangeRef.current += 1;
    const recipe = liveRecipe ?? recipeFor(track.id, null, null);
    revealRecipeRef.current = recipe;
    setRevealHeard(heardNow());
    markSwipe(track, 'reveal', recipe);
    setRevealTrack(track);
    setRevealListeners(track.artistListeners);
    revealIdRef.current = track.id;
    steerToNeighbors(track);
    await logSwipe(track, 'reveal');
    markArtistSeen(track);
    const found = track.artistListeners ?? (await fetchArtistListeners(track.artistName));
    if (revealIdRef.current === track.id) setRevealListeners(found);
  }

  // More like this: the bundled catalog's nearest songs in sound go next, no network (lib/pool.ts nearestBySound).
  function steerToNeighbors(track: DiscoveryTrack) {
    const sound = topSound?.status === 'measured' ? topSound.features : null;
    // In the dark, the next songs come from beside this one on the map, from any genre, as the map serves them.
    const map = mapFocusRef.current ? loadSoundMap() : null;
    const here = map ? mapPointOf(map, track.id) : null;
    if (here) {
      const heard = heardIds(swipeHistory).add(track.id);
      const near = getTracksNear(here, 3, heard, seenArtists, (a) => !hideFromDiscovery(a) && !alreadyKnown(a));
      const rest = queue.slice(1).filter((t) => !near.some((n) => n.id === t.id));
      setQueue([queue[0], ...near, ...rest]);
      setMoreLike({ ids: new Set(near.map((t) => t.id)), label: sound ? moreLikeLabel(sound) : 'nearby on the map' });
      return;
    }
    if (strategy.type !== 'genre') return setMoreLike(null);
    const near = sound
      ? nearestBySound(preset, strategy.genre, { sound, artist: track.artistName }, 3, seenArtists, (a) => !hideFromDiscovery(a) && !alreadyKnown(a))
      : [];
    if (sound && near.length) {
      const rest = queue.slice(1).filter((t) => !near.some((n) => n.id === t.id));
      setQueue([queue[0], ...near, ...rest]);
      setMoreLike({ ids: new Set(near.map((t) => t.id)), label: moreLikeLabel(sound) });
    } else {
      setMoreLike({ ids: new Set(queue.slice(1, 4).map((t) => t.id)), label: 'same genre' });
    }
  }

  // Double-tap: save to Liked while staying blind; the card stays put.
  async function handleSave(track: DiscoveryTrack) {
    const likedAt = Date.now();
    await logSwipe(track, 'like');
    await saveLike({ ...track, likedAt });
  }

  async function handleRevealDone() {
    if (revealIdRef.current == null) return lock.release();
    const revealed = revealTrack;
    setRevealTrack(null);
    revealIdRef.current = null;
    revealRecipeRef.current = null;
    setDetailsOpen(false);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    lock.release();
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
    setMapFocus(null);
    setDeck(null);
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

  // The Dark Map → "Swipe blind here": a jump like a genre pick, into the songs nearest that spot.
  const applyMapJump = useEffectEvent((point: MapPoint, words: string) => {
    void jumpIntoMap(point, words);
  });

  async function jumpIntoMap(point: MapPoint, words: string) {
    if (!lock.take()) return;
    captureUndoSnapshot();
    if (currentTrack) {
      cardsSeenSincePresetChangeRef.current += 1;
      markSwipe(currentTrack, 'skip');
    }
    forkPiece();
    setStamp({ id: Date.now(), genre: words, fresh: false });
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextSeen = currentTrack ? markArtistSeen(currentTrack) : seenArtists;
    setRevealTrack(null);
    revealIdRef.current = null;
    revealRecipeRef.current = null;
    setMoreLike(null);
    // Underneath the dark is a genre, never an artist: it's what Home goes back to when you leave.
    const under = genreUnderDark(strategy, currentTrack?.primaryGenreName ?? null, GENRES);
    if (under !== strategy) setStrategy(under);
    if (nextMode === 'artist') setNextMode('genre');
    setDeck(null);
    setMapFocus({ point, words });
    setQueue([]);
    await runRefill([], under, nextHistory, discoveredGenres, region, preset, nextSeen);
  }

  // ✕ on the "In the dark" line: back to the current genre, keeping the card that's playing.
  async function leaveMap() {
    if (!mapFocusRef.current) return;
    setMapFocus(null);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, region, preset, seenArtists);
  }

  // Liked list → "More from this artist" / "More like this sound"; the Dark Map → "Swipe blind here".
  useEffect(() => {
    if (!hydrated || !isFocused) return;
    const request = takeSteerRequest();
    if (!request) return;
    if (request.kind === 'map') applyMapJump(request.point, request.words);
    else applyRouteSteering(request.kind, request.strategy);
  }, [hydrated, isFocused]);

  async function commitGenreJump(genre: string, nextHistory: SwipeEntry[], excludeArtists: Set<string>) {
    setMapFocus(null);
    setDeck(null);
    // A jump always leaves the card behind, revealed or not.
    setRevealTrack(null);
    revealIdRef.current = null;
    revealRecipeRef.current = null;
    setMoreLike(null);
    if (nextMode === 'artist') setNextMode('genre');
    const nextStrategy: Strategy = { type: 'genre', genre };
    setStrategy(nextStrategy);
    setQueue([]);
    // Genre changes independently of preset — activePreset here is
    // whatever's currently selected, untouched by this jump.
    await runRefill([], nextStrategy, nextHistory, discoveredGenres, region, preset, excludeArtists);
  }

  // Swipe down: the song you jumped from leaves a blind mark, the piece forks, and the new genre's name stamps in.
  async function handleGenreJump(track: DiscoveryTrack) {
    cardsSeenSincePresetChangeRef.current += 1;
    markSwipe(track, 'skip');
    forkPiece();
    const heardBefore = deriveGenresHeard(swipeHistory);
    const nextHistory = await logSwipe(track, 'genre-jump');
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const newGenre = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    setStamp({ id: Date.now(), genre: newGenre, fresh: !heardBefore.has(newGenre) });
    const nextSeen = markArtistSeen(track);
    await commitGenreJump(newGenre, nextHistory, nextSeen);
  }

  function captureUndoSnapshot() {
    setUndoSnapshot({
      queue,
      strategy,
      discoveredGenres,
      swipeHistory,
      seenArtists,
      mapFocus: mapFocusRef.current,
      deck: deckRef.current,
      revealed: revealTrack ? { track: revealTrack, recipe: revealRecipeRef.current, listeners: revealListeners } : null,
    });
  }

  // Swipe down from a revealed card: the reveal was already logged, so nothing new is logged for this song.
  async function handleJumpFromReveal() {
    ++refillEpochRef.current;
    setDetailsOpen(false);
    forkPiece();
    const heard = deriveGenresHeard(swipeHistory);
    const genre = pickJumpGenre(discoveredGenres, heard, GENRES, swipeHistory);
    setStamp({ id: Date.now(), genre, fresh: !heard.has(genre) });
    await commitGenreJump(genre, swipeHistory, seenArtists);
  }

  // Every committed swipe lands here holding the action lock (ListenCard asks for it, or press() took it).
  function handleCardSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
    captureUndoSnapshot();
    if (revealTrack) {
      if (direction === 'down') void handleJumpFromReveal();
      else void handleRevealDone();
      return;
    }
    if (direction === 'left') void handleSkip(track);
    else if (direction === 'right') void handleReveal(track);
    else void handleGenreJump(track);
  }

  // The buttons under the card: the same animation and handler as the swipe.
  function press(direction: SwipeDirection) {
    if (!cardRef.current || !lock.take()) return;
    cardRef.current?.fling(direction, true);
  }

  // The genre picker and Explore jump like a down swipe, so they hold the action lock too (the stamp releases it).
  async function handlePickGenre(genre: string) {
    if (!lock.take()) return;
    captureUndoSnapshot();
    if (currentTrack) {
      cardsSeenSincePresetChangeRef.current += 1;
      markSwipe(currentTrack, 'skip');
    }
    forkPiece();
    setStamp({ id: Date.now(), genre, fresh: !deriveGenresHeard(swipeHistory).has(genre) });
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextSeen = currentTrack ? markArtistSeen(currentTrack) : seenArtists;
    await commitGenreJump(genre, nextHistory, nextSeen);
  }

  async function handleExplore() {
    if (!lock.take()) return;
    captureUndoSnapshot();
    if (currentTrack) {
      cardsSeenSincePresetChangeRef.current += 1;
      markSwipe(currentTrack, 'skip');
    }
    forkPiece();
    const heardBefore = deriveGenresHeard(swipeHistory);
    const nextHistory = currentTrack ? await logSwipe(currentTrack, 'genre-jump') : swipeHistory;
    const nextGenresHeard = deriveGenresHeard(nextHistory);
    const target = pickJumpGenre(discoveredGenres, nextGenresHeard, GENRES, nextHistory);
    setStamp({ id: Date.now(), genre: target, fresh: !heardBefore.has(target) });
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
    if (!snapshot || !lock.take()) return;
    refillEpochRef.current += 1;
    const undone = snapshot.queue[0];
    // Undoing Next (or a jump from a reveal) shows the card revealed again; its print stays in the piece.
    if (undone && !snapshot.revealed) {
      undoRevealInEditions(undone.id);
      if (flyingIdRef.current === undone.id) {
        flyingIdRef.current = null;
        setFlying(null);
      } else undoOnPiece(undone.id);
    }
    setUndoSnapshot(null);
    undoingRef.current = undone?.id !== currentTrack?.id;
    bottles.undo();
    setRevealTrack(snapshot.revealed?.track ?? null);
    revealIdRef.current = snapshot.revealed?.track.id ?? null;
    revealRecipeRef.current = snapshot.revealed?.recipe ?? null;
    if (snapshot.revealed) setRevealListeners(snapshot.revealed.listeners);
    setMoreLike(null);
    setStamp(null);
    setDetailsOpen(false);
    setQueue(snapshot.queue);
    setStrategy(snapshot.strategy);
    setMapFocus(snapshot.mapFocus);
    setDeck(snapshot.deck);
    setDiscoveredGenres(snapshot.discoveredGenres);
    const restoredHistory = keepDropEntries(snapshot.swipeHistory, await loadSwipeHistory());
    setSwipeHistory(restoredHistory);
    setSeenArtists(snapshot.seenArtists);
    await Promise.all([
      saveSwipeHistory(restoredHistory),
      saveDiscoveredGenres(snapshot.discoveredGenres),
    ]);
    lock.release();
  }

  async function handleToggleRegion() {
    const nextRegion = REGIONS[(REGIONS.indexOf(region) + 1) % REGIONS.length];
    setRegion(nextRegion);
    await saveRegion(nextRegion);
    const preserved = queue.slice(0, 1);
    setQueue(preserved);
    await runRefill(preserved, strategy, swipeHistory, discoveredGenres, nextRegion, preset, seenArtists);
  }

  // Home's buttons come and go (lib/home-chrome.ts): only the card and its clues stay while you listen.
  const [tuneOpen, setTuneOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [toastFloating, setToastFloating] = useState(false);
  const chrome = useHomeChrome({
    songsDecided: swipeHistory.length,
    clipEnded: hasEnded,
    feedStatusUp: !currentTrack,
    sheetOpen: detailsOpen || newsSheetVisible || tuneOpen || genreOpen,
  });
  const { wake } = chrome;
  // Coming back to Home brings them back for a moment.
  useFocusEffect(wake);

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  // Every button also keeps the buttons up (wake), so a tap never makes them vanish mid-use.

  // A save shows the toast once, the first time a song is kept.
  async function saveFromHome(track: DiscoveryTrack) {
    // Shown at the tap, not after storage answers: the save itself can take a moment.
    const first = !savedIds.has(track.id);
    if (first) {
      setToastFloating(false);
      setToast(true);
    }
    const listenMs = Math.round(status.currentTime * 1000);
    await handleSave(track);
    if (first && (await bottles.saved(track, swipeHistory, listenMs))) setToastFloating(true);
    // Keeping a bottle shows the keep moment in the toast's place; the toast mustn't come back after it.
    if (first && track.via === 'bottle') setToast(false);
  }

  // One line at the top, the most important thing first (lib/status-line.ts).
  const statusItem = pickStatus({
    failedOffline: !!currentTrack && load.phase === 'failed' && load.reason === 'offline',
    editionReady: editionReady ?? null,
    newsCount: news.length,
    mapWords: mapFocus ? mapFocus.words : null,
    deckLabel: deck ? deckLabel(deck) : null,
    moreLabel: !!moreLike && !!currentTrack && moreLike.ids.has(currentTrack.id) ? moreLike.label : null,
    sortedText:
      isActive(soundFilter) && strategy.type === 'genre'
        ? `${describeFilter(soundFilter)}${loosened.length > 0 ? ` · loosened ${loosened.join(', ')}` : ''}`
        : null,
  });
  // The sea and the opening, in Home's own coordinates.
  const side = cardSize.width;
  const cardLeft = cardArea ? cardArea.x + (cardArea.width - side) / 2 : 0;
  const cardTop = cardArea ? cardArea.y + (cardArea.height - (side + Spacing.xl + LISTEN_INFO_HEIGHT)) / 2 : 0;
  const frameW = frame.width || win.width;
  const frameH = frame.height || win.height - 72 - insets.bottom;
  const seaSurfaceY = frameH + 4 - SEA_HEIGHT + 17;
  const openingGeometry: OpeningGeometry | null =
    cardArea && frameW > 0
      ? {
          from: { x: seaX(0, frameW), y: seaSurfaceY },
          stage: { x: cardLeft + side / 2, y: cardTop + side + Spacing.xl + LISTEN_INFO_HEIGHT / 2 },
          card: { x: cardLeft, y: cardTop, size: side },
        }
      : null;
  const seaBottle =
    incoming && incoming.stepsLeft >= 1 && currentTrack?.bottleId !== incoming.track.bottleId
      ? { key: incoming.track.bottleId ?? String(incoming.track.id), color: songLight(incoming.track.id), position: seaPosition(incoming.stepsLeft) }
      : null;
  const statusTappable = !!statusItem && statusItem.kind !== 'more' && statusItem.kind !== 'sorted';
  function openStatus(item: StatusItem) {
    wake();
    if (item.kind === 'failed') handleFeedAction('retry');
    else if (item.kind === 'edition') router.push({ pathname: '/edition', params: { n: String(item.n) } });
    else if (item.kind === 'news') setNewsSheetVisible(true);
    else if (item.kind === 'map') leaveMap();
    else if (item.kind === 'deck') leaveDeck();
  }

  const revealedNow = !!currentTrack && revealTrack?.id === currentTrack.id;

  return (
    <ThemedView
      style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}
      onLayout={(e) => setFrame({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {/* Behind everything: a tap on empty space brings the buttons back. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={wake} accessible={false} />
      {frameW > 0 && <SeaLine width={frameW} incoming={seaBottle} outgoing={bottles.launchFx} />}

      <ChromeFade visible={chrome.visible} alwaysShow={statusItem?.kind === 'failed'} style={styles.statusLine}>
        {statusItem && (
          <Pressable
            onPress={() => openStatus(statusItem)}
            disabled={!statusTappable}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole={statusTappable ? 'button' : 'text'}
            style={styles.statusRow}>
            {(statusItem.kind === 'failed' || statusItem.kind === 'edition' || statusItem.kind === 'news') && <View style={styles.dot} />}
            <ThemedText style={styles.statusText} numberOfLines={1}>
              {statusText(statusItem)}
            </ThemedText>
            {statusTappable && statusItem.kind !== 'map' && <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />}
          </Pressable>
        )}
      </ChromeFade>

      <ChromeFade visible={chrome.visible} style={styles.headerRow}>
        <GenrePicker
          curatedGenres={GENRES}
          discoveredGenres={discoveredGenres}
          currentGenre={currentGenre}
          currentLabel={currentLabel}
          onSelect={handlePickGenre}
          onExplore={handleExplore}
          onPickDeck={startDeck}
          countDecks={() => deckCounts(deckPool(), allDecks(), heardIds(swipeHistory))}
          onOpenChange={setGenreOpen}
        />
        <View style={styles.headerRight}>
          <MapButton variant="icon" share={litShare} onPress={() => {
              wake();
              router.push('/map');
            }} />
          <TuneSheet
            trigger="icon"
            onOpenChange={setTuneOpen}
            preset={preset}
            presetLoading={presetLoading}
            region={region}
            onSelectPreset={handleSelectPreset}
            onToggleRegion={handleToggleRegion}
            nextMode={nextMode}
            onSetNextMode={handleSetNextMode}
            soundFilter={soundFilter}
            onChangeSoundFilter={handleChangeSoundFilter}
            networkTest={networkTest}
            onChangeNetworkTest={(mode) => {
              networkTestRef.current = mode;
              setNetworkTest(mode);
            }}
          />
          <UndoButton variant="icon" disabled={!undoSnapshot} onPress={() => {
              wake();
              handleUndo();
            }} />
        </View>
      </ChromeFade>

      {currentTrack && topRecipe ? (
        <>
          <View ref={cardAreaViewRef} style={styles.cardArea} onLayout={handleCardAreaLayout} pointerEvents="box-none">
            <View style={cardSize}>
              {queue
                .slice(1, 3)
                .map((t, i) => ({ t, i: i + 1, recipe: underRecipes[i] }))
                .reverse()
                .map(({ t, i, recipe }) =>
                  recipe ? (
                    <View key={t.id} style={[styles.under, { transform: [{ scale: 1 - i * 0.04 }, { translateY: i * 10 }] }]}>
                      <StackFace track={t} size={cardSize} recipe={recipe} />
                    </View>
                  ) : null
                )}
              <ListenCard
                key={currentTrack.id}
                ref={cardRef}
                track={currentTrack}
                size={cardSize}
                recipe={topRecipe}
                revealed={revealedNow}
                restless={depth == null ? null : restlessness(depth)}
                heard={revealedNow ? revealHeard : 1}
                takeLock={lock.take}
                onSwipe={(d) => handleCardSwipe(d, currentTrack)}
                onSwipeUp={() => {
                  wake();
                  setDetailsOpen(true);
                }}
                onSave={() => saveFromHome(currentTrack)}
                onTap={chrome.toggleFromCard}
                onRevealSettled={lock.release}
                onMix={setMix}
                onCancelPeek={cancelPeek}
              />
              <LaunchLight
                trigger={bottles.launchFx?.key ?? 0}
                height={cardSize.height}
                fall={seaSurfaceY - (cardTop + side / 2)}
                color={bottles.launchFx?.color ?? '#e8a33d'}
              />
              <ChromeFade visible={chrome.visible} style={styles.cornerPause}>
                <CornerPause paused={!status.playing} onPress={() => {
                    wake();
                    handleTogglePlay();
                  }} />
              </ChromeFade>
            </View>
            <ListenInfo
              track={currentTrack}
              revealed={revealedNow}
              clues={cluesLine(topRecipe.label, depth == null ? null : TIER_LABEL[tierFor(depth)])}
              listeners={revealedNow ? revealListeners : undefined}
              onCallSave={handleSave}
              origin={currentTrack.bottle ? revealLine(currentTrack.bottle) : null}
            />
          </View>

          <ChromeFade visible={chrome.visible} style={styles.bottom}>
            <ActionRow
              mode={revealTrack ? 'revealed' : 'blind'}
              saved={savedIds.has(currentTrack.id)}
              onSkip={() => {
                wake();
                press('left');
              }}
              onJump={() => {
                wake();
                press('down');
              }}
              onMore={() => {
                wake();
                press('right');
              }}
              onSave={() => {
                wake();
                saveFromHome(currentTrack);
              }}
              onDetails={() => {
                wake();
                setDetailsOpen(true);
              }}
              onNext={() => {
                wake();
                press('right');
              }}
            />
          </ChromeFade>
          {/* One row under the buttons: the credits, or for a few seconds after a save, the toast in their place. */}
          <View style={styles.slot} pointerEvents="box-none">
            {/* Bottles' cards are taller than the row, so they rise from its bottom over the buttons. */}
            {bottles.ask ? (
              <View style={styles.lift} pointerEvents="box-none">
                <BottleAskCard
                  ask={bottles.ask}
                  onConsent={(useCity) => void bottles.answerConsent(useCity, swipeHistory)}
                  onOldFinds={(float) => void bottles.answerOldFinds(float)}
                />
              </View>
            ) : bottles.keep ? (
              <View style={styles.lift} pointerEvents="none">
                <KeepMoment moment={bottles.keep} onDone={bottles.dismissKeep} />
              </View>
            ) : toast ? (
              <SavedToast
                visible
                floating={toastFloating}
                onHide={() => setToast(false)}
                onViewLibrary={() => {
                  setToast(false);
                  router.navigate('/library');
                }}
              />
            ) : (
              <ChromeFade visible={chrome.visible}>
                <CreditLine />
              </ChromeFade>
            )}
          </View>

          {!chrome.visible && !bottles.ask && !bottles.keep && (
            <ThemedText style={styles.hint} pointerEvents="none">
              {revealedNow ? 'Double-tap to save · swipe up for details' : 'Tap anywhere for buttons · swipe the card to choose'}
            </ThemedText>
          )}
        </>
      ) : (
        <>
          <View style={styles.statusArea}>
            <FeedStatus load={load} onAction={handleFeedAction} />
          </View>
          <CreditLine />
        </>
      )}

      {/* Outside the card branch: the queue empties for a moment during a jump, and the stamp must not remount. */}
      {stamp && (
        <GenreStamp
          key={stamp.id}
          genre={stamp.genre}
          fresh={stamp.fresh}
          onDone={() => {
            setStamp((s) => (s?.id === stamp.id ? null : s));
            lock.release();
          }}
        />
      )}
      {flying && (
        <FlyingPrint
          key={flying.mark.trackId}
          recipe={flying.mark.recipe}
          from={flying.from}
          to={flying.to}
          endSize={flying.endSize}
          onLanded={() => handleLanded(flying.mark)}
        />
      )}
      {opening && openingGeometry && (
        <BottleOpening runKey={opening.key} color={opening.color} geometry={openingGeometry} onDone={() => setOpening(null)} />
      )}
      <DetailsSheet
        visible={detailsOpen}
        track={revealTrack}
        listeners={revealListeners}
        onSave={saveFromHome}
        onPlayDeck={startDeck}
        onClose={() => setDetailsOpen(false)}
      />
      <FindsNewsSheet
        visible={newsSheetVisible}
        items={news}
        onClose={(played) => {
          setNewsSheetVisible(false);
          dismissNews();
          // A news song took the player; put the card's song back.
          if (played && currentTrack?.previewUrl) {
            player.replace(currentTrack.previewUrl);
            player.play();
          }
        }}
      />
    </ThemedView>
  );
}

// The mockup's card: a 340pt square at most.
const CARD_MAX = 340;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    alignItems: 'stretch',
  },
  // Reserved height, so the card never jumps when the line comes and goes.
  statusLine: { height: 20, justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.signal },
  statusText: { ...Typography.caption, fontSize: 14, lineHeight: 18, flexShrink: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  // The card and its words, together in the middle of the white.
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  cornerPause: { position: 'absolute', top: Spacing.md, left: Spacing.md },
  bottom: { gap: Spacing.lg },
  hint: { ...Typography.caption, position: 'absolute', left: 0, right: 0, bottom: 72, textAlign: 'center' },
  slot: { height: 52, justifyContent: 'center' },
  lift: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  statusArea: { flex: 1, marginBottom: Spacing.lg },
  under: { position: 'absolute', top: 0, left: 0, opacity: 0.55 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
