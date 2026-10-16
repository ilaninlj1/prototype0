import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DarkMap } from '@/components/map/dark-map';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { MapView } from '@/lib/dark-map';
import { loadMapView } from '@/lib/dark-map-app';

/** You → Discoveries: a still of your Dark Map and how much of it you've lit. Tapping opens the map. */
export function DarkMapCard({ width, onOpen }: { width: number; onOpen: () => void }) {
  const [view, setView] = useState<MapView | null>(null);
  useFocusEffect(
    useCallback(() => {
      loadMapView().then(setView);
    }, [])
  );
  if (!view) return null;
  const pct = Math.round(view.litShare * 100);
  // A still: no new lights to bloom here, the map screen does that.
  const lights = view.lights.map((l) => ({ ...l, fresh: false }));
  return (
    <Pressable onPress={onOpen} style={styles.card} accessibilityRole="button" accessibilityLabel={`Dark map, ${pct} percent lit. Open the map`}>
      <View pointerEvents="none">
        <DarkMap
          width={width}
          height={Math.round(width * 0.62)}
          dots={view.dots}
          lights={lights}
          regions={[]}
          lens={null}
          lensRadius={0}
          onTap={() => {}}
          onBloomDone={() => {}}
          label="Dark map"
          interactive={false}
        />
      </View>
      <View style={styles.row}>
        <ThemedText style={styles.mono}>DARK MAP</ThemedText>
        <ThemedText style={styles.mono}>{pct}% LIT</ThemedText>
      </View>
      <ThemedText style={styles.dim}>Everything still dark is your blind spot. Tap to open the map.</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.hairline, marginBottom: Spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  mono: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, color: Colors.text },
  dim: { fontSize: 13, color: Colors.textSecondary, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
});
