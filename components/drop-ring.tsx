import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { DailyDropEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';

const SIZE = 54;
const STROKE = 3;

/** Instagram-story ring for today's drop: bright until you've played it, grey after. */
export function DropRing() {
  const router = useRouter();
  const daily = useDailyDrop();

  useFocusEffect(
    useCallback(() => {
      daily.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  if (!daily.drop) return null;
  const done = !daily.active && daily.guess != null;
  const href = daily.active ? '/drop-play' : daily.guess == null ? '/drop-guess' : '/drop-results';
  const r = (SIZE - STROKE) / 2;

  return (
    <Pressable onPress={() => router.push(href)} style={styles.wrap} accessibilityLabel={done ? "Today's drop, played" : "Today's drop, new"}>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="ring" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={Colors.signal} />
              <Stop offset="1" stopColor={Colors.highlight} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={done ? Colors.textTertiary : 'url(#ring)'}
            strokeWidth={done ? 1.5 : STROKE}
            fill="none"
          />
        </Svg>
        <View style={styles.face}>
          <DailyDropEmblem size={30} />
        </View>
      </View>
      <ThemedText style={[styles.label, { color: done ? Colors.textTertiary : Colors.text }]}>
        {done ? 'played' : `drop ${daily.drop.number}`}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  face: {
    width: SIZE - 10,
    height: SIZE - 10,
    borderRadius: (SIZE - 10) / 2,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: Fonts.monoMedium, fontSize: 10, lineHeight: 12, letterSpacing: 1, textTransform: 'uppercase' },
});
