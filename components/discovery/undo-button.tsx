import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Ui } from '@/constants/theme';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
};

/** Plain text, with a full-size tap area. */
export function UndoButton({ disabled, onPress }: UndoButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6} style={[Ui.textButton, disabled && styles.disabled]} accessibilityLabel="Undo the last swipe">
      <ThemedText style={styles.text}>Undo</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.35 },
  text: { ...Ui.label, color: Colors.textSecondary },
});
