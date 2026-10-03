import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { BAND_STARTS, UNITS, type Unit } from '@/lib/rewind';

const HEIGHT = 58;
const THUMB = 24;
/** The thumb rides low so it never covers the zone names along the top. */
const RAIL = HEIGHT - 8 - THUMB / 2;

type Props = {
  /** How far the thumb is from the middle, in points (negative = toward earlier). */
  dx: SharedValue<number>;
  /** Wiggles when a step has nowhere to go. */
  shake: SharedValue<number>;
  /** Half the strip's width: the distance from the middle to either end. */
  half: number;
  /** The zone the finger is in: 1 day, 2 month, 3 year; negative is earlier. 0 is none. */
  band: number;
  canGo: (unit: Unit, dir: -1 | 1) => boolean;
  onTap: (unit: Unit, dir: -1 | 1) => void;
};

/**
 * The visible half of Rewind: DAY · MONTH · YEAR on both sides of a thumb.
 * Drag anywhere on the page and the thumb follows; the further it goes, the
 * bigger the step. Every zone is also a button, so tapping works too.
 */
export function RewindStrip({ dx, shake, half, band, canGo, onTap }: Props) {
  const reach = half - THUMB / 2 - 2;
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(-reach, Math.min(reach, dx.get())) }, { scale: dx.get() === 0 ? 1 : 1.12 }],
  }));
  const wiggle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const zones = ([-1, 1] as const).flatMap((dir) =>
    UNITS.map((unit, i) => {
      const from = BAND_STARTS[unit] * half;
      const to = (i < UNITS.length - 1 ? BAND_STARTS[UNITS[i + 1]] : 1) * half;
      const on = band === dir * (i + 1);
      const open = canGo(unit, dir);
      return (
        <Pressable
          key={`${dir}${unit}`}
          disabled={!open}
          onPress={() => onTap(unit, dir)}
          accessibilityLabel={`${dir < 0 ? 'Back' : 'Ahead'} a ${unit}`}
          style={[
            styles.zone,
            { left: half + (dir < 0 ? -to : from), width: to - from },
            on && (open ? styles.zoneOn : styles.zoneDead),
          ]}>
          <ThemedText style={[styles.zoneText, !open && styles.zoneOff, on && open && styles.zoneTextOn]}>{unit}</ThemedText>
        </Pressable>
      );
    })
  );

  return (
    <Animated.View style={[{ width: 2 * half }, wiggle]}>
      <View style={styles.track}>
        <View style={styles.line} />
        {zones}
        <Animated.View pointerEvents="none" style={[styles.thumb, { left: half - THUMB / 2 }, thumb]}>
          <View style={styles.hub} />
        </Animated.View>
      </View>
      <View style={styles.ends}>
        <ThemedText style={styles.end}>Earlier</ThemedText>
        <ThemedText style={styles.end}>Later</ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: RAIL - 0.5,
    height: 1,
    backgroundColor: Colors.rule,
  },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 8,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  zoneOn: {
    backgroundColor: Colors.accent,
  },
  // Dragged into a step that has nowhere to go: lit, but not cream.
  zoneDead: {
    backgroundColor: Colors.surfaceElevated,
  },
  zoneText: {
    ...Ui.label,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  zoneTextOn: {
    color: Colors.accentText,
  },
  zoneOff: {
    color: Colors.textTertiary,
  },
  thumb: {
    position: 'absolute',
    top: RAIL - 1 - THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.round,
    backgroundColor: Colors.accent,
    // Navy edge so it still shows on a lit (cream) zone.
    borderWidth: 2,
    borderColor: Colors.accentText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hub: {
    width: 8,
    height: 8,
    borderRadius: Radius.round,
    backgroundColor: Colors.signal,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  end: {
    ...Ui.label,
    fontSize: 10,
    color: Colors.textTertiary,
  },
});
