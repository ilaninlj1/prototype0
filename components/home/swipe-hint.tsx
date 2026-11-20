import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const DOT = 46;
const SLIDE_MS = 1400;
const REST_MS = 900;

/**
 * A see-through fingertip that presses on the blind card, slides right and lifts off, over and over, so someone who
 * has never seen the app knows the card moves. With Reduce Motion it stays away and the words under the card do the job.
 */
export function SwipeHint({ width }: { width: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withSequence(withTiming(1, { duration: SLIDE_MS, easing: Easing.linear }), withDelay(REST_MS, withTiming(0, { duration: 0 }))), -1));
    return () => cancelAnimation(t);
  }, [reduced, t]);

  const finger = useAnimatedStyle(() => {
    const v = t.get();
    const s = interpolate(v, [0.15, 0.8], [0, 1], 'clamp');
    const eased = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
    return {
      opacity: interpolate(v, [0, 0.12, 0.72, 0.95], [0, 0.9, 0.9, 0], 'clamp'),
      transform: [{ translateX: width * (eased * 0.44 - 0.22) }, { scale: interpolate(v, [0, 0.15], [1.3, 1], 'clamp') }],
    };
  });

  if (reduced) return null;
  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.fill} pointerEvents="none">
      <Animated.View style={[styles.dot, finger]} testID="swipe-hint-finger">
        <View style={styles.core} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: DOT * 0.36, height: DOT * 0.36, borderRadius: DOT * 0.18, backgroundColor: 'rgba(255, 255, 255, 0.9)' },
});
