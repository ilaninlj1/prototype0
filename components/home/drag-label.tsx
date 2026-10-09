import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type AnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { DEFAULT_SWIPE_THRESHOLDS } from '@/components/discovery/swipe-physics';

const H = DEFAULT_SWIPE_THRESHOLDS.horizontal;
const V = DEFAULT_SWIPE_THRESHOLDS.vertical;

/**
 * What letting go would do, written on the card as you drag: fully shown at
 * the commit threshold. On a revealed card left and right both move on.
 */
export function DragLabels({ tx, ty, revealed }: { tx: SharedValue<number>; ty: SharedValue<number>; revealed: boolean }) {
  const left = useAnimatedStyle(() => ({ opacity: ty.get() > Math.abs(tx.get()) ? 0 : interpolate(-tx.get(), [0, H], [0, 1], 'clamp') }));
  const right = useAnimatedStyle(() => ({ opacity: ty.get() > Math.abs(tx.get()) ? 0 : interpolate(tx.get(), [0, H], [0, 1], 'clamp') }));
  const down = useAnimatedStyle(() => ({ opacity: ty.get() > Math.abs(tx.get()) ? interpolate(ty.get(), [0, V], [0, 1], 'clamp') : 0 }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.wrap, styles.left, left]}>
        <ThemedText style={styles.label}>{revealed ? 'NEXT' : 'SKIP'}</ThemedText>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.wrap, styles.right, right]}>
        <ThemedText style={styles.label}>{revealed ? 'NEXT' : 'MORE LIKE THIS'}</ThemedText>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.wrap, styles.bottom, down]}>
        <ThemedText style={styles.label}>NEW GENRE</ThemedText>
      </Animated.View>
    </>
  );
}

/** A wash of color from one edge that fades out past the middle — no hard line where skip meets like. */
export function TintWash({ side, color, style }: { side: 'left' | 'right'; color: string; style: AnimatedStyle<ViewStyle> }) {
  const id = `tint-${side}`;
  const from = side === 'left' ? '0' : '1';
  const to = side === 'left' ? '1' : '0';
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1={from} y1="0" x2={to} y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.4" stopColor={color} stopOpacity={0.45} />
            <Stop offset="0.85" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(19, 33, 63, 0.7)',
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  left: { left: 16, top: '45%' },
  right: { right: 16, top: '45%' },
  bottom: { alignSelf: 'center', bottom: 72 },
  label: { fontFamily: Fonts.monoMedium, fontSize: 14, lineHeight: 18, letterSpacing: 2, color: Colors.text },
});
