import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DarkMap } from '@/components/map/dark-map';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
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
        <ThemedText style={styles.title}>Dark map</ThemedText>
        <ThemedText style={styles.mono}>{pct}% lit</ThemedText>
      </View>
      <ThemedText style={styles.dim}>Everything still dark is your blind spot. Tap to open the map.</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The map itself is a dark tile (sound art always sits on dark); its words sit under it on the grey card.
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: Colors.surface, marginBottom: Spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  mono: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.text },
  dim: { fontSize: 13, color: Colors.textSecondary, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
});
