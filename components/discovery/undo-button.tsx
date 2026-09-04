import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
};

/** Persistent top-left pill button — dimmed and inert when there's nothing to undo. */
export function UndoButton({ disabled, onPress }: UndoButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.wrapper, disabled && styles.disabled]}>
      <ThemedView style={styles.button} lightColor="#2a2a2a" darkColor="#2a2a2a">
        <ThemedText style={styles.buttonText}>Undo</ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 1,
  },
  disabled: {
    opacity: 0.35,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
