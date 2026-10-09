import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, type LayoutRectangle, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FindsNewsSheet } from '@/components/finds-news-sheet';
import { GenrePicker } from '@/components/discovery/genre-picker';
import { LikedTracksButton } from '@/components/discovery/liked-tracks-button';
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
import { ActionRow } from '@/components/home/action-row';
import { DetailsSheet } from '@/components/home/details-sheet';
import { FlyingPrint } from '@/components/home/flying-print';
import { GenreStamp } from '@/components/home/genre-stamp';
import { ListenCard, StackFace, type ListenCardHandle } from '@/components/home/listen-card';
import { PieceStrip, slotCenter, type StripRect } from '@/components/home/piece-strip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { addToPiece, forkPiece, saveOnPiece, undoOnPiece, useArt } from '@/hooks/use-art';
import { useCoverColors } from '@/hooks/use-cover-colors';
import { addRevealToEditions, undoRevealInEditions, useEditions } from '@/hooks/use-editions';
import { useSound } from '@/hooks/use-sound';
import { useFindsNews } from '@/hooks/use-finds-news';
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
import { fetchArtistListeners, fetchSimilarArtists, getTracks, getTracksBySound, nearestBySound, trackToDiscoveryTrack } from '@/lib/pool';
import { deckSize } from '@/lib/pool-config';
import { ANY_FILTER, DIMENSIONS, describeFilter, isActive, relax, type SoundFilter } from '@/lib/sound-filter';
import { findItunesArtist } from '@/lib/song-details';
import type { PresetId } from '@/lib/pool-types';
import { GENRES } from '@/lib/taste-test';
import { createActionLock } from '@/lib/action-lock';
import { PIECE, type PieceMark } from '@/lib/piece';
import { recipeFor, type PrintRecipe } from '@/lib/print-recipe';
import { moreLikeLabel } from '@/lib/sound';
import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';
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
  /** The card was revealed when the action happened (Next, or down from a reveal): undo shows it revealed again. */
  revealed: { track: DiscoveryTrack; recipe: PrintRecipe | null; listeners: number | null | undefined } | null;
};

type Stamp = { id: number; genre: string; fresh: boolean };
type Flight = { mark: Omit<PieceMark, 'branch'>; from: { x: number; y: number }; to: { x: number; y: number }; endSize: number };

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
  // Tune → Sound. The ref is what refills read, so a refill always uses the latest switches.
  const [soundFilter, setSoundFilter] = useState<SoundFilter>(ANY_FILTER);
  const soundFilterRef = useRef<SoundFilter>(ANY_FILTER);
  const [loosened, setLoosened] = useState<string[]>([]);

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
    addRevealToEditions({ ...mark.song!, trackId: track.id, recipe: mark.recipe, heard });
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
      await runRefill([], initialStrategy, history, genres, loadedRegion, 'A', new Set());

      setHydrated(true);
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
            : isActive(soundFilterRef.current)
              ? Promise.resolve(sortedTracks(activePreset, strategy.genre, excludeArtists))
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
    setRevealTrack(snapshot.revealed?.track ?? null);
    revealIdRef.current = snapshot.revealed?.track.id ?? null;
    revealRecipeRef.current = snapshot.revealed?.recipe ?? null;
    if (snapshot.revealed) setRevealListeners(snapshot.revealed.listeners);
    setMoreLike(null);
    setStamp(null);
    setDetailsOpen(false);
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

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      {news.length > 0 && (
        <TouchableOpacity
          onPress={() => setNewsSheetVisible(true)}
          activeOpacity={0.8}
          style={styles.newsStrip}
          accessibilityRole="button"
          accessibilityLabel={`While you were gone, ${news.length} updates`}>
          <ThemedText style={styles.newsStripText}>
            While you were gone · {news.length}
          </ThemedText>
        </TouchableOpacity>
      )}

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

      {currentTrack && topRecipe ? (
        <>
          <View style={styles.noteLine}>
            {editionReady != null ? (
              <Pressable
                onPress={() => router.push({ pathname: '/edition', params: { n: String(editionReady) } })}
                hitSlop={{ top: 14, bottom: 14 }}
                accessibilityRole="button"
                accessibilityLabel={`Edition number ${editionReady} is ready. Play it`}>
                <ThemedText style={[styles.note, styles.editionNote]} numberOfLines={1}>
                  EDITION No. {editionReady} IS READY · TAP TO PLAY ▸
                </ThemedText>
              </Pressable>
            ) : !!moreLike && moreLike.ids.has(currentTrack.id) ? (
              <ThemedText style={styles.note} numberOfLines={1}>
                More like this: {moreLike.label}
              </ThemedText>
            ) : isActive(soundFilter) && strategy.type === 'genre' ? (
              <ThemedText style={styles.note} numberOfLines={1}>
                Sorted: {describeFilter(soundFilter)}
                {loosened.length > 0 ? ` · loosened ${loosened.join(', ')}` : ''}
              </ThemedText>
            ) : null}
          </View>

          <View ref={cardAreaViewRef} style={styles.cardArea} onLayout={handleCardAreaLayout}>
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
                revealed={revealTrack?.id === currentTrack.id}
                slotLabel={`PRINT ${Math.min(piece.marks.length + 1, PIECE.slots)}/${PIECE.slots}`}
                restless={depth == null ? null : restlessness(depth)}
                tierLabel={depth == null ? null : TIER_LABEL[tierFor(depth)]}
                heard={revealTrack?.id === currentTrack.id ? revealHeard : 1}
                listeners={revealTrack?.id === currentTrack.id ? revealListeners : undefined}
                takeLock={lock.take}
                onSwipe={(d) => handleCardSwipe(d, currentTrack)}
                onSave={() => handleSave(currentTrack)}
                onTogglePlay={handleTogglePlay}
                onRevealSettled={lock.release}
                onCallSave={handleSave}
                onMix={setMix}
                onCancelPeek={cancelPeek}
              />
            </View>
          </View>

          <ActionRow
            mode={revealTrack ? 'revealed' : 'blind'}
            saved={savedIds.has(currentTrack.id)}
            onSkip={() => press('left')}
            onJump={() => press('down')}
            onMore={() => press('right')}
            onSave={() => handleSave(currentTrack)}
            onDetails={() => setDetailsOpen(true)}
            onNext={() => press('right')}
          />

          <PieceStrip piece={piece} onPress={() => router.push('/art')} onLayoutStrip={(rect) => (stripRef.current = rect)} />

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
              soundFilter={soundFilter}
              onChangeSoundFilter={handleChangeSoundFilter}
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
      <DetailsSheet
        visible={detailsOpen}
        track={revealTrack}
        listeners={revealListeners}
        onSave={handleSave}
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

const styles = StyleSheet.create({
  newsStrip: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsStripText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.accentText,
  },
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
  // Reserved height, so the card never jumps when the More like this note comes and goes.
  noteLine: { height: 16, justifyContent: 'center' },
  note: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1, color: Colors.textSecondary },
  editionNote: { color: Colors.text },
  under: { position: 'absolute', top: 0, left: 0, opacity: 0.55 },
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
