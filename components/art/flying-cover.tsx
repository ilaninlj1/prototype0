import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { artworkUrl } from '@/lib/discovery';

type Point = { x: number; y: number };

const START_PX = 150;

/** A revealed song's cover drops from the card into its new tile in the collage. */
export function FlyingCover({
  artwork,
  from,
  to,
  endPx,
  delay,
  onLanded,
}: {
  artwork: string;
  from: Point;
  to: Point;
  /** The tile's shorter side on screen, in pixels. */
  endPx: number;
  delay: number;
  onLanded: () => void;
}) {
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
    opacity.set(withDelay(delay, withTiming(1, { duration: 150 })));
    scale.set(withDelay(delay + 150, withTiming(Math.max(endPx, 12) / START_PX, fly)));
    x.set(withDelay(delay + 150, withTiming(to.x, fly)));
    y.set(withDelay(delay + 150, withTiming(to.y, { duration: 700, easing: Easing.in(Easing.quad) }, (done) => done && runOnJS(land)())));
    // Mounted once per reveal; its targets never change afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() - START_PX / 2 }, { translateY: y.get() - START_PX / 2 }, { scale: scale.get() }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.box, style]}>
      <Image source={{ uri: artworkUrl(artwork, 300) }} style={styles.cover} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0, width: START_PX, height: START_PX, zIndex: 50, borderRadius: 6, overflow: 'hidden' },
  cover: { width: START_PX, height: START_PX },
});
