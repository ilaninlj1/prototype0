import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { BottleAsk as Ask } from '@/hooks/use-bottles';

type Props = { ask: Ask; onConsent: (useCity: boolean) => void; onOldFinds: (float: boolean) => void };

/**
 * Bottles' two one-time questions, as a card in the toast's place: the first save that would
 * float ("Only your city goes with them"), then whether your past blind finds float too.
 */
export function BottleAskCard({ ask, onConsent, onOldFinds }: Props) {
  const reduceMotion = useReducedMotion();
  const consent = ask.kind === 'consent';
  const title = consent ? 'Your saves float to strangers, blind.' : `Float your ${ask.finds.length} blind ${ask.finds.length === 1 ? 'find' : 'finds'} too?`;
  const body = consent
    ? 'Someone somewhere hears it without knowing who it is. Only your city goes with it.'
    : 'Songs you saved before Bottles can wash up for strangers as well.';
  const [yes, no] = consent ? ['Use my city', 'Not now'] : ['Float them', 'No thanks'];
  const answer = (v: boolean) => (consent ? onConsent(v) : onOldFinds(v));
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(250)} style={styles.card} accessibilityLiveRegion="polite">
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={styles.body}>{body}</ThemedText>
      <View style={styles.row}>
        <Pressable onPress={() => answer(false)} accessibilityRole="button" style={({ pressed }) => [styles.button, styles.quiet, pressed && styles.pressed]}>
          <ThemedText style={styles.quietText}>{no}</ThemedText>
        </Pressable>
        <Pressable onPress={() => answer(true)} accessibilityRole="button" style={({ pressed }) => [styles.button, styles.main, pressed && styles.pressed]}>
          <ThemedText style={styles.mainText}>{yes}</ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.xs,
    padding: Spacing.lg,
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
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  body: { fontSize: 13, color: Colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  button: { minHeight: 40, paddingHorizontal: Spacing.lg, borderRadius: 20, justifyContent: 'center' },
  quiet: { backgroundColor: Colors.surface },
  main: { backgroundColor: Colors.accent },
  pressed: { opacity: 0.7 },
  quietText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  mainText: { fontSize: 14, fontWeight: '700', color: Colors.accentText },
});
