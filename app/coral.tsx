import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import { cancelAnimation, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoralBranchSheet } from '@/components/coral/coral-branch-sheet';
import { CoralButton } from '@/components/coral/coral-controls';
import { exampleCoral } from '@/components/coral/coral-example';
import { CoralGesture } from '@/components/coral/coral-gesture';
import { CoralList } from '@/components/coral/coral-list';
import { CoralPicker } from '@/components/coral/coral-picker';
import { blindSaveIds, bloomFor, quarterStep, songLabel, tickFor, type Bloom } from '@/components/coral/coral-rules';
import { DarkRoom } from '@/components/dark-room';
import { onLikeChange } from '@/components/like-button';
import { lazySkia } from '@/components/print/lazy-skia';
import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Spacing } from '@/constants/theme';
import { songLight } from '@/hooks/use-bottles';
import { changeLinkStart, changeLinkType, linkSongs, unlink, useCoral } from '@/hooks/use-coral';
import { useLightStatusBar } from '@/hooks/use-light-status-bar';
import { usePlayback } from '@/hooks/use-playback';
import { useScreenReader } from '@/hooks/use-screen-reader';
import { useSound } from '@/hooks/use-sound';
import { addLink, budPoint, canLink, emptyCoral, hitBranch, hitNode, layoutGarden, mixFor, pullStart, removeLink, setLinkStart, setLinkType, touchPoint, traceStep, type CoralPull } from '@/lib/coral';
import { createCoralMix } from '@/lib/coral-mix';
import type { CoralSong, CoralTouch, LinkType } from '@/lib/coral-types';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import { soundFor } from '@/lib/sound-index';

const CoralCanvas = lazySkia(() => import('@/components/coral/coral-canvas'));
const NO_BLIND = new Set<number>();

function coralSong(track: DiscoveryTrack): CoralSong {
  return { trackId: track.id, trackName: track.trackName, artistName: track.artistName, previewUrl: track.previewUrl, color: songLight(track.id) };
}

// One hook per song lets the existing cache fill in tempos outside the bundled index.
function SongTempo({ song, onTempo }: { song: CoralSong; onTempo: (id: number, tempo: number | null) => void }) {
  const { record } = useSound({ id: song.trackId, trackName: song.trackName, artistName: song.artistName });
  const tempo = record?.status === 'measured' ? record.features.tempo : null;
  useEffect(() => onTempo(song.trackId, tempo), [song.trackId, tempo, onTempo]);
  return null;
}

function CoralScreenBody() {
  const router = useRouter();
  const params = useLocalSearchParams<{ example?: string; from?: string }>();
  const isExample = params.example === '1';
  const fromId = params.from ? Number(params.from) : undefined;
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReader();
  const saved = useCoral();
  const [example, setExample] = useState(() => isExample ? exampleCoral(songLight) : emptyCoral());
  const state = isExample ? example : saved;
  const [library, setLibrary] = useState<DiscoveryTrack[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(NO_BLIND);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const reloadLibrary = useRef<() => void>(() => {});
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [listOpen, setListOpen] = useState(false);
  const [picker, setPicker] = useState<{ first?: number; notice?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mixing, setMixing] = useState(false);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [tempos, setTempos] = useState<Record<number, number | null>>({});
  const blindIds = isExample ? NO_BLIND : hidden;
  const showList = listOpen || screenReader || fontScale > 1.6;
  const fromOpened = useRef<string | null>(null);

  const { playPreview, peekLoad, setMix, promotePeek, cancelPeek, stopPreview, currentDone, peekLouder, seekCurrent } = usePlayback();
  // Playback's context changes with its clock; these controller methods stay stable.
  const coralMix = useMemo(() => createCoralMix({ playPreview, peekLoad, setMix, promotePeek, cancelPeek, stopPreview, currentDone, peekLouder, seekCurrent }),
    [playPreview, peekLoad, setMix, promotePeek, cancelPeek, stopPreview, currentDone, peekLouder, seekCurrent]);
  const focused = useRef(false);
  const touch = useRef<CoralTouch | null>(null);
  const began = useRef<CoralTouch | null>(null);
  const dragging = useRef(false);
  const leftBranch = useRef(false);
  const lastTick = useRef(0);
  const glowX = useSharedValue(0);
  const glowY = useSharedValue(0);
  const glowOn = useSharedValue(0);
  const blend = useSharedValue(0);
  const sway = useSharedValue(0);
  const growth = useSharedValue(1);
  // Pulling a song: which one, what the pull means so far, and when the sound last moved.
  const pulling = useRef<number | null>(null);
  const pulled = useRef<CoralPull | null>(null);
  const lastScrub = useRef({ at: 0, seconds: -1 });
  const [pullFrom, setPullFrom] = useState<{ x: number; y: number; color: string } | null>(null);
  const [pullSeconds, setPullSeconds] = useState<number | null>(null);
  const pullX = useSharedValue(0);
  const pullY = useSharedValue(0);
  const pullOn = useSharedValue(0);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      dragging.current = false;
      touch.current = null;
      coralMix.stop();
      glowOn.set(0);
      setPlaying(false);
      setMixing(false);
      setActiveNode(null);
    };
  }, [coralMix, glowOn]));

  useFocusEffect(useCallback(() => {
    let live = true;
    let generation = 0;
    async function read() {
      const ticket = ++generation;
      try {
        const [liked, history] = await Promise.all([loadLikedTracks(), loadSwipeHistory()]);
        if (!live || ticket !== generation) return;
        setLibrary(liked);
        setHidden(blindSaveIds(liked, history));
        setLoaded(true);
        setLoadError(false);
      } catch { if (live) setLoadError(true); }
    }
    void read();
    reloadLibrary.current = () => void read();
    const unsubscribe = onLikeChange(() => void read());
    return () => { live = false; unsubscribe(); };
  }, []));

  useEffect(() => {
    if (!params.from || !loaded || fromOpened.current === params.from) return;
    fromOpened.current = params.from;
    const exists = library.some((track) => track.id === fromId);
    setPicker({ first: exists ? fromId : undefined, notice: exists ? undefined : 'That song is no longer in your Library. Choose two saved songs.' });
  }, [params.from, fromId, loaded, library]);

  const songs = useMemo(() => library.map(coralSong), [library]);
  const linkedSongs = useMemo(() => [...new Map(state.links.flatMap((link) => [link.a, link.b]).map((song) => [song.trackId, song])).values()], [state.links]);
  const linksById = useMemo(() => new Map(state.links.map((link) => [link.id, link])), [state.links]);
  const songsById = useMemo(() => new Map(linkedSongs.map((song) => [song.trackId, song])), [linkedSongs]);
  const layout = useMemo(() => layoutGarden(state.links, area.width, area.height), [state.links, area]);
  const onTempo = useCallback((id: number, tempo: number | null) => {
    setTempos((old) => old[id] === tempo ? old : { ...old, [id]: tempo });
  }, []);
  const blooms = useMemo(() => {
    const result: Record<string, Bloom> = {};
    for (const link of state.links) {
      result[link.id] = bloomFor(tempos[link.a.trackId] ?? soundFor(link.a.trackId)?.tempo, tempos[link.b.trackId] ?? soundFor(link.b.trackId)?.tempo);
    }
    return result;
  }, [state.links, tempos]);

  function tick(previous: CoralTouch | null, next: CoralTouch) {
    if (!tickFor(previous, next) || Date.now() - lastTick.current < 80) return;
    lastTick.current = Date.now();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  // Match the picture's floor-anchored sway when testing a finger against still geometry.
  function inGarden(x: number, y: number) {
    const floor = area.height - Math.max(26, area.height * 0.06);
    return { x: x - Math.tan(0.012 * sway.get()) * (y - floor), y: floor + (y - floor) / Math.max(0.01, growth.get()) };
  }

  function hear(next: CoralTouch, x: number, y: number) {
    const link = linksById.get(next.linkId);
    if (!link || !focused.current) return;
    tick(touch.current, next);
    const mix = mixFor(link.type, next.t);
    coralMix.touch({ link, mix });
    touch.current = next;
    glowX.set(x);
    glowY.set(y);
    blend.set(mix);
    glowOn.set(1);
  }

  function release() {
    const last = touch.current;
    if (last) {
      const link = linksById.get(last.linkId);
      if (link) setActiveNode(mixFor(link.type, last.t) > 0.5 ? link.b.trackId : link.a.trackId);
      setPositions((old) => ({ ...old, [last.linkId]: last.t }));
    }
    coralMix.release();
    touch.current = null;
    dragging.current = false;
    setMixing(false);
    glowOn.set(withTiming(0, { duration: reduceMotion ? 0 : 180 }));
  }

  function solo(song: CoralSong) {
    if (!focused.current) return;
    touch.current = null;
    coralMix.solo(song);
    glowOn.set(0);
    setActiveNode(song.trackId);
    setPlaying(true);
    setMixing(false);
  }

  function stop() {
    coralMix.stop();
    touch.current = null;
    glowOn.set(0);
    setActiveNode(null);
    setPlaying(false);
    setMixing(false);
  }

  function openBranch(id: string) {
    release();
    setSelected(id);
  }

  function tapAt(x: number, y: number) {
    const point = inGarden(x, y);
    const id = hitNode(layout, point.x, point.y, 24);
    const song = id === null ? undefined : songsById.get(id);
    if (song) solo(song);
    else {
      const branch = hitBranch(layout, point.x, point.y, 24);
      if (branch) openBranch(branch.linkId);
    }
  }

  // A drag that starts on a song pulls it like a rubber band; the stretch is where it comes in on that branch.
  function movePull(x: number, y: number) {
    const id = pulling.current;
    const song = id === null ? undefined : songsById.get(id);
    if (id === null || !song || !focused.current) return;
    const point = inGarden(x, y);
    const pull = pullStart(layout, id, point.x, point.y);
    if (!pull) return;
    pulled.current = pull;
    pullX.set(x);
    pullY.set(y);
    setPullSeconds(pull.seconds);
    const now = Date.now();
    // Seeking on every frame stutters; a few times a second follows the finger well enough to find a part.
    if (pull.seconds !== lastScrub.current.seconds && now - lastScrub.current.at >= 140) {
      if (Math.floor(pull.seconds / 4) !== Math.floor(lastScrub.current.seconds / 4)) void Haptics.selectionAsync().catch(() => {});
      lastScrub.current = { at: now, seconds: pull.seconds };
      coralMix.scrub(song, pull.seconds);
    }
  }
  function finishPull() {
    const id = pulling.current;
    const pull = pulled.current;
    const song = id === null ? undefined : songsById.get(id);
    pulling.current = null;
    pulled.current = null;
    setPullSeconds(null);
    if (pullFrom) {
      // It snaps back to the coral; the bud left on the branch shows where it now comes in.
      const spring = reduceMotion ? { duration: 0 } : undefined;
      pullX.set(spring ? pullFrom.x : withSpring(pullFrom.x, { damping: 9, stiffness: 180 }));
      pullY.set(spring ? pullFrom.y : withSpring(pullFrom.y, { damping: 9, stiffness: 180 }));
      pullOn.set(withTiming(0, { duration: reduceMotion ? 0 : 320 }));
    }
    if (!pull || !song) return;
    coralMix.scrub(song, pull.seconds);
    if (isExample) setExample((old) => setLinkStart(old, pull.linkId, pull.end, pull.seconds));
    else void changeLinkStart(pull.linkId, pull.end, pull.seconds);
  }

  function beginTrace(x: number, y: number) {
      const point = inGarden(x, y);
      pulling.current = hitNode(layout, point.x, point.y, 22);
      began.current = pulling.current === null ? traceStep(layout, null, point.x, point.y, 26) : null;
      leftBranch.current = false;
      dragging.current = false;
  }
  function startTrace(x: number, y: number) {
      if (pulling.current !== null && focused.current) {
        const node = layout.nodes.find((n) => n.trackId === pulling.current);
        if (!node) return;
        touch.current = null;
        glowOn.set(0);
        lastScrub.current = { at: 0, seconds: -1 };
        setPullFrom({ x: node.x, y: node.y, color: node.color });
        pullX.set(x);
        pullY.set(y);
        pullOn.set(1);
        setActiveNode(node.trackId);
        setPlaying(true);
        setMixing(false);
        movePull(x, y);
        return;
      }
      if (!began.current || !focused.current) return;
      dragging.current = true;
      touch.current = null;
      cancelAnimation(growth);
      growth.set(1);
      setActiveNode(null);
      setPlaying(true);
      setMixing(true);
      hear(began.current, x, y);
  }
  function moveTrace(x: number, y: number) {
      if (pulling.current !== null) return movePull(x, y);
      if (!dragging.current || leftBranch.current || !focused.current) return;
      const point = inGarden(x, y);
      const next = traceStep(layout, touch.current, point.x, point.y, 34);
      if (next) hear(next, x, y);
      else {
        // Leaving the coral needs a lift before another colony can be played.
        leftBranch.current = true;
        release();
      }
  }
  function finishTrace() {
    if (pulling.current !== null) finishPull();
    if (dragging.current) release();
    began.current = null;
  }

  function adjust(link: typeof state.links[number], direction: number) {
    const t = quarterStep(positions[link.id] ?? 0, direction);
    const next = { linkId: link.id, t };
    const point = touchPoint(layout, next);
    hear(next, point.x, point.y);
    setPositions((old) => ({ ...old, [link.id]: t }));
    setActiveNode(null);
    setPlaying(true);
    setMixing(true);
  }

  async function grow(a: CoralSong, b: CoralSong, type: LinkType) {
    if (canLink(state, a, b) !== 'ok') throw new Error('Pair unavailable');
    if (isExample) setExample((old) => addLink(old, a, b, type, Date.now()));
    else await linkSongs(a, b, type);
  }

  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setArea((old) => old.width === width && old.height === height ? old : { width, height });
  }

  const buds = useMemo(() => state.links.flatMap((link) => [
    ...(link.startA > 0 ? [{ ...budPoint(layout, link.id, 'a', link.startA), color: link.a.color }] : []),
    ...(link.startB > 0 ? [{ ...budPoint(layout, link.id, 'b', link.startB), color: link.b.color }] : []),
  ]), [state.links, layout]);

  const chosen = selected ? linksById.get(selected) : undefined;
  const active = activeNode === null ? undefined : songsById.get(activeNode);
  const empty = state.links.length === 0;
  // Until privacy data has loaded, no saved name is put on screen or in its accessibility tree.
  const ready = loaded || isExample;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
      {linkedSongs.map((song) => <SongTempo key={song.trackId} song={song} onTempo={onTempo} />)}
      <View style={styles.header}>
        <CoralButton dark onPress={() => { stop(); if (router.canGoBack()) router.back(); else router.replace('/'); }}>Close</CoralButton>
        <ThemedText style={styles.title} accessibilityRole="header">Coral</ThemedText>
        {!screenReader && fontScale <= 1.6 && <CoralButton dark onPress={() => { release(); setListOpen((old) => !old); }} label={showList ? 'Show coral' : 'Show branches as a list'}>{showList ? 'Coral' : 'List'}</CoralButton>}
      </View>
      {isExample && <ThemedText style={styles.notice}>Example coral. Changes here are not saved.</ThemedText>}
      <View style={styles.area} onLayout={measure}>
        {!showList && area.width > 0 && area.height > 0 && <CoralGesture onBegin={beginTrace} onStart={startTrace} onMove={moveTrace} onFinish={finishTrace} onTap={tapAt}>
          <View style={StyleSheet.absoluteFill} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <CoralCanvas width={area.width} height={area.height} layout={layout} glowX={glowX} glowY={glowY} glowOn={glowOn}
              blend={blend} sway={sway} growth={growth} blooms={blooms} activeNode={activeNode} reduceMotion={reduceMotion}
              pullFrom={pullFrom} pullX={pullX} pullY={pullY} pullOn={pullOn} buds={buds} />
          </View>
        </CoralGesture>}
        {ready && !empty && showList && <CoralList links={state.links} blindIds={blindIds} positions={positions} onAdjust={adjust} onOpen={openBranch} onPlay={solo} />}
        {(!ready || empty) && <View style={styles.empty} pointerEvents="box-none">
          <ThemedText style={styles.emptyText}>{loadError ? 'Could not load your Library.' : !ready ? 'Loading your songs…' : 'Join two saved songs and hear what grows.'}</ThemedText>
          {loadError ? <CoralButton dark onPress={() => reloadLibrary.current()}>Try again</CoralButton> : ready && <CoralButton dark primary onPress={() => setPicker({})}>Grow a branch</CoralButton>}
        </View>}
      </View>
      {ready && <View style={styles.footer}>
        {pullSeconds !== null && <ThemedText style={styles.now}>{pullSeconds === 0 ? 'Pull further to start later in the song' : `Comes in at 0:${String(Math.floor(pullSeconds)).padStart(2, '0')}`}</ThemedText>}
        {pullSeconds === null && active && playing && <ThemedText style={styles.now} accessibilityLiveRegion="polite">{songLabel(active, blindIds.has(active.trackId))}</ThemedText>}
        <View style={styles.actions}>
          {!empty && <CoralButton dark primary onPress={() => { release(); setPicker({}); }}>Grow a branch</CoralButton>}
          {mixing && <CoralButton dark onPress={release}>Keep louder song</CoralButton>}
          {playing && <CoralButton dark onPress={stop}>Stop</CoralButton>}
        </View>
      </View>}
      {picker && ready && <CoralPicker songs={songs} state={state} blindIds={blindIds} initialId={picker.first} notice={picker.notice}
        onGrow={grow} onClose={() => setPicker(null)} />}
      {chosen && ready && <CoralBranchSheet key={chosen.id} link={chosen} blindIds={blindIds} bloom={blooms[chosen.id] ?? 'normal'}
        onType={async (type) => { stop(); if (isExample) setExample((old) => setLinkType(old, chosen.id, type)); else await changeLinkType(chosen.id, type); }}
        onStart={async (end, seconds) => { stop(); if (isExample) setExample((old) => setLinkStart(old, chosen.id, end, seconds)); else await changeLinkStart(chosen.id, end, seconds); }}
        onRemove={async () => { stop(); if (isExample) setExample((old) => removeLink(old, chosen.id)); else await unlink(chosen.id); }}
        onPlay={solo} onClose={() => setSelected(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#062436' },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 36, color: DarkColors.text, flexShrink: 1 },
  notice: { color: '#c1d2d5', fontSize: 14, textAlign: 'center', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  area: { flex: 1, overflow: 'hidden' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.lg },
  emptyText: { color: DarkColors.text, fontSize: 21, lineHeight: 28, textAlign: 'center' },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  now: { fontSize: 15, color: DarkColors.text, textAlign: 'center' },
});

export default function CoralScreen() {
  useLightStatusBar();
  return <DarkRoom><CoralScreenBody /></DarkRoom>;
}
