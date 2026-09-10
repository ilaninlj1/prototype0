import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

type LikedTracksButtonProps = {
  onPress: () => void;
};

/** Utility-row pill, alongside RegionToggle — see the utility row in app/(tabs)/index.tsx. A quiet utility action, same treatment as UndoButton. */
export function LikedTracksButton({ onPress }: LikedTracksButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          Liked
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
