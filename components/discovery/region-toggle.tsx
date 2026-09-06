import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Region } from '@/lib/discovery';

type RegionToggleProps = {
  region: Region;
  onToggle: () => void;
};

/**
 * Persistent bottom-left pill — the one corner Undo (top-left), the genre
 * picker (top-right), and Liked (bottom-right) don't already occupy. Shows
 * the current storefront; tap flips it. A plain toggle rather than a picker
 * because only two storefronts have actually been verified to diverge — see
 * docs/superpowers/specs/2026-09-05-region-storefront-design.md.
 */
export function RegionToggle({ region, onToggle }: RegionToggleProps) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.wrapper}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          {region}
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    zIndex: 1,
  },
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  text: {
    color: Colors.textSecondary,
  },
});
