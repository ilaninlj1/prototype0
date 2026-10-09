import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, TapTarget, Ui } from '@/constants/theme';
import type { Region } from '@/lib/discovery';
import { setAllowAi, useAllowAi } from '@/lib/human-check-api';
import type { PresetId } from '@/lib/pool-types';
import { DIMENSIONS, describeFilter, isActive, type Level, type SoundFilter } from '@/lib/sound-filter';
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
  /** Sort by sound: five Low / Any / High switches over each song's measured sound. */
  soundFilter: SoundFilter;
  onChangeSoundFilter: (filter: SoundFilter) => void;
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
  soundFilter,
  onChangeSoundFilter,
}: TuneSheetProps) {
  const [visible, setVisible] = useState(false);
  const allowAi = useAllowAi();

  function close() {
    setVisible(false);
  }


  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.6} style={Ui.outlineButton}>
        <ThemedText style={Ui.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          Tune · {PRESET_LABELS[preset]}
        </ThemedText>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <ThemedText style={Ui.label}>How well-known</ThemedText>
            <PresetChips activePreset={preset} loading={presetLoading} onSelect={onSelectPreset} />

            <ThemedText style={[Ui.label, styles.heading]}>
              Next songs
            </ThemedText>
            <ThemedView style={styles.segment} backgroundColor="transparent">
              {NEXT_MODES.map((o) => {
                const active = nextMode === o.mode;
                return (
                  <TouchableOpacity key={o.mode} style={styles.segmentSlot} onPress={() => onSetNextMode(o.mode)} activeOpacity={0.7}>
                    <ThemedView style={styles.segmentItem} backgroundColor={active ? Colors.accent : 'transparent'}>
                      <ThemedText style={[Ui.label, { color: active ? Colors.accentText : Colors.textSecondary }]}>
                        {o.label}
                      </ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                );
              })}
            </ThemedView>
            <ThemedText type="caption">{NEXT_MODES.find((o) => o.mode === nextMode)?.hint}</ThemedText>

            <ThemedView style={styles.regionRow} backgroundColor="transparent">
              <ThemedText style={Ui.label}>Store region</ThemedText>
              <RegionToggle region={region} onToggle={onToggleRegion} />
            </ThemedView>

            <ThemedText style={[Ui.label, styles.heading]}>
              AI-made music
            </ThemedText>
            <ThemedView style={styles.segment} backgroundColor="transparent">
              {[false, true].map((show) => {
                const active = allowAi === show;
                return (
                  <TouchableOpacity key={String(show)} style={styles.segmentSlot} onPress={() => setAllowAi(show)} activeOpacity={0.7}>
                    <ThemedView style={styles.segmentItem} backgroundColor={active ? Colors.accent : 'transparent'}>
                      <ThemedText style={[Ui.label, { color: active ? Colors.accentText : Colors.textSecondary }]}>
                        {show ? 'Show' : 'Hide'}
                      </ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                );
              })}
            </ThemedView>
            <ThemedText type="caption">
              {allowAi
                ? 'AI acts can show up. They’re labeled “AI-tagged” when revealed.'
                : 'Skips artists that listeners have tagged as AI-made. Real people only.'}
            </ThemedText>

            <ThemedText style={[Ui.label, styles.heading]}>Sound</ThemedText>
            {DIMENSIONS.map((d) => (
              <View key={d.key} style={styles.soundRow}>
                <ThemedText style={styles.soundLabel}>{d.label}</ThemedText>
                <ThemedView style={[styles.segment, styles.soundSegment]} backgroundColor="transparent">
                  {(['low', 'any', 'high'] as Level[]).map((level) => {
                    const active = soundFilter[d.key] === level;
                    const word = level === 'low' ? d.low : level === 'high' ? d.high : 'Any';
                    return (
                      <TouchableOpacity
                        key={level}
                        style={styles.segmentSlot}
                        onPress={() => onChangeSoundFilter({ ...soundFilter, [d.key]: level })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${d.label}: ${word}`}>
                        <ThemedView style={styles.segmentItem} backgroundColor={active ? Colors.accent : 'transparent'}>
                          <ThemedText
                            style={[Ui.label, styles.soundWord, { color: active ? Colors.accentText : Colors.textSecondary }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}>
                            {word}
                          </ThemedText>
                        </ThemedView>
                      </TouchableOpacity>
                    );
                  })}
                </ThemedView>
              </View>
            ))}
            <ThemedText type="caption">
              {isActive(soundFilter)
                ? `Only ${describeFilter(soundFilter)} songs, measured from how they sound. Stays on through genre jumps.`
                : 'Pick how you want the next songs to sound. Measured by ReccoBeats, not by genre.'}
            </ThemedText>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Flat navy like every screen, set off by a thin rule instead of a raised box.
  sheet: {
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    maxHeight: '88%',
  },
  body: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  soundLabel: { ...Ui.label, width: 72, color: Colors.textSecondary },
  soundSegment: { flex: 1 },
  soundWord: { fontSize: 11, letterSpacing: 0.6 },
  heading: {
    marginTop: Spacing.lg,
  },
  // A thin outline around the options; the chosen one is filled cream.
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.sm,
    padding: 2,
  },
  segmentSlot: {
    flex: 1,
  },
  segmentItem: {
    minHeight: TapTarget - 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm - 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionRow: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
