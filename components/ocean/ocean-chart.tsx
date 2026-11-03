import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lazySkia } from '@/components/print/lazy-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { chartDots, chartLine, hitDot, placeAtChart, type PathPoint } from '@/lib/ocean-chart';
import { DEPTHS, DEPTH_INFO, WATERS, WATER_INFO, type Place } from '@/lib/ocean-map';
import type { Creature, OceanLife } from '@/lib/ocean-person';

const OceanChartCanvas = lazySkia(() => import('./ocean-chart-canvas'));

/**
 * The whole ocean as one graph: across is sound, down is how few people know it. Every fish with its trail, your path
 * through the water, and a tap on any fish or place to go there.
 */
export function OceanChart({
  life,
  path,
  hour,
  onPickCreature,
  onPickPlace,
  onClose,
}: {
  life: OceanLife | null;
  path: PathPoint[];
  hour: number;
  onPickCreature: (c: Creature) => void;
  onPickPlace: (p: Place) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const plotW = Math.min(width, 520) - Spacing.lg * 2;
  const plotH = area?.height ?? 0;
  const dots = useMemo(() => (plotH > 0 ? chartDots(life, plotW, plotH) : []), [life, plotW, plotH]);

  const tapAt = (x: number, y: number) => {
    const hit = hitDot(dots, x, y);
    if (hit) onPickCreature(hit.creature);
    else onPickPlace(placeAtChart(x, y, plotW, plotH));
  };
  // Side by side: waiting on a pinch that never comes would swallow every tap.
  const gesture = Gesture.Simultaneous(
    // Pinching back out of the graph, the way you pinched into it.
    Gesture.Pinch().onEnd((e) => {
      if (e.scale > 1.2) runOnJS(onClose)();
    }),
    Gesture.Tap()
      .maxDistance(12)
      .onEnd((e, ok) => {
        if (ok) runOnJS(tapAt)(e.x, e.y);
      })
  );

  return (
    <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top + Spacing.sm, paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Your whole ocean</ThemedText>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to the water" style={styles.close}>
          <Ionicons name="close" size={20} color={Colors.text} />
        </Pressable>
      </View>
      <ThemedText style={styles.axis}>Across is how it sounds. Down, fewer people know it.</ThemedText>
      <View style={[styles.columns, { width: plotW }]}>
        {WATERS.map((w) => (
          <ThemedText key={w} style={styles.column} numberOfLines={1}>
            {WATER_INFO[w].name}
          </ThemedText>
        ))}
      </View>
      <View style={[styles.plotArea, { width: plotW }]} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        {plotH > 0 && (
          <GestureDetector gesture={gesture}>
            <View style={[styles.plot, { width: plotW, height: plotH }]} accessibilityLabel="A graph of your ocean. Your songs are also listed by place under the water.">
              <OceanChartCanvas width={plotW} height={plotH} hour={hour} dots={dots} path={path} />
              {DEPTHS.map((d, i) => (
                <ThemedText key={d} style={[styles.row, { top: (plotH / DEPTHS.length) * i + 5 }]} pointerEvents="none">
                  {DEPTH_INFO[d].name}
                </ThemedText>
              ))}
            </View>
          </GestureDetector>
        )}
      </View>
      <ThemedText style={styles.line}>{chartLine(dots)}</ThemedText>
      <ThemedText style={styles.legend}>{path.length > 1 ? 'The white line is where you’ve listened, ending at now. Dots rise when more people find them.' : 'A line appears here as you listen, showing where you’ve been.'}</ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#ffffff', alignItems: 'center', gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: Spacing.lg },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.text },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  axis: { alignSelf: 'stretch', paddingHorizontal: Spacing.lg, fontSize: 14, lineHeight: 19, color: Colors.textSecondary },
  columns: { flexDirection: 'row', marginTop: Spacing.sm },
  column: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  plotArea: { flex: 1 },
  plot: { borderRadius: 18, overflow: 'hidden' },
  row: { position: 'absolute', left: 7, fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#ffffff', textShadowColor: 'rgba(0,25,40,0.7)', textShadowRadius: 4 },
  line: { alignSelf: 'stretch', paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.text },
  legend: { alignSelf: 'stretch', paddingHorizontal: Spacing.lg, fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
});
