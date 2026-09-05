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
export function SteeringRow({ onArtist, onSound }: SteeringRowProps) {
  return (
    <ThemedView style={styles.container} backgroundColor="transparent">
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">More like this sound</ThemedText>
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
    borderRadius: Radius.pill,
  },
});
