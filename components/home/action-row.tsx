import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

const SMALL = 56;
const BIG = 72;

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
 * The three things you can do with the card: the swipes, spelled out as round
 * buttons with a word under each. Each one runs exactly what its swipe runs.
 * After the reveal they become Save, Details and Next. The main one is bigger
 * and black.
 */
export function ActionRow({ mode, saved, disabled = false, onSkip, onJump, onMore, onSave, onDetails, onNext }: Props) {
  if (mode === 'revealed') {
    return (
      <View style={styles.row}>
        <Button onPress={onSave} disabled={disabled} label={saved ? 'Saved' : 'Save'} a11y={saved ? 'Saved' : 'Save this song'} icon={saved ? 'heart' : 'heart-outline'} iconColor={saved ? Colors.signal : undefined} />
        <Button onPress={onDetails} disabled={disabled} label="Details" a11y="Song details" icon="information-circle-outline" />
        <Button onPress={onNext} disabled={disabled} label="Next" a11y="Next song" primary icon="arrow-forward" />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Button onPress={onSkip} disabled={disabled} label="Skip" a11y="Skip this song" icon="arrow-back" />
      <Button onPress={onJump} disabled={disabled} label="New genre" a11y="Jump to a new genre" icon="arrow-down" />
      <Button onPress={onMore} disabled={disabled} label="More like this" a11y="More like this, and show who it is" primary icon="arrow-forward" />
    </View>
  );
}

function Button({
  onPress,
  disabled,
  label,
  a11y,
  primary = false,
  icon,
  iconColor,
}: {
  onPress: () => void;
  disabled: boolean;
  label: string;
  a11y: string;
  primary?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}) {
  const size = primary ? BIG : SMALL;
  return (
    <View style={styles.slot}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={({ pressed }) => [
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, marginTop: (BIG - size) / 2 },
          primary && styles.primary,
          (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        ]}>
        <Ionicons name={icon} size={primary ? 28 : 22} color={iconColor ?? (primary ? Colors.accentText : Colors.text)} />
      </Pressable>
      <ThemedText style={[styles.label, primary && styles.primaryLabel]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: Spacing.xxl },
  slot: { alignItems: 'center', gap: Spacing.sm, minWidth: BIG },
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  primary: { backgroundColor: Colors.accent },
  label: { fontSize: 13, lineHeight: 16, color: Colors.textSecondary },
  primaryLabel: { color: Colors.text, fontWeight: '600' },
});
