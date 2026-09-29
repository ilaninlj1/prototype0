import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Region } from '@/lib/discovery';
import type { PresetId } from '@/lib/pool-types';
import { PRESET_LABELS, PresetChips } from './preset-chips';
import { RegionToggle } from './region-toggle';
import { SteeringRow } from './steering-row';

type TuneSheetProps = {
  preset: PresetId;
  presetLoading: boolean;
  region: Region;
  onSelectPreset: (preset: PresetId) => void;
  onToggleRegion: () => void;
  onMoreFromArtist: () => void;
  onMoreLikeSound: () => void;
};

/** One "Tune" button holding every feed control, so the main screen is just the card. */
export function TuneSheet({
  preset,
  presetLoading,
  region,
  onSelectPreset,
  onToggleRegion,
  onMoreFromArtist,
  onMoreLikeSound,
}: TuneSheetProps) {
  const [visible, setVisible] = useState(false);

  function close() {
    setVisible(false);
  }

  function steer(action: () => void) {
    close();
    action();
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
              Steer from this song
            </ThemedText>
            <SteeringRow onArtist={() => steer(onMoreFromArtist)} onSound={() => steer(onMoreLikeSound)} />

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
  regionRow: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
