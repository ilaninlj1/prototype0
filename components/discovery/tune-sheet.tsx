import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Region } from '@/lib/discovery';
import type { PresetId } from '@/lib/pool-types';
import { PRESET_LABELS, PresetChips } from './preset-chips';
import { RegionToggle } from './region-toggle';

/** Where the feed goes next: the playing song's artist, its genre, or anywhere. */
export type NextMode = 'artist' | 'similar' | 'genre' | 'random';

const NEXT_MODES: { mode: NextMode; label: string; hint: string }[] = [
  { mode: 'artist', label: 'Artist', hint: "More songs by whoever you're hearing now." },
  { mode: 'similar', label: 'Similar', hint: 'Artists that fans of this one also play. Hops to a new one every 3 songs.' },
  { mode: 'genre', label: 'Genre', hint: 'Stay in this genre until you swipe down.' },
  { mode: 'random', label: 'Random', hint: 'A different genre every few songs.' },
];

type TuneSheetProps = {
  preset: PresetId;
  presetLoading: boolean;
  region: Region;
  onSelectPreset: (preset: PresetId) => void;
  onToggleRegion: () => void;
  nextMode: NextMode;
  onSetNextMode: (mode: NextMode) => void;
};

/** One "Tune" button holding every feed control, so the main screen is just the card. */
export function TuneSheet({
  preset,
  presetLoading,
  region,
  onSelectPreset,
  onToggleRegion,
  nextMode,
  onSetNextMode,
}: TuneSheetProps) {
  const [visible, setVisible] = useState(false);

  function close() {
    setVisible(false);
  }


  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.7}>
        <ThemedView style={styles.trigger} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label" style={styles.triggerText}>
            Tune · {PRESET_LABELS[preset]}
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="label">How well-known</ThemedText>
            <PresetChips activePreset={preset} loading={presetLoading} onSelect={onSelectPreset} />

            <ThemedText type="label" style={styles.heading}>
              Next songs
            </ThemedText>
            <ThemedView style={styles.segment} backgroundColor={Colors.surfaceElevated}>
              {NEXT_MODES.map((o) => {
                const active = nextMode === o.mode;
                return (
                  <TouchableOpacity key={o.mode} style={styles.segmentSlot} onPress={() => onSetNextMode(o.mode)} activeOpacity={0.7}>
                    <ThemedView style={styles.segmentItem} backgroundColor={active ? Colors.accent : 'transparent'}>
                      <ThemedText type="label" style={{ color: active ? Colors.accentText : Colors.textSecondary }}>
                        {o.label}
                      </ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                );
              })}
            </ThemedView>
            <ThemedText type="caption">{NEXT_MODES.find((o) => o.mode === nextMode)?.hint}</ThemedText>

            <ThemedView style={styles.regionRow} backgroundColor="transparent">
              <ThemedText type="label">Store region</ThemedText>
              <RegionToggle region={region} onToggle={onToggleRegion} />
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  triggerText: {
    color: Colors.text,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  heading: {
    marginTop: Spacing.lg,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 3,
  },
  segmentSlot: {
    flex: 1,
  },
  segmentItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill - 2,
    alignItems: 'center',
  },
  regionRow: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
