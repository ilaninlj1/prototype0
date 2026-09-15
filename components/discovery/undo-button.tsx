import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
};

/**
 * A quiet utility action, so it recedes rather than competing with the
 * card. Dimmed and inert when there's nothing to undo. Positioning is the
 * caller's job (app/(tabs)/index.tsx's absolutely-positioned header
 * overlay, alongside GenrePicker's trigger) — this component is a plain
 * flow element with no opinion on where it sits, so that overlay can lay
 * it out relative to its siblings instead of every header control guessing
 * its own screen position independently.
 */
export function UndoButton({ disabled, onPress }: UndoButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7} style={disabled && styles.disabled}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          Undo
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.35,
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
