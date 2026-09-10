import { StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
};

/**
 * Persistent top-left pill button — a quiet utility action, so it recedes
 * rather than competing with the card. Dimmed and inert when there's nothing
 * to undo. Floats over the card, so it needs its own safe-area top inset
 * rather than relying on the screen container's padding.
 */
export function UndoButton({ disabled, onPress }: UndoButtonProps) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.wrapper, { top: insets.top + Spacing.lg }, disabled && styles.disabled]}>
      <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
        <ThemedText type="label" style={styles.text}>
          Undo
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.lg,
    zIndex: 1,
  },
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
