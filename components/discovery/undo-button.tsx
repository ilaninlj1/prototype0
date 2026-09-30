import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Ui } from '@/constants/theme';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
};

/** A thin cream outline, 44px tall, like Tune and Liked. */
export function UndoButton({ disabled, onPress }: UndoButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6} style={[Ui.outlineButton, disabled && styles.disabled]} accessibilityLabel="Undo the last swipe">
      <Ionicons name="arrow-undo" size={14} color={Colors.text} />
      <ThemedText style={Ui.label}>Undo</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.35 },
});
