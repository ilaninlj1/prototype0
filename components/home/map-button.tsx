import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Ui } from '@/constants/theme';

/** Opens the Dark Map and shows how much of it you've lit. A thin cream outline, matching Tune and Liked. */
export function MapButton({ share, onPress }: { share: number | null; onPress: () => void }) {
  const pct = share == null ? null : Math.round(share * 100);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[Ui.outlineButton, styles.tight]}
      accessibilityRole="button"
      accessibilityLabel={pct == null ? 'Dark map' : `Dark map, ${pct} percent lit`}>
      <ThemedText style={Ui.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {pct == null ? 'Map' : `Map · ${pct}%`}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // A quarter of the row: less side padding, so "MAP · 100%" fits on a 360pt phone.
  tight: { paddingHorizontal: Spacing.xs },
});
