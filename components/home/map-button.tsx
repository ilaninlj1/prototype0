import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TapTarget, Ui } from '@/constants/theme';

/**
 * Opens the Dark Map and shows how much of it you've lit: a thin outline, or
 * with `variant="icon"` a map icon and the % for Home's top bar.
 */
export function MapButton({ share, onPress, variant }: { share: number | null; onPress: () => void; variant?: 'icon' }) {
  const pct = share == null ? null : Math.round(share * 100);
  const a11y = pct == null ? 'Dark map' : `Dark map, ${pct} percent lit`;
  if (variant === 'icon') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.icon} accessibilityRole="button" accessibilityLabel={a11y}>
        <Ionicons name="map-outline" size={22} color={Colors.text} />
        {pct != null && <ThemedText style={styles.pct}>{pct}%</ThemedText>}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[Ui.outlineButton, styles.tight]} accessibilityRole="button" accessibilityLabel={a11y}>
      <ThemedText style={Ui.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {pct == null ? 'Map' : `Map · ${pct}%`}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // A quarter of the row: less side padding, so "MAP · 100%" fits on a 360pt phone.
  tight: { paddingHorizontal: Spacing.xs },
  icon: { minWidth: TapTarget, height: TapTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  pct: { fontSize: 12, lineHeight: 14, fontWeight: '600', color: Colors.textSecondary },
});
