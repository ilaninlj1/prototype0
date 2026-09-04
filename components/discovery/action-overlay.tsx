import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const AUTO_DISMISS_MS = 8000;
const FADE_MS = 400;

type ActionOverlayProps = {
  visible: boolean;
  onArtist: () => void;
  onSound: () => void;
};

export function ActionOverlay({ visible, onArtist, onSound }: ActionOverlayProps) {
  const [rendered, setRendered] = useState(visible);
  const opacity = useSharedValue(0);
  const onSoundRef = useRef(onSound);
  onSoundRef.current = onSound;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      opacity.value = withTiming(1, { duration: FADE_MS });
      opacity.value = withDelay(AUTO_DISMISS_MS, withTiming(0, { duration: FADE_MS }));
      const timer = setTimeout(() => onSoundRef.current(), AUTO_DISMISS_MS + FADE_MS);
      return () => clearTimeout(timer);
    }
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      if (finished) runOnJS(setRendered)(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#2a2a2a" darkColor="#2a2a2a">
          <ThemedText style={styles.buttonText}>More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#1a1a1a" darkColor="#1a1a1a">
          <ThemedText style={styles.buttonText}>More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
