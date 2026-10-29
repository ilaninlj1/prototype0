import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Ui } from '@/constants/theme';
import type { PresetId } from '@/lib/pool-types';

// Shortened from the full intent strings ("their best, unknown to you", …)
// — those don't fit four-across on a phone. Still intent-flavored words,
// never axis coordinates ("obscure artist, top track"). A is still the
// default (set by the screen, not here) even though Mixed leads the row —
// Mixed is the neutral baseline the other four are compared against, which
// reads left-to-right as "here's unfiltered, here's how each preset
// differs from it," not as a 1st-place/default position.
export const PRESET_LABELS: Record<PresetId, string> = {
  M: 'Mixed',
  A: 'Hidden gems',
  B: 'Deep cuts',
  C: 'Popular',
  D: 'Buried',
};
const PRESET_ORDER: PresetId[] = ['M', 'A', 'B', 'C', 'D'];

type PresetChipsProps = {
  activePreset: PresetId;
  /** True while a preset switch's refill is in flight — shows a spinner on the newly-active chip and disables all of them, rather than looking tappable mid-fetch. */
  loading: boolean;
  onSelect: (preset: PresetId) => void;
};

export function PresetChips({ activePreset, loading, onSelect }: PresetChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Bleeds to the sheet's edges, so the last chip scrolls in from the edge instead of being cut at the margin.
      style={styles.scrollView}
      contentContainerStyle={styles.row}>
      {PRESET_ORDER.map((preset) => {
        const isActive = preset === activePreset;
        return (
          <TouchableOpacity key={preset} onPress={() => onSelect(preset)} activeOpacity={0.7} disabled={loading} accessibilityRole="button" accessibilityState={{ selected: isActive, busy: isActive && loading }}>
            <ThemedView style={[styles.chip, isActive && styles.chipActive]} backgroundColor={isActive ? Colors.accent : Colors.surface}>
              {isActive && loading ? (
                <ActivityIndicator size="small" color={Colors.accentText} />
              ) : (
                <ThemedText numberOfLines={1} style={[Ui.label, isActive ? styles.textActive : styles.textInactive]}>
                  {PRESET_LABELS[preset]}
                </ThemedText>
              )}
            </ThemedView>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    marginHorizontal: -Spacing.xl,
    flexGrow: 0,
  },
  row: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  // Grey pills; the chosen one is black.
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.accent,
  },
  textActive: {
    color: Colors.accentText,
  },
  textInactive: {
    color: Colors.text,
  },
});
