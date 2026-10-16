import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { lazySkia } from '@/components/print/lazy-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import type { Light } from '@/lib/dark-map';
import type { MapPoint, MapRegion } from '@/lib/sound-map';

import type { DarkMapCanvasProps } from './dark-map-canvas';
import { clampPan, labelCenter, labelCovered, labelTextWidth, MAP_GROUND, MAP_PAD, onScreen, toCanvas, toMap, toScreen } from './map-geometry';

const Canvas = lazySkia<DarkMapCanvasProps>(() => import('./dark-map-canvas'));
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const SPRING = { damping: 18, stiffness: 180 };
const LABEL_W = 220; // a box wider than any label's words; the text is centered in it

type Props = {
  width: number;
  height: number;
  dots: MapPoint[];
  lights: Light[];
  regions: (MapRegion & { lit: boolean })[];
  /** The tapped spot, ringed. */
  lens: MapPoint | null;
  /** In map widths. */
  lensRadius: number;
  onTap: (p: MapPoint) => void;
  /** New lights have bloomed in: time to remember this look. */
  onBloomDone: () => void;
  label: string;
  /** False for a still (You → Discoveries): no zoom, no taps. */
  interactive?: boolean;
};

/** The Dark Map with pinch zoom (1×–4×), pan, double-tap zoom and tap-to-look. The same gestures as the Tasteform. */
export function DarkMap({ width, height, dots, lights, regions, lens, lensRadius, onTap, onBloomDone, label, interactive = true }: Props) {
  const zoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const start = useSharedValue({ z: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const bloom = useSharedValue(lights.some((l) => l.fresh) ? 0 : 1);

  // New lights bloom in once, when the map opens.
  useEffect(() => {
    if (bloom.get() >= 1) return;
    bloom.set(
      withTiming(1, { duration: 600 }, (done) => {
        if (done) runOnJS(onBloomDone)();
      })
    );
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinch = Gesture.Pinch()
    .enabled(interactive)
    .onStart((e) => {
      start.set({ z: zoom.get(), x: panX.get(), y: panY.get(), fx: e.focalX, fy: e.focalY });
    })
    .onUpdate((e) => {
      const s = start.get();
      const z = Math.min(MAX_ZOOM, Math.max(1, s.z * e.scale));
      // Keep the point that started under your fingers under them.
      const cx = (s.fx - width / 2 - s.x) / s.z;
      const cy = (s.fy - height / 2 - s.y) / s.z;
      zoom.set(z);
      panX.set(clampPan(e.focalX - width / 2 - cx * z, z, width));
      panY.set(clampPan(e.focalY - height / 2 - cy * z, z, height));
    })
    .onEnd(() => {
      if (zoom.get() < 1.08) {
        zoom.set(withSpring(1, SPRING));
        panX.set(withSpring(0, SPRING));
        panY.set(withSpring(0, SPRING));
      }
    });

  const pan = Gesture.Pan()
    .enabled(interactive)
    .manualActivation(true)
    .onTouchesMove((_e, manager) => {
      if (zoom.get() > 1.02) manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      start.set({ ...start.get(), x: panX.get(), y: panY.get() });
    })
    .onUpdate((e) => {
      panX.set(clampPan(start.get().x + e.translationX, zoom.get(), width));
      panY.set(clampPan(start.get().y + e.translationY, zoom.get(), height));
    });

  const doubleTap = Gesture.Tap()
    .enabled(interactive)
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e, ok) => {
      if (!ok) return;
      if (zoom.get() > 1.08) {
        zoom.set(withSpring(1, SPRING));
        panX.set(withSpring(0, SPRING));
        panY.set(withSpring(0, SPRING));
      } else {
        const z = DOUBLE_TAP_ZOOM;
        zoom.set(withSpring(z, SPRING));
        panX.set(withSpring(clampPan((e.x - width / 2) * (1 - z), z, width), SPRING));
        panY.set(withSpring(clampPan((e.y - height / 2) * (1 - z), z, height), SPRING));
      }
    });

  const tap = Gesture.Tap()
    .enabled(interactive)
    .maxDuration(300)
    .maxDistance(12)
    .onEnd((e, ok) => {
      if (!ok) return;
      const p = toMap(e.x, e.y, width, height, zoom.get(), panX.get(), panY.get());
      if (p) runOnJS(onTap)(p);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, tap));

  // Labels, most important first: regions you've heard, then bigger ones. A less important label hides while it
  // would overlap, and comes back as zooming pulls them apart.
  const labels = useMemo(() => {
    const order = regions.map((_, i) => i).sort((a, b) => Number(regions[b].lit) - Number(regions[a].lit) || regions[b].songs - regions[a].songs || a - b);
    return order.map((i) => ({ words: regions[i].words, lit: regions[i].lit, anchor: { ...toCanvas(regions[i], width, height), w: labelTextWidth(regions[i].words) } }));
  }, [regions, width, height]);
  const anchors = labels.map((l) => l.anchor);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.map, { width, height }]} accessible accessibilityLabel={label}>
        <Canvas width={width} height={height} dots={dots} lights={lights} zoom={zoom} panX={panX} panY={panY} bloom={bloom} />
        {labels.map((l, rank) => (
          <MapLabel key={l.words} words={l.words} lit={l.lit} rank={rank} anchors={anchors} width={width} height={height} zoom={zoom} panX={panX} panY={panY} />
        ))}
        {lens && <MapLens point={lens} radius={lensRadius} width={width} height={height} zoom={zoom} panX={panX} panY={panY} />}
      </View>
    </GestureDetector>
  );
}

type Motion = { width: number; height: number; zoom: SharedValue<number>; panX: SharedValue<number>; panY: SharedValue<number> };

/**
 * A region's words, at its center, the same size at any zoom. Cream where you've heard some of it. Hidden while its
 * region is off screen or it would overlap a more important label (`anchors` are every label's canvas spot and text
 * width, most important first; this one is `rank`).
 */
function MapLabel({ words, lit, rank, anchors, width, height, zoom, panX, panY }: Motion & { words: string; lit: boolean; rank: number; anchors: { x: number; y: number; w: number }[] }) {
  const style = useAnimatedStyle(() => {
    const z = zoom.get();
    const px = panX.get();
    const py = panY.get();
    // Overlap is judged where the text actually sits: near an edge it's moved in to stay on the map.
    const screens = anchors.map((a) => {
      const s = toScreen(a, width, height, z, px, py);
      return { x: labelCenter(s.x, a.w, width), y: s.y, w: a.w, region: s };
    });
    const me = screens[rank];
    const shown = onScreen(me.region.x, me.region.y, width, height) && !labelCovered(rank, screens);
    return { opacity: shown ? 1 : 0, transform: [{ translateX: me.x - LABEL_W / 2 }, { translateY: me.y - 7 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.label, style]}>
      <ThemedText style={[styles.labelText, { color: lit ? Colors.text : Colors.textTertiary }]} numberOfLines={1}>
        {words.toUpperCase()}
      </ThemedText>
    </Animated.View>
  );
}

/** The dashed ring around a tapped spot. */
function MapLens({ point, radius, width, height, zoom, panX, panY }: Motion & { point: MapPoint; radius: number }) {
  const at = toCanvas(point, width, height);
  const r = radius * (width - 2 * MAP_PAD);
  const style = useAnimatedStyle(() => {
    const s = toScreen(at, width, height, zoom.get(), panX.get(), panY.get());
    const rr = r * zoom.get();
    return { width: 2 * rr, height: 2 * rr, borderRadius: rr, transform: [{ translateX: s.x - rr }, { translateY: s.y - rr }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.lens, style]} />;
}

const styles = StyleSheet.create({
  map: { backgroundColor: MAP_GROUND, overflow: 'hidden' },
  label: { position: 'absolute', left: 0, top: 0, width: LABEL_W, alignItems: 'center' },
  labelText: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.8,
    textShadowColor: MAP_GROUND,
    textShadowRadius: 3,
  },
  lens: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: Colors.text,
    backgroundColor: 'rgba(243, 234, 216, 0.06)',
  },
});
