import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { PresetId } from '@/lib/pool-types';

// Shortened from the full intent strings ("their best, unknown to you", …)
// — those don't fit four-across on a phone. Still intent-flavored words,
// never axis coordinates ("obscure artist, top track"). A is still the
// default (set by the screen, not here) even though Mixed leads the row —
// Mixed is the neutral baseline the other four are compared against, which
// reads left-to-right as "here's unfiltered, here's how each preset
// differs from it," not as a 1st-place/default position.
const PRESET_LABELS: Record<PresetId, string> = {
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
      // Shrink-to-content, not stretched to the header's full width — the
      // header overlay is pointerEvents="box-none" specifically so empty
      // space passes taps through to the card underneath, which only
      // works if this ScrollView's own touch-capturing bounds stop where
      // its actual chips end. The parent column has no explicit
      // alignItems, so it defaults to 'stretch' — without this, a short
      // 4-chip row would still claim the full header width as its hit box.
      style={styles.scrollView}
      contentContainerStyle={styles.row}>
      {PRESET_ORDER.map((preset) => {
        const isActive = preset === activePreset;
        return (
          <TouchableOpacity key={preset} onPress={() => onSelect(preset)} activeOpacity={0.7} disabled={loading}>
            <ThemedView style={styles.chip} backgroundColor={isActive ? Colors.accent : Colors.surfaceElevated}>
              {isActive && loading ? (
                <ActivityIndicator size="small" color={Colors.accentText} />
              ) : (
                <ThemedText type="label" numberOfLines={1} style={isActive ? styles.textActive : styles.textInactive}>
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
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  row: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  chip: {
    minHeight: 36,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textActive: {
    color: Colors.accentText,
  },
  textInactive: {
    color: Colors.textSecondary,
  },
});
