import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import type { Mark } from '@/lib/print';
import { MarkPaths } from './art-piece';

type Point = { x: number; y: number };

const START_PX = 150;

/**
 * A revealed song's print: it stamps onto the cover, holds a beat, then
 * drops into its place in the piece below. Drawn big and shrunk on the way
 * down, so it stays sharp.
 */
export function FlyingPrint({
  mark,
  from,
  to,
  scale,
  delay,
  onLanded,
}: {
  mark: Mark;
  from: Point;
  to: Point;
  /** Screen pixels per canvas unit in the piece below. */
  scale: number;
  delay: number;
  onLanded: () => void;
}) {
  const box = mark.print.size * 3; // canvas units: room for rings, drift and the red dot
  const endScale = (box * scale) / START_PX;
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const size = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const land = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onLanded();
    };
    opacity.set(withDelay(delay, withTiming(1, { duration: 160 })));
    const fly = { duration: 720, easing: Easing.inOut(Easing.cubic) };
    size.set(withDelay(delay, withSequence(withSpring(1, { damping: 11 }), withDelay(300, withTiming(endScale, fly)))));
    x.set(withDelay(delay + 650, withTiming(to.x, fly)));
    y.set(withDelay(delay + 650, withTiming(to.y, { duration: 720, easing: Easing.in(Easing.quad) }, (done) => done && runOnJS(land)())));
    // Mounted once per reveal; the values it animates to never change afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() - START_PX / 2 }, { translateY: y.get() - START_PX / 2 }, { scale: size.get() }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.box, style]}>
      <Svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} width={START_PX} height={START_PX}>
        <MarkPaths mark={mark} x={0} y={0} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: START_PX, height: START_PX, zIndex: 50 },
});
