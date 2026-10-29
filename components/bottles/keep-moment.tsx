import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, DarkColors, Radius, Spacing } from '@/constants/theme';
import type { KeepMoment as Moment } from '@/hooks/use-bottles';

import { BottlePrint } from './bottle-print';

const SHOW_MS = 3500;
const RING_MS = 700;

type Props = { moment: Moment; onDone: () => void };

/**
 * The reward for keeping a stranger's bottle: its print with your ring drawing in last, how many
 * kept it before you, and the cities it passed through. It never takes a touch, so the next card's
 * gestures go straight through.
 */
export function KeepMoment({ moment, onDone }: Props) {
  const reduceMotion = useReducedMotion();
  const done = useEffectEvent(onDone);
  useEffect(() => {
    const ring = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), reduceMotion ? 0 : RING_MS);
    const hide = setTimeout(done, SHOW_MS);
    return () => {
      clearTimeout(ring);
      clearTimeout(hide);
    };
  }, [moment.key, reduceMotion]);

  return (
    <Animated.View
      key={moment.key}
      entering={reduceMotion ? undefined : FadeIn.duration(250)}
      exiting={reduceMotion ? undefined : FadeOut.duration(250)}
      style={styles.card}
      pointerEvents="none"
      accessibilityLiveRegion="polite">
      <View style={styles.tile}>
        <BottlePrint trackId={moment.trackId} hops={moment.hops} size={72} drawLastRing />
      </View>
      <View style={styles.words}>
        <ThemedText style={styles.line}>{moment.line}</ThemedText>
        <View style={styles.route}>
          {moment.stops.map((s, i) => (
            <View key={i} style={styles.stop}>
              {i > 0 && <View style={styles.dash} />}
              <View style={[styles.dot, s.you && styles.dotYou]} />
              <ThemedText style={[styles.city, s.you && styles.cityYou]} numberOfLines={1}>
                {s.you ? 'You' : s.label}
                {s.count > 1 ? ` ×${s.count}` : ''}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    paddingRight: Spacing.md,
    borderRadius: Radius.lg + 8,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tile: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: DarkColors.background },
  words: { flex: 1, gap: 6 },
  line: { fontSize: 14, fontWeight: '700', color: Colors.text },
  route: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  stop: { flexDirection: 'row', alignItems: 'center' },
  dash: { width: 10, height: StyleSheet.hairlineWidth * 2, backgroundColor: Colors.hairline, marginHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textTertiary, marginRight: 4 },
  dotYou: { backgroundColor: Colors.signal, width: 8, height: 8, borderRadius: 4 },
  city: { fontSize: 12, color: Colors.textSecondary, maxWidth: 110 },
  cityYou: { color: Colors.text, fontWeight: '700' },
});
