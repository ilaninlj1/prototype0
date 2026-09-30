import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Ui } from '@/constants/theme';
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
    <TouchableOpacity onPress={onToggle} activeOpacity={0.6} style={Ui.outlineButton}>
      <ThemedText style={styles.text}>{region}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  text: {
    ...Ui.label,
    color: Colors.text,
  },
});