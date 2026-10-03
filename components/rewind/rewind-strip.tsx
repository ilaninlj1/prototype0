import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { BAND_STARTS, UNITS, zoneLabel, type Unit } from '@/lib/rewind';

const HEIGHT = 82;
const THUMB = 24;
/** The thumb rides low so it never covers the zone names and dates along the top. */
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
  /** Where each step would land (any time on that day), or null when there's nowhere to go. */
  landsOn: (unit: Unit, dir: -1 | 1) => number | null;
  onTap: (unit: Unit, dir: -1 | 1) => void;
};

/**
 * The visible half of Rewind: DAY · MONTH · YEAR on both sides of a thumb, each
 * with the date (and year) it lands on. Drag anywhere on the page and the thumb follows; the
 * further it goes, the bigger the step. Every zone is also a button, so tapping works too.
 */
export function RewindStrip({ dx, shake, half, band, landsOn, onTap }: Props) {
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
      const landed = landsOn(unit, dir);
      const open = landed != null;
      const label = zoneLabel(unit, landed);
      return (
        <Pressable
          key={`${dir}${unit}`}
          disabled={!open}
          onPress={() => onTap(unit, dir)}
          accessibilityLabel={`${dir < 0 ? 'Back' : 'Ahead'} a ${unit}${open ? `, to ${label.date}` : ''}`}
          style={[
            styles.zone,
            { left: half + (dir < 0 ? -to : from), width: to - from },
            on && (open ? styles.zoneOn : styles.zoneDead),
          ]}>
          {/* Name, date, year: six characters at most, so it fits a 360pt phone; shrinks rather than wraps if not. */}
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.zoneName, !open && styles.zoneOff, on && open && styles.zoneTextOn]}>
            {label.name}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.zoneDate, !open && styles.zoneOff, on && open && styles.zoneTextOn]}>
            {label.date}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.zoneName, !open && styles.zoneOff, on && open && styles.zoneTextOn]}>
            {label.year}
          </ThemedText>
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
    paddingTop: 7,
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
  zoneName: {
    ...Ui.label,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
    paddingHorizontal: 2,
  },
  zoneDate: {
    ...Ui.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    paddingHorizontal: 2,
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
