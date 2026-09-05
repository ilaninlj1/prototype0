import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

const FADE_MS = 400;

type ActionOverlayProps = {
  visible: boolean;
  onArtist: () => void;
  onSound: () => void;
};

// No auto-dismiss timer: the overlay stays up until the parent flips `visible`
// to false, which it does on the next swipe (any direction) — not a clock. A
// swipe away from an unanswered overlay leaves the strategy unchanged; there's
// no implicit "default to sound" anymore.
export function ActionOverlay({ visible, onArtist, onSound }: ActionOverlayProps) {
  const [rendered, setRendered] = useState(visible);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: FADE_MS });
      return;
    }
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      if (finished) runOnJS(setRendered)(false);
    });
  }, [visible, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  button: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
});
