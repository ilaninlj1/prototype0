import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';

const HEIGHT = 48;

type Props = {
  mode: 'blind' | 'revealed';
  saved: boolean;
  disabled?: boolean;
  onSkip: () => void;
  onJump: () => void;
  onMore: () => void;
  onSave: () => void;
  onDetails: () => void;
  onNext: () => void;
};

/**
 * The three things you can do with the card, always visible: the swipes,
 * spelled out. Each button runs exactly what its swipe runs. After the reveal
 * they become Save, Details and Next.
 */
export function ActionRow({ mode, saved, disabled = false, onSkip, onJump, onMore, onSave, onDetails, onNext }: Props) {
  if (mode === 'revealed') {
    return (
      <View style={styles.row}>
        <Button onPress={onSave} disabled={disabled} label={saved ? 'Saved' : 'Save'} a11y="Save this song">
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={16} color={saved ? Colors.signal : Colors.text} />
        </Button>
        <Button onPress={onDetails} disabled={disabled} label="Details" a11y="Song details" />
        <Button onPress={onNext} disabled={disabled} label="Next →" a11y="Next song" primary />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Button onPress={onSkip} disabled={disabled} label="← Skip" a11y="Skip this song" />
      <Button onPress={onJump} disabled={disabled} label="↓ New genre" a11y="Jump to a new genre" />
      <Button onPress={onMore} disabled={disabled} label="More like this →" a11y="More like this, and show who it is" primary />
    </View>
  );
}

function Button({
  onPress,
  disabled,
  label,
  a11y,
  primary = false,
  children,
}: {
  onPress: () => void;
  disabled: boolean;
  label: string;
  a11y: string;
  primary?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.button, primary && styles.primary, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 }]}>
      {children}
      <ThemedText style={[styles.label, primary && styles.primaryLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  button: {
    ...Ui.outlineButton,
    flex: 1,
    height: HEIGHT,
    minHeight: HEIGHT,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    flexDirection: 'row',
    gap: 6,
  },
  primary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  label: { ...Ui.label, textAlign: 'center' },
  primaryLabel: { color: Colors.accentText },
});
