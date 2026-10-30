import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DarkRoom } from '@/components/dark-room';
import { SeaGlobe, type SeaGlobeHandle } from '@/components/sea/sea-globe';
import { SeaSheet } from '@/components/sea/sea-sheet';
import { ThemedText } from '@/components/themed-text';
import { DarkColors, DarkUi, Fonts, Spacing } from '@/constants/theme';
import { songLight } from '@/hooks/use-bottles';
import { useLightStatusBar } from '@/hooks/use-light-status-bar';
import { usePlayback } from '@/hooks/use-playback';
import { journeySummary } from '@/lib/bottle-journey';
import { placeFromTimeZone } from '@/lib/bottle-place';
import type { Bottle } from '@/lib/bottle-rows';
import { loadBottlesOn, myBottles } from '@/lib/bottles-api';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks } from '@/lib/discovery-storage';
import { catalogTrackById } from '@/lib/pool';
import { facing, loadSeaDots, seaArcs, seaCountLine, type Spin } from '@/lib/sea-globe';

type Load =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'offline' }
  | { kind: 'ready'; bottles: Bottle[]; tracks: Map<number, DiscoveryTrack> };

function homeSpin(): Spin {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {}
  const p = placeFromTimeZone(tz);
  return facing(p.lat, p.lng);
}

const lastStop = (b: Bottle) => b.hops[b.hops.length - 1];

/** The Sea: every bottle you launched or kept, as arcs of light over a turning globe. Tap one for its song and stops. */
function SeaScreenBody() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bottle?: string }>();
  const { player, status } = usePlayback();
  const globeRef = useRef<SeaGlobeHandle>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [selected, setSelected] = useState(-1);
  const [listOpen, setListOpen] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if ((await loadBottlesOn()) !== true) return live && setLoad({ kind: 'off' });
      const [mine, liked] = await Promise.all([myBottles(null), loadLikedTracks()]);
      if (!live) return;
      if (!mine) return setLoad({ kind: 'offline' });
      setLoad({ kind: 'ready', bottles: mine, tracks: new Map(liked.map((t) => [t.id, t])) });
      // Opened from a bottle's journey: that one is picked.
      if (params.bottle) setSelected(seaArcs(mine).findIndex((a) => a.bottleId === params.bottle));
    })();
    return () => {
      live = false;
    };
    // Loads once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the Sea stops its song.
  useFocusEffect(
    useCallback(
      () => () => {
        player.pause();
        setPlayingId(null);
      },
      [player]
    )
  );

  const bottles = useMemo(() => (load.kind === 'ready' ? load.bottles : []), [load]);
  const arcs = useMemo(() => seaArcs(bottles), [bottles]);
  const byId = useMemo(() => new Map(bottles.map((b) => [b.id, b])), [bottles]);
  const colors = useMemo(() => arcs.map((a) => songLight(a.trackId)), [arcs]);
  const dots = useMemo(() => loadSeaDots(), []);
  // It opens on the bottle you came from, else where your newest bottle is now, else your part of the world.
  const startAt = params.bottle ? arcs.findIndex((a) => a.bottleId === params.bottle) : -1;
  const start = useMemo(() => {
    const b = byId.get(arcs[startAt >= 0 ? startAt : 0]?.bottleId ?? '');
    const stop = b && lastStop(b);
    return stop ? facing(stop.lat, stop.lng) : homeSpin();
  }, [arcs, byId, startAt]);
  const trackOf = (trackId: number) => (load.kind === 'ready' ? load.tracks.get(trackId) : undefined) ?? catalogTrackById(trackId);

  function pick(index: number | null) {
    if (index === null) {
      if (selected >= 0) close();
      return;
    }
    Haptics.selectionAsync();
    setSelected(index);
    const b = byId.get(arcs[index].bottleId);
    const stop = b && lastStop(b);
    if (stop) globeRef.current?.face(facing(stop.lat, stop.lng));
  }

  function close() {
    setSelected(-1);
    if (playingId !== null) player.pause();
    setPlayingId(null);
  }

  function togglePlay(track: DiscoveryTrack) {
    if (playingId === track.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlayingId(track.id);
  }

  function onArea(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setArea((a) => (a && a.width === width && a.height === height ? a : { width, height }));
  }

  const chosen = selected >= 0 ? byId.get(arcs[selected]?.bottleId ?? '') : undefined;
  const chosenTrack = chosen ? trackOf(chosen.trackId) : null;
  const note =
    load.kind === 'off'
      ? 'Bottles is off. Turn it on in Tune → More on Home, and your blind saves float from here.'
      : load.kind === 'offline'
        ? "Couldn't reach the sea. Check your connection and open it again."
        : load.kind === 'ready' && arcs.length === 0
          ? 'Nothing at sea yet. Save a song you found blind and it floats from here.'
          : load.kind === 'ready'
            ? 'Drag to turn it. Tap a line of light for its song.'
            : '';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={DarkUi.textButton}>
          <Ionicons name="close" size={26} color={DarkColors.textSecondary} />
        </Pressable>
        <ThemedText style={styles.mono}>THE SEA</ThemedText>
        {arcs.length > 0 ? (
          <Pressable
            onPress={() => setListOpen((v) => !v)}
            hitSlop={10}
            style={DarkUi.textButton}
            accessibilityRole="button"
            accessibilityLabel={listOpen ? 'Show the globe' : 'Show your bottles as a list'}>
            <ThemedText style={[styles.mono, styles.toggle]}>{listOpen ? 'GLOBE' : 'LIST'}</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      {load.kind === 'ready' && <ThemedText style={styles.count}>{seaCountLine(bottles)}</ThemedText>}

      <View style={styles.area} onLayout={onArea}>
        {listOpen ? (
          <ScrollView contentContainerStyle={styles.list}>
            {arcs.map((a, i) => {
              const b = byId.get(a.bottleId);
              const t = trackOf(a.trackId);
              if (!b) return null;
              return (
                <Pressable
                  key={a.bottleId}
                  onPress={() => {
                    setListOpen(false);
                    pick(i);
                  }}
                  style={styles.row}
                  accessibilityRole="button">
                  <View style={[styles.rowLight, { backgroundColor: colors[i] }]} />
                  <View style={styles.rowWords}>
                    <ThemedText style={styles.rowTitle} numberOfLines={1}>
                      {t ? `${t.trackName} · ${t.artistName}` : 'A song you floated'}
                    </ThemedText>
                    <ThemedText style={styles.rowSummary}>{journeySummary(b)}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : area && load.kind !== 'loading' ? (
          // Mounted once the bottles are in, so it starts facing the right place.
          <SeaGlobe
            ref={globeRef}
            width={area.width}
            height={area.height}
            dots={dots}
            arcs={arcs}
            colors={colors}
            selected={selected}
            start={start}
            onPick={pick}
          />
        ) : null}
      </View>

      {!!note && !chosen && <ThemedText style={styles.hint}>{note}</ThemedText>}

      {chosen && (
        <SeaSheet
          bottle={chosen}
          track={chosenTrack}
          color={colors[selected]}
          playing={!!chosenTrack && playingId === chosenTrack.id && status.playing}
          bottom={insets.bottom}
          onPlay={() => chosenTrack && togglePlay(chosenTrack)}
          onClose={close}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DarkColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  spacer: { width: 44 },
  mono: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, color: DarkColors.text },
  toggle: { textDecorationLine: 'underline' },
  count: { textAlign: 'center', fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1, color: DarkColors.textSecondary, paddingTop: Spacing.xs },
  area: { flex: 1, justifyContent: 'center' },
  hint: { textAlign: 'center', fontSize: 13, color: DarkColors.textSecondary, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  list: { padding: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  rowLight: { width: 10, height: 10, borderRadius: 5 },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: DarkColors.text },
  rowSummary: { fontSize: 13, color: DarkColors.textSecondary },
});

/** A dark room in the light app: navy defaults for everything inside, and a light status bar. */
export default function SeaScreen() {
  useLightStatusBar();
  return (
    <DarkRoom>
      <SeaScreenBody />
    </DarkRoom>
  );
}
