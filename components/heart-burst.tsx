import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

/** The double-tap heart: pops in, overshoots a little, fades. Remount (change `key`) to play again. */
export function HeartBurst({ size = 96 }: { size?: number }) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.set(withSequence(withSpring(1.25, { damping: 6, stiffness: 260 }), withTiming(1, { duration: 120 })));
    opacity.set(withDelay(450, withTiming(0, { duration: 300 })));
  }, [scale, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }, { rotate: '-8deg' }] }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, style]}>
      <Ionicons name="heart" size={size} color={Colors.signal} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
