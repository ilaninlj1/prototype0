import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import type { IslandColors } from '@/lib/home-sky';
import { signFace, sockPaths, type SignState } from '@/lib/home-sky-motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Drawn in island units around the ground's center, then scaled. Rounded by smooth curves through these points.
const ISLAND = [[-54, 2], [-40, -3], [-18, -5], [6, -5], [30, -4], [48, -2], [55, 3], [46, 10], [36, 14], [28, 22], [14, 24], [6, 33], [-6, 28], [-16, 30], [-26, 20], [-38, 15], [-48, 9]];
const GRASS = [[-54, 2], [-40, -3], [-18, -5], [6, -5], [30, -4], [48, -2], [55, 3], [44, 8], [33, 5], [22, 9], [11, 6], [0, 10], [-11, 6], [-22, 9], [-33, 5], [-44, 8]];
const POLE_X = -22;
const POLE_TOP = -52;
const ARM_X = 26;
const ARM_Y = -42;
const BOARD_W = 48;
const BOARD_H = 20;
const BOX_W = 150;
const BOX_H = 112;
const CX = 75;
const CY = 62;
const SCALE = 0.88;

function smooth(points: number[][]): string {
  const n = points.length;
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(points[n - 1], points[0]);
  let d = `M${m[0]} ${m[1]}`;
  for (let i = 0; i < n; i++) {
    m = mid(points[i], points[(i + 1) % n]);
    d += `Q${points[i][0]} ${points[i][1]} ${m[0]} ${m[1]}`;
  }
  return `${d}Z`;
}
const ISLAND_D = smooth(ISLAND);
const GRASS_D = smooth(GRASS);

export const ISLAND_WIDTH = BOX_W * SCALE;
/** From the top of the box to the ground line. */
export const ISLAND_GROUND = CY * SCALE;

const Ground = memo(function Ground({ colors }: { colors: IslandColors }) {
  return (
    <>
      <Path d={ISLAND_D} fill={colors.rock} />
      <Circle cx={-30} cy={41} r={3} fill={colors.rock} />
      <Circle cx={20} cy={37} r={2.4} fill={colors.rock} />
      <Circle cx={2} cy={45} r={1.8} fill={colors.rock} />
      <Path d={GRASS_D} fill={colors.grass} />
      <Path d={`M${ARM_X} -4L${ARM_X} ${ARM_Y}M${ARM_X - 26} ${ARM_Y}L${ARM_X + 26} ${ARM_Y}M${POLE_X} -4L${POLE_X} ${POLE_TOP}`} stroke={colors.post} strokeWidth={2.3} strokeLinecap="round" fill="none" />
      <Circle cx={POLE_X} cy={POLE_TOP - 1} r={2.3} fill={colors.post} />
    </>
  );
});

/**
 * A little island floating in the gap at the top of Home. Its windsock fills with the song's energy, and its sign swings
 * in the wind and flips between the song's tempo and key, the same clues the card already shows.
 */
export function SkyIsland({
  left,
  top,
  colors,
  clock,
  wind,
  sign,
  front,
  back,
}: {
  left: number;
  top: number;
  colors: IslandColors;
  clock: SharedValue<number>;
  wind: SharedValue<number>;
  sign: SharedValue<SignState>;
  front: string;
  back: string;
}) {
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: Math.sin(clock.get() * 0.8) * 2.6 }] }));
  const sock = useAnimatedProps(() => ({ d: sockPaths(POLE_X, POLE_TOP + 2, wind.get(), clock.get()).red }));
  const sockWhite = useAnimatedProps(() => ({ d: sockPaths(POLE_X, POLE_TOP + 2, wind.get(), clock.get()).white }));
  const h = BOARD_H * SCALE;
  const board = useAnimatedStyle(() => {
    const cs = Math.cos(sign.get().theta);
    return { transform: [{ translateY: -h / 2 }, { scaleY: Math.abs(cs) < 0.04 ? 0.04 : cs }, { translateY: h / 2 }] };
  });
  // Past edge-on the board is seen from behind and hangs above its arm, so the words turn over to stay readable.
  const words = useAnimatedStyle(() => ({ transform: [{ scaleY: Math.cos(sign.get().theta) < 0 ? -1 : 1 }] }));
  const showFront = useAnimatedStyle(() => ({ opacity: signFace(sign.get().theta) % 2 === 0 ? 1 : 0 }));
  const showBack = useAnimatedStyle(() => ({ opacity: signFace(sign.get().theta) % 2 === 0 ? 0 : 1 }));
  const boardBox = useMemo(
    () => ({ left: (CX + ARM_X - BOARD_W / 2) * SCALE, top: (CY + ARM_Y + 1) * SCALE, width: BOARD_W * SCALE, height: h, backgroundColor: colors.sign }),
    [colors.sign, h]
  );
  return (
    <Animated.View style={[styles.box, { left, top }, float]} pointerEvents="none">
      <Svg width={BOX_W * SCALE} height={BOX_H * SCALE} viewBox={`${-CX} ${-CY} ${BOX_W} ${BOX_H}`}>
        <Ground colors={colors} />
        <AnimatedPath animatedProps={sock} fill="#e63946" />
        <AnimatedPath animatedProps={sockWhite} fill={colors.white} />
      </Svg>
      <Animated.View style={[styles.board, boardBox, board]}>
        <Animated.View style={[StyleSheet.absoluteFill, words]}>
          <Animated.View style={[styles.face, showFront]}>
            <Text style={[styles.word, { color: colors.signText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {front}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.face, showBack]}>
            <Text style={[styles.word, { color: colors.signText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {back}
            </Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: BOX_W * SCALE, height: BOX_H * SCALE },
  board: { position: 'absolute', borderRadius: 2, overflow: 'hidden' },
  face: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  word: { fontFamily: Fonts.sansSemiBold, fontSize: 9.5, lineHeight: 12 },
});
