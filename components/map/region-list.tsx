import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { RegionStat } from '@/lib/dark-map';

/** The map's regions as a list, least heard first: what VoiceOver reads instead of the map. Picking one opens its spot. */
export function RegionList({ regions, onPick }: { regions: RegionStat[]; onPick: (region: number) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {regions.map((r) => (
        <Pressable
          key={r.region}
          onPress={() => onPick(r.region)}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={`${r.words.replace(/ · /g, ', ')}. ${r.heard} of ${r.songs} heard. Opens this spot.`}>
          <ThemedText style={styles.words}>{r.words.toUpperCase()}</ThemedText>
          <ThemedText style={styles.count}>
            {r.heard} of {r.songs} heard
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.sm },
  row: { borderWidth: 1, borderColor: Colors.hairline, borderRadius: 10, padding: Spacing.md, gap: 2 },
  words: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, color: Colors.text },
  count: { fontSize: 13, color: Colors.textSecondary },
});
