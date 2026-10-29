import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader, sheetStyles } from '@/components/ui/sheet';
import { Colors, Fonts, Spacing, TapTarget, Ui } from '@/constants/theme';
import { tuneSummary } from '@/lib/home-copy';
import type { Region } from '@/lib/discovery';
import { setAllowAi, useAllowAi } from '@/lib/human-check-api';
import type { NetworkTest } from '@/lib/feed-load';
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
  /** Make the feed's loading slow or fail on purpose, to see the loading screens. Not saved. */
  networkTest: NetworkTest;
  onChangeNetworkTest: (mode: NetworkTest) => void;
  /** 'icon': a round icon button for Home's top bar instead of the labeled one. */
  trigger?: 'button' | 'icon';
  /** Told every time the sheet opens or closes (Home keeps its buttons up while a sheet is open). */
  onOpenChange?: (open: boolean) => void;
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
  networkTest,
  onChangeNetworkTest,
  trigger = 'button',
  onOpenChange,
}: TuneSheetProps) {
  const [visible, setVisibleState] = useState(false);
  const setVisible = (open: boolean) => {
    setVisibleState(open);
    onOpenChange?.(open);
  };
  const allowAi = useAllowAi();

  function close() {
    setVisible(false);
  }


  const [more, setMore] = useState(false);
  const sorted = isActive(soundFilter);
  const summary = tuneSummary(PRESET_LABELS[preset], sorted ? describeFilter(soundFilter) : null);

  return (
    <>
      {trigger === 'icon' ? (
        <TouchableOpacity
          onPress={() => setVisible(true)}
          activeOpacity={0.6}
          style={styles.iconTrigger}
          accessibilityRole="button"
          accessibilityLabel={`Tune: ${summary}`}>
          <Ionicons name="options-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.6} style={Ui.outlineButton}>
          <ThemedText style={Ui.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Tune · {PRESET_LABELS[preset]}
          </ThemedText>
        </TouchableOpacity>
      )}

      <BottomSheet visible={visible} onClose={close}>
        <SheetHeader title="Tune" onDone={close} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ThemedText style={styles.summary} accessibilityLiveRegion="polite">
            {summary}
          </ThemedText>

          <ThemedText style={sheetStyles.heading}>How well-known</ThemedText>
          <PresetChips activePreset={preset} loading={presetLoading} onSelect={onSelectPreset} />

          <ThemedText style={sheetStyles.heading}>What plays next</ThemedText>
          <Segment
            options={NEXT_MODES.map((o) => ({ key: o.mode, label: o.label }))}
            value={nextMode}
            onChange={onSetNextMode}
            label="What plays next"
          />
          <ThemedText type="caption">{NEXT_MODES.find((o) => o.mode === nextMode)?.hint}</ThemedText>

          <View style={styles.soundHead}>
            <ThemedText style={sheetStyles.heading}>Sound</ThemedText>
            {sorted && (
              <Pressable
                onPress={() => onChangeSoundFilter(Object.fromEntries(DIMENSIONS.map((d) => [d.key, 'any'])) as SoundFilter)}
                style={styles.reset}
                accessibilityRole="button"
                accessibilityLabel="Reset sound to any">
                <ThemedText style={styles.resetText}>Reset sound</ThemedText>
              </Pressable>
            )}
          </View>
          {DIMENSIONS.map((d) => (
            <View key={d.key} style={styles.soundRow}>
              <ThemedText style={styles.soundLabel}>{d.label}</ThemedText>
              <View style={styles.soundSegment}>
                <Segment
                  options={(['low', 'any', 'high'] as Level[]).map((level) => ({ key: level, label: level === 'low' ? d.low : level === 'high' ? d.high : 'Any' }))}
                  value={soundFilter[d.key]}
                  onChange={(level) => onChangeSoundFilter({ ...soundFilter, [d.key]: level })}
                  label={d.label}
                  small
                />
              </View>
            </View>
          ))}
          <ThemedText type="caption">
            {sorted
              ? `Only ${describeFilter(soundFilter)} songs, measured from how they sound. Stays on through genre jumps.`
              : 'Pick how you want the next songs to sound. Measured by ReccoBeats, not by genre.'}
          </ThemedText>

          <Pressable
            onPress={() => setMore((m) => !m)}
            style={styles.moreRow}
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            accessibilityLabel="More settings: store region, AI-made music, test network">
            <ThemedText style={styles.moreText}>More</ThemedText>
            <ThemedText style={styles.moreHint} numberOfLines={1}>
              {region} store · AI {allowAi ? 'shown' : 'hidden'}
            </ThemedText>
            <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
          </Pressable>
          {more && (
            <>
              <View style={styles.regionRow}>
                <ThemedText style={styles.rowLabel}>Store region</ThemedText>
                <RegionToggle region={region} onToggle={onToggleRegion} />
              </View>

              <ThemedText style={sheetStyles.heading}>AI-made music</ThemedText>
              <Segment
                options={[
                  { key: 'hide', label: 'Hide' },
                  { key: 'show', label: 'Show' },
                ]}
                value={allowAi ? 'show' : 'hide'}
                onChange={(v) => setAllowAi(v === 'show')}
                label="AI-made music"
              />
              <ThemedText type="caption">
                {allowAi
                  ? 'AI acts can show up. They’re labeled “AI-tagged” when revealed.'
                  : 'Skips artists that listeners have tagged as AI-made. Real people only.'}
              </ThemedText>

              <ThemedText style={sheetStyles.heading}>Test network</ThemedText>
              <Segment
                options={[
                  { key: 'off', label: 'Off' },
                  { key: 'slow', label: 'Slow' },
                  { key: 'offline', label: 'Offline' },
                ]}
                value={networkTest}
                onChange={(mode) => onChangeNetworkTest(mode as NetworkTest)}
                label="Test network"
              />
              <ThemedText type="caption">
                For trying the loading screens: makes loading new songs slow or fail on purpose. Songs already playing aren’t affected. Turns off when you close the app.
              </ThemedText>
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

/** A pill segmented control: grey track, the chosen option black. */
function Segment<K extends string>({
  options,
  value,
  onChange,
  label,
  small = false,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <View style={sheetStyles.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[sheetStyles.segmentItem, on && sheetStyles.segmentOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={`${label}: ${o.label}`}>
            <ThemedText
              style={[sheetStyles.segmentText, small && styles.segmentSmall, on && sheetStyles.segmentTextOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  iconTrigger: { width: TapTarget, height: TapTarget, borderRadius: TapTarget / 2, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  summary: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 23, color: Colors.textSecondary },
  soundHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  reset: { minHeight: 32, paddingHorizontal: Spacing.md, borderRadius: 16, justifyContent: 'center', backgroundColor: Colors.surface },
  resetText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.text },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  soundLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 14, width: 72, color: Colors.textSecondary },
  soundSegment: { flex: 1 },
  segmentSmall: { fontSize: 13 },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TapTarget,
    marginTop: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  moreText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  moreHint: { flex: 1, fontSize: 13, color: Colors.textSecondary, textAlign: 'right' },
  regionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  rowLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
});
