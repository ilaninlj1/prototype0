import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, TapTarget, Ui } from '@/constants/theme';

/** A point on a circle of radius r around (50, 50), angle in degrees (0 = right). */
const at = (r: number, deg: number) => `${50 + r * Math.cos((deg * Math.PI) / 180)} ${50 + r * Math.sin((deg * Math.PI) / 180)}`;
const arc = (r: number, from: number, to: number) => `M${at(r, from)} A${r} ${r} 0 0 1 ${at(r, to)}`;

/**
 * The hidden card's record — the Daily Drop record, drawn so its turning is
 * visible: a light glint on the grooves and a mark on the label. It spins,
 * with a soft pulse ring, only while the preview plays; paused, it stops,
 * dims and shows a play button.
 */
export function SpinningRecord({ size, playing, paused }: { size: number; playing: boolean; paused: boolean }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      spin.set(withRepeat(withTiming(spin.get() + 360, { duration: 3200, easing: Easing.linear }), -1, false));
      pulse.set(0);
      pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(spin);
      cancelAnimation(pulse);
      pulse.set(0);
    }
  }, [playing, spin, pulse]);

  const recordStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.get() === 0 ? 0 : 0.5 * (1 - pulse.get()),
    transform: [{ scale: 1 + pulse.get() * 0.28 }],
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ring, { borderRadius: size / 2 }, ringStyle]} pointerEvents="none" />
      <Animated.View style={[StyleSheet.absoluteFill, recordStyle, paused && styles.dim]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={48} fill={Colors.surfaceElevated} stroke={Colors.text} strokeWidth={2} />
          <Circle cx={50} cy={50} r={40} fill="none" stroke={Colors.text} strokeWidth={0.8} opacity={0.25} />
          <Circle cx={50} cy={50} r={33} fill="none" stroke={Colors.text} strokeWidth={0.8} opacity={0.25} />
          <Circle cx={50} cy={50} r={26} fill="none" stroke={Colors.text} strokeWidth={0.8} opacity={0.2} />
          {/* The glint: light catching the grooves on one side, so the turn shows. */}
          <Path d={arc(44, -70, -25)} stroke={Colors.text} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.7} />
          <Path d={arc(36, -60, -40)} stroke={Colors.text} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.4} />
          <Circle cx={50} cy={50} r={16} fill={Colors.signal} />
          {/* A mark on the label, off-center. */}
          <Path d={arc(11, 150, 210)} stroke={Colors.background} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <Circle cx={50} cy={50} r={2.5} fill={Colors.background} />
        </Svg>
      </Animated.View>
      {paused && (
        <View style={styles.pausedOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <Ionicons name="play" size={24} color={Colors.accentText} style={styles.playIcon} />
          </View>
        </View>
      )}
      {paused && (
        <ThemedText style={styles.pausedLabel} pointerEvents="none">
          Paused · hold to play
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2, borderColor: Colors.signal },
  dim: { opacity: 0.4 },
  pausedOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: TapTarget + 8, height: TapTarget + 8, borderRadius: (TapTarget + 8) / 2, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  playIcon: { marginLeft: 3 }, // optical centering
  pausedLabel: { ...Ui.label, position: 'absolute', bottom: -26, color: Colors.text },
});
