import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/** A pressable that squishes slightly under the finger, so taps feel physical. */
export function PressableScale({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => scale.set(withSpring(0.97, { damping: 20, stiffness: 400 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 15, stiffness: 300 }))}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
