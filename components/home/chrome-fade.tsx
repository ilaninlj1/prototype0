import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { FADE_MS } from '@/lib/home-chrome';

type Props = {
  visible: boolean;
  /** Stays up whatever `visible` says (a failed load's retry line). */
  alwaysShow?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * One of Home's buttons layers. It fades but keeps its space, so nothing on
 * screen moves; hidden, it can't be tapped and screen readers skip it.
 */
export function ChromeFade({ visible, alwaysShow = false, style, children }: Props) {
  const shown = visible || alwaysShow;
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    opacity.set(reduceMotion ? (shown ? 1 : 0) : withTiming(shown ? 1 : 0, { duration: FADE_MS }));
  }, [shown, reduceMotion, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[style, fade]}
      pointerEvents={shown ? 'box-none' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      {children}
    </Animated.View>
  );
}
