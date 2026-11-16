// Your coral, seen from Home: it grows up from the bottom left of the water, the side the shore is on, in the colors
// of the songs you joined. It sways, pulses with the playing song, and a tap takes you to the shore. Drawn with
// react-native-svg like the rest of Home's sea, so Home never loads Skia for it.

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useCoral } from '@/hooks/use-coral';

export const HOME_CORAL_W = 104;
export const HOME_CORAL_H = 84;
/** Coral with no songs joined yet: pale, the way it is before anything lives on it. */
const BARE = ['#e6eef0', '#d3e0e3'];
const MAX_SPRIGS = 5;

const pale = (hex: string, t: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
};

type Sprig = { d: string; tips: { x: number; y: number }[]; color: string };

/** One forked sprig per color, rising from the bottom edge. The same colors always draw the same coral. */
export function homeSprigs(colors: string[]): Sprig[] {
  const list = colors.slice(0, MAX_SPRIGS);
  return list.map((color, i) => {
    const x = 16 + i * (list.length > 3 ? 16 : 22);
    // Rooted below the bottom edge of the screen, so it rises out of the water with nothing under it.
    const y = HOME_CORAL_H + 4;
    const tall = 52 - (i % 3) * 11;
    const lean = (i % 2 ? 1 : -1) * 3;
    const fork = { x: x + lean, y: y - tall * 0.55 };
    const tips = [
      { x: fork.x - 8, y: y - tall },
      { x: fork.x + 1, y: y - tall - 5 },
      { x: fork.x + 9, y: y - tall + 3 },
    ];
    const d = `M${x} ${y}L${fork.x} ${fork.y}` + tips.map((t) => `M${fork.x} ${fork.y}L${t.x} ${t.y}`).join('');
    return { d, tips, color };
  });
}

export function HomeCoral({ tempo, playing, onPress }: { tempo: number; playing: boolean; onPress: () => void }) {
  const { links } = useCoral();
  const reduceMotion = useReducedMotion();
  const colors = useMemo(() => {
    const seen = [...new Set(links.flatMap((l) => [l.a.color, l.b.color]))];
    return seen.length ? seen : BARE;
  }, [links]);
  const sprigs = useMemo(() => homeSprigs(colors), [colors]);

  const sway = useSharedValue(0);
  const beat = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      sway.set(0);
      return;
    }
    sway.set(-1);
    sway.set(withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(sway);
  }, [reduceMotion, sway]);
  useEffect(() => {
    if (reduceMotion || !playing || !(tempo > 0)) {
      beat.set(withTiming(1, { duration: 200 }));
      return;
    }
    const ms = Math.max(280, 60000 / tempo);
    beat.set(withRepeat(withSequence(withTiming(1.07, { duration: 110 }), withTiming(1, { duration: ms - 110 })), -1, false));
    return () => cancelAnimation(beat);
  }, [reduceMotion, playing, tempo, beat]);
  const move = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get() * 2.2}deg` }, { scaleY: beat.get() }] }));

  return (
    <Pressable
      onPress={onPress}
      style={styles.corner}
      hitSlop={{ top: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={links.length ? 'Your coral. Go to the shore to play it.' : 'The shore. Join two saved songs and coral grows here.'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.grown, move]}>
        <Svg width={HOME_CORAL_W} height={HOME_CORAL_H}>
          {sprigs.map((s, i) => (
            <Path key={`d${i}`} d={s.d} stroke={s.color} strokeWidth={5} strokeLinecap="round" fill="none" />
          ))}
          {sprigs.flatMap((s, i) => s.tips.map((t, k) => <Circle key={`t${i}-${k}`} cx={t.x} cy={t.y} r={3.4} fill={pale(s.color, 0.45)} />))}
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', left: 0, bottom: 0, width: HOME_CORAL_W, height: HOME_CORAL_H },
  grown: { transformOrigin: 'left bottom' },
});
