import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { DarkColors } from '@/constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The sea's height; the wave rides through its middle. */
export const SEA_HEIGHT = 34;
const BASE = 17;
const AMP = 4;
const LAMBDA = 130;
const PERIOD = 4200;
const MARGIN = 26;
const BOTTLE = 34;

export type SeaBottle = { key: string; color: string; position: number } | null;

function surface(x: number, t: number, phase = 0, amp = AMP, base = BASE): number {
  'worklet';
  return base + amp * Math.sin(((2 * Math.PI) / LAMBDA) * x + ((2 * Math.PI) / PERIOD) * t + phase);
}

function wavePath(width: number, t: number, phase: number, amp: number, base: number): string {
  'worklet';
  let d = '';
  for (let x = -6; x <= width + 6; x += 6) d += `${x === -6 ? 'M' : 'L'}${x} ${surface(x, t, phase, amp, base).toFixed(1)} `;
  return d;
}

/** Where a sea position (1 = far right, 0 = the left edge) sits across the screen, as the bottle's centre x. */
export function seaX(position: number, width: number): number {
  return MARGIN + position * (width - MARGIN * 2);
}

function BottleGlyph({ color }: { color: string }) {
  return (
    <Svg width={BOTTLE} height={BOTTLE} viewBox="0 0 30 30">
      <Circle cx={12} cy={15.5} r={8} fill={color} opacity={0.35} />
      <Rect x={3} y={10} width={18} height={11} rx={5.5} fill="rgba(243,234,216,0.55)" stroke={DarkColors.background} strokeWidth={1.3} />
      <Rect x={20} y={12.5} width={5} height={6} rx={1.6} fill="rgba(243,234,216,0.55)" stroke={DarkColors.background} strokeWidth={1.3} />
      <Rect x={24.5} y={13} width={3.5} height={5} rx={1.2} fill="#b07a4a" />
      <Circle cx={12} cy={15.5} r={3.4} fill={color} />
    </Svg>
  );
}

/**
 * The sea along the bottom of Home (Bottles). Empty while you swipe; a stranger's bottle rides it, glowing with its
 * song, a step closer each song (lib/bottle-countdown.ts). `outgoing` sails one of yours off to the right when a save
 * floats. It never takes a touch.
 */
export function SeaLine({ width, incoming, outgoing }: { width: number; incoming: SeaBottle; outgoing: { key: number; color: string } | null }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useFrameCallback((f) => {
    if (!reduceMotion) t.set(f.timeSinceFirstFrame);
  });
  const front = useAnimatedProps(() => ({ d: wavePath(width, t.get(), 0, AMP, BASE) }));
  const back = useAnimatedProps(() => ({ d: wavePath(width, t.get(), 1.8, AMP * 0.7, BASE + 5) }));

  // The incoming bottle: it appears where it is (never slides in from off screen), then glides a step at a time.
  const bx = useSharedValue(width);
  const shown = useSharedValue(0);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!incoming) {
      shown.set(0);
      lastKey.current = null;
      return;
    }
    const x = seaX(incoming.position, width);
    if (incoming.key !== lastKey.current) {
      lastKey.current = incoming.key;
      bx.set(x);
      shown.set(reduceMotion ? 1 : withTiming(1, { duration: 700 }));
    } else bx.set(reduceMotion ? x : withTiming(x, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [incoming, width, bx, shown, reduceMotion]);
  const riding = useAnimatedStyle(() => {
    const x = bx.get();
    const slope = AMP * ((2 * Math.PI) / LAMBDA) * Math.cos(((2 * Math.PI) / LAMBDA) * x + ((2 * Math.PI) / PERIOD) * t.get());
    return {
      opacity: shown.get(),
      transform: [{ translateX: x - BOTTLE / 2 }, { translateY: surface(x, t.get()) - BOTTLE / 2 - 2 }, { rotate: `${Math.atan(slope)}rad` }],
    };
  });

  // One of yours sets sail: from the middle, riding the same wave, off the right edge.
  const ox = useSharedValue(width + BOTTLE);
  const oShown = useSharedValue(0);
  useEffect(() => {
    if (!outgoing || reduceMotion) return;
    // It picks the light up where the save's glint lands (components/bottles/launch-light.tsx, 0.7 s), then sails.
    oShown.set(0);
    ox.set(width / 2);
    oShown.set(withDelay(600, withTiming(1, { duration: 200 })));
    ox.set(withDelay(800, withTiming(width + BOTTLE * 2, { duration: 2200, easing: Easing.in(Easing.quad) })));
  }, [outgoing, width, ox, oShown, reduceMotion]);
  const sailing = useAnimatedStyle(() => {
    const x = ox.get();
    return { opacity: oShown.get(), transform: [{ translateX: x - BOTTLE / 2 }, { translateY: surface(x, t.get()) - BOTTLE / 2 - 2 }] };
  });

  return (
    <View style={styles.sea} pointerEvents="none">
      <Svg width={width} height={SEA_HEIGHT}>
        <AnimatedPath animatedProps={back} fill="none" stroke={DarkColors.background} strokeOpacity={0.12} strokeWidth={1.3} />
        <AnimatedPath animatedProps={front} fill="none" stroke={DarkColors.background} strokeOpacity={0.3} strokeWidth={1.5} />
      </Svg>
      {incoming && (
        <Animated.View style={[styles.bottle, riding]}>
          <BottleGlyph color={incoming.color} />
        </Animated.View>
      )}
      {outgoing && (
        <Animated.View style={[styles.bottle, sailing]}>
          <BottleGlyph color={outgoing.color} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sea: { position: 'absolute', left: 0, right: 0, bottom: -4, height: SEA_HEIGHT },
  bottle: { position: 'absolute', left: 0, top: 0, width: BOTTLE, height: BOTTLE },
});
