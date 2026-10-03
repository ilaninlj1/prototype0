import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  runOnJS,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/mini-player';
import { Cassette } from '@/components/rewind/cassette';
import { RewindStrip } from '@/components/rewind/rewind-strip';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, withLikedAt, type DiscoveryTrack, type SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import {
  agoLabel,
  BAND_STARTS,
  heardIn,
  inPeriod,
  periodLabel,
  periodLine,
  periodStart,
  shortDate,
  step,
  UNITS,
  type Unit,
} from '@/lib/rewind';

const SPRING = { damping: 18, stiffness: 220 };
/** Degrees the reels turn per point dragged, and how far they whirr on each kind of jump. */
const REEL_PER_POINT = 1.5;
const WHIRR: Record<Unit, { turns: number; ms: number; ticks: number }> = {
  day: { turns: 0.5, ms: 320, ticks: 1 },
  month: { turns: 2, ms: 600, ticks: 4 },
  year: { turns: 5, ms: 950, ticks: 8 },
};
const IMPACT: Record<Unit, Haptics.ImpactFeedbackStyle> = {
  day: Haptics.ImpactFeedbackStyle.Light,
  month: Haptics.ImpactFeedbackStyle.Medium,
  year: Haptics.ImpactFeedbackStyle.Heavy,
};

type Place = { at: number; unit: Unit; dir: -1 | 1 };

/** The zone a drag of x points is in: 1 day, 2 month, 3 year, signed by direction (negative = earlier). */
function zoneOf(x: number, half: number): number {
  'worklet';
  const share = Math.abs(x) / half;
  const i = share >= BAND_STARTS.year ? 3 : share >= BAND_STARTS.month ? 2 : share >= BAND_STARTS.day ? 1 : 0;
  return x < 0 ? -i : i;
}

/** Past either end the thumb still follows, but slower, like pulling against a spring. */
function rubber(x: number, half: number): number {
  'worklet';
  const a = Math.abs(x);
  return Math.sign(x) * (a <= half ? a : half + (a - half) * 0.25);
}

/**
 * Rewind: your finds, one day (or month, or year) at a time. Drag left to go
 * back; how far you drag sets the step, and every step lands on a day you
 * actually found something. Tap a cover to hear it.
 */
export default function RewindScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const half = (width - 2 * Spacing.lg) / 2;
  const [now] = useState(() => Date.now());

  const [loaded, setLoaded] = useState(false);
  const [finds, setFinds] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [view, setView] = useState<Place | null>(null);
  const [band, setBand] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [liked, h] = await Promise.all([loadLikedTracks(), loadSwipeHistory()]);
      if (cancelled) return;
      const dated = withLikedAt(liked, h).filter((t) => t.likedAt != null);
      setFinds(dated);
      setHistory(h);
      // Open on your latest find.
      if (dated.length) setView({ at: Math.max(...dated.map((t) => t.likedAt!)), unit: 'day', dir: -1 });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const times = useMemo(() => finds.map((t) => t.likedAt!), [finds]);
  const shown = useMemo(() => (view ? inPeriod(finds, view.at, view.unit) : []), [finds, view]);
  const heard = useMemo(() => (view ? heardIn(history, view.at, view.unit) : 0), [history, view]);
  // One or two finds get bigger covers, so a quiet day doesn't look empty.
  const columns = shown.length <= 2 ? 2 : 3;
  const cover = Math.floor((width - 2 * Spacing.lg - (columns - 1) * Spacing.md) / columns);
  const canGo = useCallback((unit: Unit, dir: -1 | 1) => view != null && step(times, view.at, unit, dir) != null, [times, view]);

  // Playback, the same way as the Profile tab: leaving stops it.
  const { player, status } = usePlayback();
  const [nowPlaying, setNowPlaying] = useState<DiscoveryTrack | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => player.pause();
    }, [player])
  );
  function togglePlay(track: DiscoveryTrack) {
    if (nowPlaying?.id === track.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setNowPlaying(track);
    if (!track.previewUrl) return;
    player.replace(track.previewUrl);
    player.play();
  }

  // ---------- The scrub ----------
  const dx = useSharedValue(0);
  const spin = useSharedValue(0);
  const spinAtStart = useSharedValue(0);
  const zone = useSharedValue(0);
  const shake = useSharedValue(0);

  function bump() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shake.set(withSequence(withTiming(-8, { duration: 50 }), withRepeat(withTiming(8, { duration: 80 }), 3, true), withTiming(0, { duration: 50 })));
    spin.set(withSpring(spinAtStart.get(), SPRING));
  }

  function go(unit: Unit, dir: -1 | 1) {
    if (!view) return;
    const target = step(times, view.at, unit, dir);
    if (target == null) return bump();
    setView({ at: target, unit, dir });
    // A jump whirrs the reels and ticks like a tape winding, then lands with a thump sized to the jump.
    const w = WHIRR[unit];
    spin.set(withTiming(spin.get() + dir * w.turns * 360, { duration: w.ms, easing: Easing.out(Easing.cubic) }));
    for (let i = 0; i < w.ticks; i++) setTimeout(() => Haptics.selectionAsync(), i * 50);
    setTimeout(() => Haptics.impactAsync(IMPACT[unit]), w.ticks * 50);
  }

  function onZone(z: number) {
    setBand(z);
    if (z !== 0) Haptics.selectionAsync();
  }

  function onRelease(z: number) {
    setBand(0);
    if (z === 0) spin.set(withSpring(spinAtStart.get(), SPRING));
    else go(UNITS[Math.abs(z) - 1], z < 0 ? -1 : 1);
  }

  const scrub = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onStart(() => {
      spinAtStart.set(spin.get());
    })
    .onUpdate((e) => {
      const x = rubber(e.translationX, half);
      dx.set(x);
      spin.set(spinAtStart.get() + x * REEL_PER_POINT);
      const z = zoneOf(x, half);
      if (z !== zone.get()) {
        zone.set(z);
        runOnJS(onZone)(z);
      }
    })
    .onEnd(() => {
      const z = zone.get();
      zone.set(0);
      dx.set(withSpring(0, SPRING));
      runOnJS(onRelease)(z);
    });

  // What letting go right now would do, in words.
  const preview = useMemo(() => {
    if (!view || band === 0) return null;
    const unit = UNITS[Math.abs(band) - 1];
    const dir = band < 0 ? -1 : 1;
    const target = step(times, view.at, unit, dir);
    if (target == null) return `Nothing found ${dir < 0 ? 'before' : 'after'} this ${unit}`;
    return `${dir < 0 ? 'Back' : 'Ahead'} a ${unit}: ${periodLabel(target, unit, now)}`;
  }, [band, times, view, now]);

  if (!loaded) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const ago = view ? agoLabel(view.at, view.unit, now) : null;

  return (
    <GestureDetector gesture={scrub}>
      <View style={[styles.screen, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={Ui.textButton}>
            <Ionicons name="close" size={26} color={Colors.textSecondary} />
          </Pressable>
          <Cassette spin={spin} size={72} />
          <View style={Ui.textButton} />
        </View>

        {!view ? (
          <View style={styles.empty}>
            <ThemedText type="title">Nothing to rewind yet</ThemedText>
            <ThemedText style={styles.dim}>Save songs on Home and they line up here by the day you found them.</ThemedText>
          </View>
        ) : (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
              <Animated.View
                key={`${view.unit}-${periodStart(view.at, view.unit)}`}
                entering={(view.dir < 0 ? FadeInLeft : FadeInRight).duration(260)}
                style={styles.period}>
                <ThemedText type="eyebrow">{ago ?? 'Rewind'}</ThemedText>
                <ThemedText type="hero" numberOfLines={1} adjustsFontSizeToFit>
                  {periodLabel(view.at, view.unit, now)}
                </ThemedText>
                <ThemedText style={styles.dim}>{periodLine(shown.length, heard)}</ThemedText>
                <View style={styles.grid}>
                  {shown.map((t, i) => {
                    const picked = nowPlaying?.id === t.id;
                    return (
                      <Animated.View key={t.id} entering={FadeIn.delay(Math.min(i, 12) * 30)} style={{ width: cover }}>
                        <Pressable onPress={() => togglePlay(t)} accessibilityLabel={`${t.trackName} by ${t.artistName}`}>
                          <Image source={{ uri: artworkUrl(t.artworkUrl100, 300) }} style={[styles.art, { width: cover, height: cover }]} />
                          {picked && (
                            <View style={styles.playing}>
                              <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={Colors.accentText} />
                            </View>
                          )}
                          <ThemedText style={styles.song} numberOfLines={1}>
                            {t.trackName}
                          </ThemedText>
                          <ThemedText style={styles.artist} numberOfLines={1}>
                            {t.artistName}
                          </ThemedText>
                          {/* The title already has the year. */}
                          {view.unit !== 'day' && <ThemedText style={styles.date}>{shortDate(t.likedAt!, view.at)}</ThemedText>}
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </Animated.View>
            </ScrollView>

            {nowPlaying && (
              <MiniPlayer
                track={nowPlaying}
                playing={status.playing}
                progress={status.duration ? status.currentTime / status.duration : 0}
                onToggle={() => togglePlay(nowPlaying)}
              />
            )}

            <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.md }]}>
              <ThemedText style={[styles.hint, preview != null && styles.hintOn]} numberOfLines={1}>
                {preview ?? 'Drag left to go back. Further jumps a month, then a year.'}
              </ThemedText>
              <RewindStrip dx={dx} shake={shake} half={half} band={band} canGo={canGo} onTap={go} />
            </View>
          </>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  empty: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  scroll: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  period: {
    gap: Spacing.xs,
  },
  dim: {
    color: Colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  art: {
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  // The song you tapped: a cream button on its cover, like the mini player's.
  playing: {
    position: 'absolute',
    right: Spacing.xs,
    top: Spacing.xs,
    width: 28,
    height: 28,
    borderRadius: Radius.round,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  song: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  artist: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  date: {
    ...Ui.label,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  controls: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    color: Colors.textSecondary,
  },
  hintOn: {
    color: Colors.text,
    fontWeight: '700',
  },
});
