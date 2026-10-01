import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { NO_COLOR, TasteformBody } from './tasteform-body';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { useCoverColors } from '@/hooks/use-cover-colors';
import { useSongFeel } from '@/hooks/use-song-feel';
import { artworkUrl, type DiscoveryTrack, type SwipeEntry } from '@/lib/discovery';
import { bodyBreath, cellBreath, describeBreath, formLayout, formSongs, MODES, type Cell, type Mode } from '@/lib/tasteform';

/** Covers are drawn at this size and scaled, so moving between modes is a transform, not a relayout. */
const BASE = 48;
const MAX_ZOOM = 4;
const SPRING = { damping: 17, stiffness: 140 };

type Props = {
  liked: DiscoveryTrack[];
  history: SwipeEntry[];
  width: number;
  /** The song picked last (ringed), and whether it's playing right now (pulsing). The screen owns playback. */
  selectedId: number | null;
  playing: boolean;
  onPick: (track: DiscoveryTrack) => void;
  /** True while zoomed in, so the page can stop scrolling and let one finger move around the shape. */
  onZoomChange?: (zoomed: boolean) => void;
};

/**
 * Your saves as one living shape (see lib/tasteform.ts). Re-form it by genre,
 * listeners, color or month to see every cover; tap any cover to hear it.
 * Shape mode breathes, and pinches or double-taps in to the covers.
 */
export function Tasteform({ liked, history, width, selectedId, playing, onPick, onZoomChange }: Props) {
  const [mode, setMode] = useState<Mode>('shape');
  const colors = useCoverColors(liked.map((t) => t.artworkUrl100));
  const feels = useSongFeel(liked);
  const songs = useMemo(() => formSongs(liked, history, colors, feels), [liked, history, colors, feels]);
  const energyOf = useMemo(() => new Map(songs.map((s) => [s.id, s.energy])), [songs]);
  // Breathing only runs while you can see it.
  const focused = useIsFocused();
  const form = useMemo(() => formLayout(songs, mode, width), [songs, mode, width]);
  const byId = useMemo(() => new Map(liked.map((t) => [t.id, t])), [liked]);
  const blindIds = useMemo(() => new Set(songs.filter((s) => s.blind).map((s) => s.id)), [songs]);
  const cellColors = useMemo(
    () => form.cells.map((c) => colors[byId.get(c.id)?.artworkUrl100 ?? '']?.main ?? NO_COLOR),
    [form, colors, byId]
  );
  const H = form.height;

  // ---- Zoom (shape only): pinch, double-tap, one finger to look around ----
  const zoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const start = useSharedValue({ z: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const [zoomed, setZoomedState] = useState(false);
  const setZoomed = useCallback(
    (z: boolean) => {
      setZoomedState(z);
      onZoomChange?.(z);
    },
    [onZoomChange]
  );
  const zoomable = mode === 'shape';

  function resetZoom() {
    zoom.value = withSpring(1, SPRING);
    panX.value = withSpring(0, SPRING);
    panY.value = withSpring(0, SPRING);
    if (zoomed) setZoomed(false);
  }
  function chooseMode(next: Mode) {
    if (next === mode) return;
    Haptics.selectionAsync();
    resetZoom();
    setMode(next);
  }

  function tapAt(x: number, y: number, z: number, px: number, py: number) {
    const cx = (x - width / 2 - px) / z + width / 2;
    const cy = (y - H / 2 - py) / z + H / 2;
    let best: Cell | null = null;
    let bestGap = Infinity;
    for (const c of form.cells) {
      const gap = Math.hypot(c.x - cx, c.y - cy) - c.d / 2;
      if (gap < bestGap) [best, bestGap] = [c, gap];
    }
    // Forgiving on the tiny dots: anything within a fingertip counts.
    if (best && bestGap <= Math.max(6, 18 / z)) {
      const track = byId.get(best.id);
      if (track) {
        Haptics.selectionAsync();
        onPick(track);
      }
    }
  }

  const clampPan = (v: number, z: number, size: number) => {
    'worklet';
    const m = (size * (z - 1)) / 2;
    return Math.min(m, Math.max(-m, v));
  };

  const pinch = Gesture.Pinch()
    .enabled(zoomable)
    .onStart((e) => {
      start.value = {
        z: zoom.value,
        x: panX.value,
        y: panY.value,
        fx: e.focalX,
        fy: e.focalY,
      };
      runOnJS(setZoomed)(true);
    })
    .onUpdate((e) => {
      const s = start.value;
      const z = Math.min(MAX_ZOOM, Math.max(1, s.z * e.scale));
      // Keep the point that started under your fingers under them.
      const cx = (s.fx - width / 2 - s.x) / s.z;
      const cy = (s.fy - H / 2 - s.y) / s.z;
      zoom.value = z;
      panX.value = clampPan(e.focalX - width / 2 - cx * z, z, width);
      panY.value = clampPan(e.focalY - H / 2 - cy * z, z, H);
    })
    .onEnd(() => {
      if (zoom.value < 1.08) {
        zoom.value = withSpring(1, SPRING);
        panX.value = withSpring(0, SPRING);
        panY.value = withSpring(0, SPRING);
        runOnJS(setZoomed)(false);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomable)
    .manualActivation(true)
    .onTouchesMove((_e, manager) => {
      if (zoom.value > 1.02) manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      start.value = { ...start.value, x: panX.value, y: panY.value };
    })
    .onUpdate((e) => {
      panX.value = clampPan(start.value.x + e.translationX, zoom.value, width);
      panY.value = clampPan(start.value.y + e.translationY, zoom.value, H);
    });

  const doubleTap = Gesture.Tap()
    .enabled(zoomable)
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e, ok) => {
      if (!ok) return;
      if (zoom.value > 1.08) {
        zoom.value = withSpring(1, SPRING);
        panX.value = withSpring(0, SPRING);
        panY.value = withSpring(0, SPRING);
        runOnJS(setZoomed)(false);
      } else {
        const z = 2.8;
        zoom.value = withSpring(z, SPRING);
        panX.value = withSpring(clampPan((e.x - width / 2) * (1 - z), z, width), SPRING);
        panY.value = withSpring(clampPan((e.y - H / 2) * (1 - z), z, H), SPRING);
        runOnJS(setZoomed)(true);
      }
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(12)
    .onEnd((e, ok) => {
      if (ok) runOnJS(tapAt)(e.x, e.y, zoom.value, panX.value, panY.value);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, zoomable ? Gesture.Exclusive(doubleTap, tap) : tap);

  // ---- Motion ----
  const height = useSharedValue(H);
  useEffect(() => {
    height.value = withTiming(H, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
    });
  }, [H, height]);
  // The body breathes at the average energy of your saves (see bodyBreath).
  const { halfMs, depth } = bodyBreath(songs);
  const breath = useSharedValue(1);
  useEffect(() => {
    breath.value =
      zoomable && focused
        ? withRepeat(withTiming(depth, { duration: halfMs, easing: Easing.inOut(Easing.sin) }), -1, true)
        : withTiming(1);
  }, [zoomable, focused, halfMs, depth, breath]);

  const frameStyle = useAnimatedStyle(() => ({ height: height.value }));
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }],
  }));
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  // A new body fades in over the old one whenever the cells move somewhere new.
  const bodyKey = `${mode}-${form.cells.length}-${Math.round(H)}`;
  const anyBlind = blindIds.size > 0;
  const pace = zoomable ? describeBreath(songs) : null;
  const caption = MODES.find((m) => m.id === mode)!.caption + (zoomable ? ' Pinch or double-tap to see the covers.' : '');

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <Pressable
              key={m.id}
              onPress={() => chooseMode(m.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <ThemedText style={[Ui.label, styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.frame, { width }, frameStyle]}>
          <Animated.View style={[{ width, height: H }, zoomStyle]}>
            <Animated.View
              key={bodyKey}
              entering={FadeIn.duration(450)}
              exiting={FadeOut.duration(250)}
              style={StyleSheet.absoluteFill}>
              <Animated.View style={[StyleSheet.absoluteFill, breathStyle]}>
                <TasteformBody form={form} colors={cellColors} id={bodyKey} />
              </Animated.View>
            </Animated.View>
            {form.labels.map((l) => (
              <Animated.View
                key={`${mode}-${l.text}`}
                entering={FadeIn.delay(200)}
                style={[styles.label, { left: l.x - 120, top: l.y }]}
                pointerEvents="none">
                <ThemedText style={styles.labelText} numberOfLines={1}>
                  {l.text}
                </ThemedText>
              </Animated.View>
            ))}
            {form.cells.map((c, i) => {
              const b = zoomable && focused ? cellBreath(energyOf.get(c.id)) : null;
              return (
                <FormCover
                  key={c.id}
                  cell={c}
                  index={i}
                  cx={width / 2}
                  cy={H / 2}
                  artwork={byId.get(c.id)?.artworkUrl100 ?? ''}
                  blind={blindIds.has(c.id)}
                  playing={playing && selectedId === c.id}
                  selected={selectedId === c.id}
                  breathMs={b?.halfMs ?? 0}
                  breathDepth={b?.depth ?? 1}
                />
              );
            })}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <ThemedText type="caption">{caption}</ThemedText>
      {(anyBlind || pace) && (
        <ThemedText type="caption" style={styles.legend}>
          {[pace, anyBlind && 'A cream ring means you saved it blind.'].filter(Boolean).join(' ')}
        </ThemedText>
      )}
    </View>
  );
}

type CoverProps = {
  cell: Cell;
  index: number;
  cx: number;
  cy: number;
  artwork: string;
  blind: boolean;
  playing: boolean;
  selected: boolean;
  /** Shape mode: the cover pulses at its own song's energy (half a breath in ms, and how far it swells). 0 = still. */
  breathMs: number;
  breathDepth: number;
};

/** One song's cover. Springs to its place in the current mode, starting from the middle on first show. */
const FormCover = memo(function FormCover({
  cell,
  index,
  cx,
  cy,
  artwork,
  blind,
  playing,
  selected,
  breathMs,
  breathDepth,
}: CoverProps) {
  const x = useSharedValue(cx);
  const y = useSharedValue(cy);
  const s = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    const delay = Math.min(index * 6, 320);
    x.value = withDelay(delay, withSpring(cell.x, SPRING));
    y.value = withDelay(delay, withSpring(cell.y, SPRING));
    s.value = withDelay(delay, withSpring(cell.d / BASE, SPRING));
  }, [cell.x, cell.y, cell.d, index, x, y, s]);

  useEffect(() => {
    const sine = { easing: Easing.inOut(Easing.sin) };
    if (playing) pulse.value = withRepeat(withTiming(1.12, { duration: 520, ...sine }), -1, true);
    else if (breathMs) {
      // Out of step with its neighbors, so the shape shimmers instead of marching.
      const phase = (cell.id % 997) / 997;
      pulse.value = withDelay(phase * breathMs, withRepeat(withTiming(breathDepth, { duration: breathMs, ...sine }), -1, true));
    } else pulse.value = withSpring(1);
  }, [playing, breathMs, breathDepth, cell.id, pulse]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - BASE / 2 }, { translateY: y.value - BASE / 2 }, { scale: s.value * pulse.value }],
  }));

  return (
    <Animated.View style={[styles.cover, style]} pointerEvents="none">
      <Image source={{ uri: artworkUrl(artwork, 150) }} style={styles.coverArt} cachePolicy="memory-disk" transition={150} />
      {blind && <View style={styles.blindRing} />}
      {selected && <View style={styles.selectedRing} />}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  // All five in one row, even on a small phone.
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    ...Ui.outlineButton,
    flexGrow: 1,
    minHeight: 36,
    paddingHorizontal: 6,
  },
  chipText: {
    letterSpacing: 0.6,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipTextActive: {
    color: Colors.accentText,
  },
  frame: {
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    width: 240,
    alignItems: 'center',
  },
  labelText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  cover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BASE,
    height: BASE,
  },
  coverArt: {
    width: BASE,
    height: BASE,
    borderRadius: BASE / 2,
    backgroundColor: Colors.surface,
  },
  blindRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: BASE / 2,
    borderWidth: 3,
    borderColor: Colors.text,
  },
  selectedRing: {
    position: 'absolute',
    left: -5,
    top: -5,
    right: -5,
    bottom: -5,
    borderRadius: BASE / 2 + 5,
    borderWidth: 3,
    borderColor: Colors.signal,
  },
  legend: {
    color: Colors.textTertiary,
  },
});
