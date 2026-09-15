import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

type SteeringRowProps = {
  onArtist: () => void;
  onSound: () => void;
};

// Always rendered alongside the card (by the parent's currentTrack check) —
// no visibility prop, no animation, no auto-dismiss. Steering isn't gated on
// liking (or any swipe) anymore, so there's nothing here to show or hide.
//
// Deliberately NOT styled like PresetChips (2026-09-15): these buttons and
// preset chips used to share the exact same filled-pill treatment
// (Radius.pill, Colors.surfaceElevated) and read as one group of six
// competing options. They're not — presets are a persistent mode (one
// stays lit until changed); steering is a one-shot action (fires once,
// nothing stays selected). Outlined rounded-rects here, filled pills there:
// a steering button can never look "selected" because nothing about it
// changes state, which is the point, not an oversight if it looks
// inconsistent with the chips.
export function SteeringRow({ onArtist, onSound }: SteeringRowProps) {
  return (
    <ThemedView style={styles.container} backgroundColor="transparent">
      <TouchableOpacity onPress={onArtist} activeOpacity={0.5}>
        <ThemedView style={styles.button} backgroundColor="transparent">
          <ThemedText type="label" style={styles.text}>
            More from this artist
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.5}>
        <ThemedView style={styles.button} backgroundColor="transparent">
          <ThemedText type="label" style={styles.text}>
            More like this sound
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  button: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    // Bumped up from Colors.border's usual rgba(255,255,255,0.08) — at that
    // opacity an outline-only button was nearly invisible against
    // Colors.background. Still clearly more subdued than a filled
    // Colors.surfaceElevated pill.
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  text: {
    color: Colors.textSecondary,
  },
});
