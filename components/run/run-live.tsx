import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Spacing } from '@/constants/theme';
import { AWAKE_MS, HOLD_MS } from '@/lib/run-gate';
import { goalLine } from '@/lib/run-goal';
import { formatClock, formatMiles, formatPace } from '@/lib/run-pace';
import type { Goal } from '@/lib/run-types';
import type { LiveState } from '@/hooks/use-run-session';

const DIM = 'rgba(243, 234, 216, 0.55)';

type Props = { state: LiveState; goal: Goal; tapToLike: boolean; onLike: () => void; onSkip: () => void; onBack: () => void; onEnd: () => void };

/**
 * The run's screen: black, so it costs almost nothing in a pocket. Touches do nothing until you hold the screen
 * for half a second; then Like, Skip, Back and End show for 5 s.
 */
export function RunLive({ state, goal, tapToLike, onLike, onSkip, onBack, onEnd }: Props) {
  const insets = useSafeAreaInsets();
  const [awake, setAwake] = useState(false);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);
  const firstFlash = useRef(state.likedFlash);

  const wake = () => {
    setAwake(true);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAwake(false), AWAKE_MS);
  };
  useEffect(() => () => void (sleepTimer.current && clearTimeout(sleepTimer.current)), []);

  useEffect(() => {
    if (state.likedFlash === firstFlash.current) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [state.likedFlash]);

  const song = state.song;
  const songLine = !song
    ? 'Out of songs that fit'
    : song.blind
      ? `Blind song #${state.index}`
      : `${song.track.trackName} · ${song.track.artistName}`;
  const tap = (fn: () => void) => () => {
    fn();
    wake();
  };

  return (
    <Pressable style={[styles.room, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]} delayLongPress={HOLD_MS} onLongPress={wake} accessibilityLabel="Hold anywhere for run controls">
      <ThemedText style={styles.goal}>{goalLine(state.steer, goal, state.calibrating)}</ThemedText>
      <View style={styles.center}>
        <ThemedText style={styles.pace}>{formatPace(state.pace)}</ThemedText>
        <ThemedText style={styles.unit}>min / mile</ThemedText>
        <ThemedText style={styles.stats}>
          {formatClock(state.elapsedMs)} · {formatMiles(state.distanceM)}
        </ThemedText>
        <ThemedText style={styles.steps}>
          {state.spm ? `${Math.round(state.spm)} steps/min` : 'Counting steps'}
          {state.beat ? ` · song ${Math.round(state.beat)} BPM` : ''}
        </ThemedText>
        <ThemedText style={styles.song} numberOfLines={1}>
          {songLine}
        </ThemedText>
        {saved ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.saved}>
            <Ionicons name="heart" size={22} color={DarkColors.signal} />
            <ThemedText style={styles.savedText}>Saved</ThemedText>
          </Animated.View>
        ) : null}
      </View>

      {state.notice ? <ThemedText style={styles.notice}>{state.notice}</ThemedText> : null}

      {awake ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} style={styles.controls}>
          <View style={styles.row}>
            <Control icon="play-back" label="Back" onPress={tap(onBack)} />
            <Control icon="heart" label="Like" onPress={tap(onLike)} big />
            <Control icon="play-forward" label="Skip" onPress={tap(onSkip)} />
          </View>
          <Pressable onLongPress={onEnd} delayLongPress={800} onPress={wake} style={styles.end} accessibilityRole="button" accessibilityLabel="End run, hold">
            <ThemedText style={styles.endText}>Hold to end run</ThemedText>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.delay(250)}>
          {tapToLike ? <ThemedText style={styles.hint}>Tap your pocket 2 or 3 times to like a song</ThemedText> : null}
          <ThemedText style={styles.hint}>Hold anywhere for controls</ThemedText>
        </Animated.View>
      )}
    </Pressable>
  );
}

function Control({ icon, label, onPress, big }: { icon: 'play-back' | 'heart' | 'play-forward'; label: string; onPress: () => void; big?: boolean }) {
  const size = big ? 84 : 64;
  // The circle and its label are one target, so a tap anywhere on either counts.
  return (
    <Pressable onPress={onPress} style={styles.control} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, big && { backgroundColor: DarkColors.signal, borderColor: DarkColors.signal }]}>
        <Ionicons name={icon} size={big ? 34 : 26} color="#f3ead8" />
      </View>
      <ThemedText style={styles.controlLabel}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: '#000', paddingHorizontal: Spacing.lg },
  goal: { fontFamily: Fonts.monoMedium, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: DIM, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  pace: { fontFamily: Fonts.mono, fontSize: 88, lineHeight: 96, color: 'rgba(243, 234, 216, 0.82)', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, color: DIM },
  stats: { fontFamily: Fonts.mono, fontSize: 20, color: 'rgba(243, 234, 216, 0.7)', marginTop: Spacing.lg },
  steps: { fontFamily: Fonts.mono, fontSize: 14, color: 'rgba(243, 234, 216, 0.42)', marginTop: Spacing.sm },
  song: { fontSize: 16, color: DIM, marginTop: Spacing.lg, maxWidth: '100%' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  savedText: { fontSize: 16, fontWeight: '600', color: DarkColors.text },
  notice: { fontSize: 14, color: DarkColors.highlight, textAlign: 'center', marginBottom: Spacing.md },
  hint: { fontSize: 13, color: 'rgba(243, 234, 216, 0.35)', textAlign: 'center' },
  controls: { gap: Spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  control: { alignItems: 'center', gap: Spacing.xs },
  circle: { borderWidth: 1, borderColor: DarkColors.hairline, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { fontSize: 13, color: DIM },
  end: { minHeight: 52, borderRadius: 10, borderWidth: 1, borderColor: DarkColors.hairline, alignItems: 'center', justifyContent: 'center' },
  endText: { fontSize: 16, fontWeight: '600', color: DarkColors.text },
});
