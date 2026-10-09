import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { PrintStill } from '@/components/print/print-still';
import type { PrintRecipe } from '@/lib/print-recipe';

type Point = { x: number; y: number };

const START_PX = 64;

/** A revealed song's print leaves the card's corner and lands in its slot in the piece. */
export function FlyingPrint({ recipe, from, to, endSize, onLanded }: { recipe: PrintRecipe; from: Point; to: Point; endSize: number; onLanded: () => void }) {
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const land = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onLanded();
    };
    const fly = { duration: 700, easing: Easing.inOut(Easing.cubic) };
    opacity.set(withTiming(1, { duration: 120 }));
    scale.set(withDelay(120, withTiming(Math.max(endSize, 12) / START_PX, fly)));
    x.set(withDelay(120, withTiming(to.x, fly)));
    y.set(withDelay(120, withTiming(to.y, { duration: 700, easing: Easing.in(Easing.quad) }, (done) => done && runOnJS(land)())));
    // Mounted once per reveal; its targets never change afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() - START_PX / 2 }, { translateY: y.get() - START_PX / 2 }, { scale: scale.get() }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.box, style]}>
      <PrintStill recipe={recipe} size={START_PX} detail="mini" ground={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: START_PX, height: START_PX, zIndex: 50 },
});
