import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DarkMap } from '@/components/map/dark-map';
import { MAP_DIM, MAP_GROUND } from '@/components/map/map-geometry';
import { RegionList } from '@/components/map/region-list';
import { SpotSheet } from '@/components/map/spot-sheet';
import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Spacing, DarkUi } from '@/constants/theme';
import { LENS, type MapView } from '@/lib/dark-map';
import { loadMapView } from '@/lib/dark-map-app';
import { saveMapSeen } from '@/lib/discovery-storage';
import { loadSoundMap, regionAt, songsWithin, type MapPoint } from '@/lib/sound-map';
import { requestSteer } from '@/lib/steer-request';
import { DarkRoom } from '@/components/dark-room';
import { useLightStatusBar } from '@/hooks/use-light-status-bar';

type Spot = { point: MapPoint; words: string; songs: number; heard: number };

/** The Dark Map: every measured song placed by how it sounds. What you've heard glows; the dark is your blind spot. */
function MapScreenBody() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const map = loadSoundMap();
  const [view, setView] = useState<MapView | null>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    loadMapView().then(setView);
  }, []);

  const lit = useMemo(() => new Set(view?.litIds ?? []), [view]);
  // A region's words are cream once you've heard a little of it (6%), dim before.
  const labels = useMemo(
    () => (map && view ? map.regions.map((r, i) => ({ ...r, lit: (view.regions.find((s) => s.region === i)?.heard ?? 0) > 0.06 * r.songs })) : []),
    [map, view]
  );
  const pct = view ? Math.round(view.litShare * 100) : 0;

  function look(point: MapPoint) {
    if (!map) return;
    Haptics.selectionAsync();
    const near = songsWithin(map, point, LENS);
    setSpot({ point, words: map.regions[regionAt(map, point, LENS)].words, songs: near.length, heard: near.filter((id) => lit.has(id)).length });
  }

  function lookAtRegion(region: number) {
    if (!map) return;
    setListOpen(false);
    look({ x: map.regions[region].x, y: map.regions[region].y });
  }

  // Home takes the request when it's focused again, the same way the Liked list steers it.
  function go() {
    if (!spot || spot.songs === 0) return;
    requestSteer({ kind: 'map', point: spot.point, words: spot.words });
    router.back();
    router.navigate('/');
  }

  function onArea(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setArea((a) => (a && a.width === width && a.height === height ? a : { width, height }));
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={DarkUi.textButton}>
          <Ionicons name="close" size={26} color={DarkColors.textSecondary} />
        </Pressable>
        <ThemedText style={styles.mono}>DARK MAP</ThemedText>
        <View style={styles.headerRight}>
          <ThemedText style={styles.mono} accessibilityLabel={`${pct} percent lit`}>
            {pct}% LIT
          </ThemedText>
          <Pressable
            onPress={() => setListOpen((v) => !v)}
            hitSlop={10}
            style={DarkUi.textButton}
            accessibilityRole="button"
            accessibilityLabel={listOpen ? 'Show the map' : 'Show the regions as a list'}>
            <ThemedText style={[styles.mono, styles.toggle]}>{listOpen ? 'MAP' : 'LIST'}</ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.area} onLayout={onArea}>
        {!map ? (
          <ThemedText style={styles.dim}>The map isn&apos;t built yet.</ThemedText>
        ) : listOpen && view ? (
          <RegionList regions={view.regions} onPick={lookAtRegion} />
        ) : area && view ? (
          <DarkMap
            width={area.width}
            height={area.height}
            dots={view.dots}
            lights={view.lights}
            regions={labels}
            lens={spot?.point ?? null}
            lensRadius={LENS}
            onTap={look}
            onBloomDone={() => saveMapSeen(view.litIds)}
            label={`Dark map, ${pct} percent lit. Use List to explore the regions.`}
          />
        ) : null}
      </View>

      <View style={styles.legend}>
        <ThemedText style={styles.key}>
          <ThemedText style={[styles.key, { color: DarkColors.text }]}>● </ThemedText>HEARD
        </ThemedText>
        <ThemedText style={styles.key}>
          <ThemedText style={[styles.key, { color: DarkColors.signal }]}>● </ThemedText>SAVED
        </ThemedText>
        <ThemedText style={styles.key}>
          <ThemedText style={[styles.key, { color: MAP_DIM }]}>● </ThemedText>NOT YET
        </ThemedText>
      </View>
      <ThemedText style={styles.hint}>Tap anywhere dark to go there.</ThemedText>
      {!!view && view.unmapped > 0 && (
        <ThemedText style={styles.hint}>
          {view.unmapped === 1 ? "1 song you heard isn't on the map yet." : `${view.unmapped} songs you heard aren't on the map yet.`}
        </ThemedText>
      )}

      {spot && <SpotSheet words={spot.words} songs={spot.songs} heard={spot.heard} bottom={insets.bottom} onGo={go} onClose={() => setSpot(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DarkColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  mono: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, color: DarkColors.text },
  toggle: { textDecorationLine: 'underline' },
  area: { flex: 1, backgroundColor: MAP_GROUND, justifyContent: 'center' },
  dim: { textAlign: 'center', color: DarkColors.textSecondary },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, paddingTop: Spacing.md },
  key: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: DarkColors.textSecondary },
  hint: { textAlign: 'center', fontSize: 13, color: DarkColors.textSecondary, paddingTop: Spacing.xs },
});

/** A dark room in the light app: navy defaults for everything inside, and a light status bar. */
export default function MapScreen() {
  useLightStatusBar();
  return (
    <DarkRoom>
      <MapScreenBody />
    </DarkRoom>
  );
}
