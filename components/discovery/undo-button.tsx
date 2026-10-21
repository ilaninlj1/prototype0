import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, TapTarget, Ui } from '@/constants/theme';

type UndoButtonProps = {
  disabled: boolean;
  onPress: () => void;
  /** 'icon': a round icon button for Home's top bar instead of the labeled outline. */
  variant?: 'icon';
};

/** A thin outline, 44px tall; or, as `variant="icon"`, just the arrow, like Map and Tune beside it. */
export function UndoButton({ disabled, onPress, variant }: UndoButtonProps) {
  if (variant === 'icon') {
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6} style={[styles.icon, disabled && styles.disabled]} accessibilityLabel="Undo the last swipe">
        <Ionicons name="arrow-undo" size={22} color={Colors.text} />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6} style={[Ui.outlineButton, disabled && styles.disabled]} accessibilityLabel="Undo the last swipe">
      <Ionicons name="arrow-undo" size={14} color={Colors.text} />
      <ThemedText style={Ui.label}>Undo</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.35 },
  icon: { width: TapTarget, height: TapTarget, alignItems: 'center', justifyContent: 'center' },
});
