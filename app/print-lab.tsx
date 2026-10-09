import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePrint } from '@/components/print/live-print';
import { PrintStill } from '@/components/print/print-still';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { recipeFor, type PrintRecipe } from '@/lib/print-recipe';
import type { SoundFeatures } from '@/lib/sound';

// Dev only: six fixed recipes side by side, moving and settled, to judge the prints.
const loud: SoundFeatures = {
  tempo: 148, key: 1, mode: 1, energy: 0.9, danceability: 0.4, acousticness: 0.01, instrumentalness: 0,
  speechiness: 0.07, liveness: 0.1, valence: 0.2, loudness: -4,
};
const SAMPLES: { name: string; recipe: PrintRecipe }[] = [
  { name: '148 BPM · C♯ major, loud', recipe: recipeFor(1, loud, null) },
  { name: 'Same song in minor', recipe: recipeFor(1, { ...loud, mode: 0 }, null) },
  { name: 'Calm acoustic, 72 BPM', recipe: recipeFor(3, { ...loud, tempo: 72, energy: 0.2, acousticness: 0.8, loudness: -16, key: 9, mode: 0 }, null) },
  { name: 'Dyad (mode unknown)', recipe: recipeFor(4, { ...loud, mode: null }, null) },
  { name: 'Neutral (key unknown)', recipe: recipeFor(5, { ...loud, key: null, mode: null }, { hue: 30, neutral: false }) },
  { name: 'Cover fallback', recipe: recipeFor(6, null, { hue: 200, neutral: false }) },
];

export default function PrintLab() {
  const insets = useSafeAreaInsets();
  const clock = useSharedValue(0);
  const gather = useSharedValue(0);
  const [gathered, setGathered] = useState(false);
  useFrameCallback((f) => {
    if (f.timeSincePreviousFrame) clock.set(clock.get() + f.timeSincePreviousFrame / 1000);
  });
  const samples = useMemo(() => SAMPLES, []);
  if (!__DEV__) return null;

  function toggle() {
    gather.set(withTiming(gathered ? 0 : 1, { duration: 300 }));
    setGathered(!gathered);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, padding: Spacing.lg, gap: Spacing.xl }}>
      <Pressable style={Ui.outlineButton} onPress={toggle}>
        <ThemedText style={Ui.label}>{gathered ? 'Let them flow' : 'Gather (reveal)'}</ThemedText>
      </Pressable>
      {samples.map((s) => (
        <View key={s.name} style={styles.sample}>
          <ThemedText style={styles.name}>{s.name}</ThemedText>
          <ThemedText style={styles.label}>{s.recipe.label ?? 'no sound data'}</ThemedText>
          <View style={[styles.live, { backgroundColor: s.recipe.ground }]}>
            <LivePrint recipe={s.recipe} size={300} clock={clock} gather={gather} />
          </View>
          {/* Web allows ~16 WebGL contexts per page, so the lab shows one still per sample. */}
          <PrintStill recipe={s.recipe} size={140} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  sample: { gap: Spacing.sm },
  name: { color: Colors.text },
  label: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
  live: { width: 300, height: 300, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
});
