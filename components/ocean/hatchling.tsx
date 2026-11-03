import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

const LAND_MS = 650;
const STAY_MS = 3200;
const SINK_MS = 900;

/** A save's creature: it pops out where the light landed, stays in Home's water a few seconds, then swims down. */
export function Hatchling({ hatch, width, surface, depth }: { hatch: { key: number; color: string } | null; width: number; surface: number; depth: number }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(0);
  const across = useSharedValue(0);
  const down = useSharedValue(0);
  useEffect(() => {
    if (!hatch || reduced) return;
    pop.set(0);
    across.set(0);
    down.set(0);
    pop.set(withDelay(LAND_MS, withSequence(withTiming(1.2, { duration: 200 }), withTiming(1, { duration: 140 }), withDelay(STAY_MS, withTiming(0, { duration: SINK_MS })))));
    across.set(withDelay(LAND_MS, withTiming(1, { duration: STAY_MS + SINK_MS, easing: Easing.inOut(Easing.quad) })));
    down.set(withDelay(LAND_MS + STAY_MS, withTiming(1, { duration: SINK_MS, easing: Easing.in(Easing.quad) })));
  }, [hatch, reduced, pop, across, down]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.4),
    transform: [
      { translateX: width / 2 - 13 + across.get() * width * 0.22 },
      { translateY: surface + 14 + down.get() * depth + Math.sin(across.get() * 18) * 2.5 },
      { scale: pop.get() },
    ],
  }));
  if (!hatch) return null;
  return (
    <Animated.View style={[styles.fish, style]} pointerEvents="none">
      <Svg width={26} height={16} viewBox="0 0 26 16">
        <Path d="M6 8 L0 2.5 L2 8 L0 13.5 Z" fill={hatch.color} opacity={0.85} />
        <Ellipse cx={14} cy={8} rx={11} ry={6} fill={hatch.color} />
        <Ellipse cx={13} cy={10.4} rx={7} ry={2.6} fill="#ffffff" opacity={0.42} />
        <Circle cx={20.5} cy={6.6} r={1.5} fill="#ffffff" />
        <Circle cx={20.8} cy={6.6} r={0.9} fill="#111111" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fish: { position: 'absolute', left: 0, top: 0, width: 26, height: 16 } });
