import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

type LikedTracksButtonProps = {
  onPress: () => void;
};

/** Persistent bottom-right pill button — Undo and the genre picker already occupy the top corners. A quiet utility action, same treatment as UndoButton. */
export function LikedTracksButton({ onPress }: LikedTracksButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.wrapper}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          Liked
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    zIndex: 1,
  },
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  text: {
    color: Colors.textSecondary,
  },
});
