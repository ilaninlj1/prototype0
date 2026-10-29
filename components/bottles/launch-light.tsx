import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { DarkColors } from '@/constants/theme';

const MS = 600;

/** For your first few launches: a small light lifts off the card toward the top edge as the save floats away. */
export function LaunchLight({ trigger, height }: { trigger: number; height: number }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(1);
  useEffect(() => {
    if (!trigger || reduceMotion) return;
    t.set(0);
    t.set(withTiming(1, { duration: MS, easing: Easing.out(Easing.quad) }));
    void Haptics.selectionAsync().catch(() => {});
  }, [trigger, reduceMotion, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() >= 1 ? 0 : 1 - t.get(),
    transform: [{ translateY: -t.get() * height * 0.55 }, { scale: 1 - 0.5 * t.get() }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.light, { top: height * 0.55 }, style]} />;
}

const styles = StyleSheet.create({
  light: {
    position: 'absolute',
    alignSelf: 'center',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: DarkColors.text,
    shadowColor: DarkColors.text,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
