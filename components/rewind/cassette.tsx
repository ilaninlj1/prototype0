import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { CassetteBody, CassetteReel } from '@/components/emblems';

/** The Rewind emblem with live reels: they turn as you drag and whirr through a jump. `spin` is in degrees. */
export function Cassette({ spin, size = 88 }: { spin: SharedValue<number>; size?: number }) {
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const reel = (16 / 64) * size;
  // Reel centers sit at (22, 36) and (42, 36) on the 64-unit emblem grid.
  const at = (cx: number) => ({ left: ((cx - 8) / 64) * size, top: (28 / 64) * size });
  return (
    <View style={{ width: size, height: size }}>
      <CassetteBody size={size} />
      <Animated.View style={[styles.reel, at(22), turn]}>
        <CassetteReel size={reel} />
      </Animated.View>
      <Animated.View style={[styles.reel, at(42), turn]}>
        <CassetteReel size={reel} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  reel: {
    position: 'absolute',
  },
});
