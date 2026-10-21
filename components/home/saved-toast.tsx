import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { TOAST_MS } from '@/lib/home-chrome';

type Props = { visible: boolean; onViewLibrary: () => void; onHide: () => void };

/** "Saved to Liked Songs", for a few seconds after a save. It never covers the card or its buttons. */
export function SavedToast({ visible, onViewLibrary, onHide }: Props) {
  // Counted from when it appears: Home re-renders often, and that mustn't restart the clock.
  const hide = useEffectEvent(onHide);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(180)} style={styles.toast} accessibilityLiveRegion="polite">
      <View style={styles.what}>
        <Ionicons name="checkmark" size={18} color={Colors.accentText} />
        <ThemedText style={styles.text}>Saved to Liked Songs</ThemedText>
      </View>
      <Pressable onPress={onViewLibrary} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
        <ThemedText style={styles.buttonText}>View Library</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    borderRadius: Radius.lg + 6,
    backgroundColor: Colors.accent,
  },
  what: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 14, fontWeight: '700', color: Colors.accentText },
  button: { minHeight: 36, paddingHorizontal: Spacing.md, borderRadius: 18, backgroundColor: Colors.background, justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
