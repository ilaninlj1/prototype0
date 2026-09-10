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
 * Utility-row pill, alongside LikedTracksButton — see the utility row in
 * app/(tabs)/index.tsx. Shows the current storefront; tap cycles to the next
 * one. A plain cycling toggle rather than a picker, across the three
 * verified storefronts (US, MX, ZA) — see
 * docs/superpowers/specs/2026-09-05-region-storefront-design.md.
 */
export function RegionToggle({ region, onToggle }: RegionToggleProps) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          {region}
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  text: {
    color: Colors.textSecondary,
  },
});