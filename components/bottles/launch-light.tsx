import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const MS = 700;

/**
 * A save that floats: the song's light drops from the middle of the card down into the sea (`fall` points below it),
 * where components/bottles/sea-line.tsx's outgoing bottle carries it off.
 */
export function LaunchLight({ trigger, height, fall, color }: { trigger: number; height: number; fall: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(1);
  useEffect(() => {
    if (!trigger || reduceMotion) return;
    t.set(0);
    t.set(withTiming(1, { duration: MS, easing: Easing.in(Easing.quad) }));
    void Haptics.selectionAsync().catch(() => {});
  }, [trigger, reduceMotion, t]);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return { opacity: p >= 1 ? 0 : p > 0.85 ? (1 - p) / 0.15 : 1, transform: [{ translateY: p * fall }, { scale: 1 - 0.5 * p }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.light, { top: height / 2 - 7, backgroundColor: color, shadowColor: color }, style]} />;
}

const styles = StyleSheet.create({
  light: {
    position: 'absolute',
    alignSelf: 'center',
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
