import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { panel, type FeedAction, type FeedLoad } from '@/lib/feed-load';

const LABELS: Record<FeedAction, string> = { cancel: 'Cancel', retry: 'Try again', another: 'Another genre' };
const ICONS: Record<FeedAction, keyof typeof Ionicons.glyphMap> = { cancel: 'close', retry: 'refresh', another: 'shuffle' };

/**
 * What sits in the card's place while the feed is loading or can't: a slow
 * turning ring while it waits, then what went wrong and what you can do about
 * it (lib/feed-load.ts). Never a bare spinner, never a silent failure.
 */
export function FeedStatus({ load, onAction }: { load: FeedLoad; onAction: (action: FeedAction) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const waiting = load.phase === 'waiting' || load.phase === 'idle';
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  const spin = useSharedValue(0);
  useEffect(() => {
    if (waiting) spin.set(withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1));
    else cancelAnimation(spin);
  }, [waiting, spin]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));

  const p = panel(load, now) ?? { title: 'FINDING SONGS', body: '', actions: [] as FeedAction[] };
  const failed = load.phase === 'failed';

  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.ring, waiting && ring]}>
        <Svg width={120} height={120}>
          <Circle cx={60} cy={60} r={52} stroke={failed ? Colors.signal : Colors.textTertiary} strokeWidth={1.5} strokeDasharray={waiting ? '3 9' : undefined} fill="none" />
        </Svg>
      </Animated.View>
      <ThemedText style={styles.title}>{p.title}</ThemedText>
      {!!p.body && <ThemedText style={styles.body}>{p.body}</ThemedText>}
      {p.actions.length > 0 && (
        <View style={styles.actions}>
          {p.actions.map((a, i) => (
            <Pressable
              key={a}
              onPress={() => onAction(a)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, i === 0 && a !== 'cancel' && styles.primary, pressed && { opacity: 0.7 }]}>
              <Ionicons name={ICONS[a]} size={16} color={i === 0 && a !== 'cancel' ? Colors.accentText : Colors.text} />
              <ThemedText style={[Ui.label, i === 0 && a !== 'cancel' && { color: Colors.accentText }]}>{LABELS[a]}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    backgroundColor: '#0d1426',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  ring: { width: 120, height: 120, marginBottom: Spacing.sm },
  title: { fontFamily: Fonts.monoMedium, fontSize: 13, lineHeight: 18, letterSpacing: 1.5, color: Colors.text, textAlign: 'center' },
  body: { color: Colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  button: { ...Ui.outlineButton, flexDirection: 'row', gap: 6, height: 48, paddingHorizontal: Spacing.lg },
  primary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
});
