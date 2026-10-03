import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Ui } from '@/constants/theme';
import type { Finding } from '@/lib/taste-decoded';

type Props = { finding: Finding | null; prompt: { text: string; takeTest: boolean }; isNew: boolean };

/** Under the Tasteform: the strongest finding in one line (the whole row opens the Decoded page), or what it still needs. */
export function DecodedLine({ finding, prompt, isNew }: Props) {
  const router = useRouter();
  const onPress = finding ? () => router.push('/decoded') : prompt.takeTest ? () => router.push('/blind-test') : undefined;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} style={styles.row}>
      <View style={styles.text}>
        <ThemedText style={styles.label}>Decoded</ThemedText>
        <Animated.View key={finding?.id ?? prompt.text} entering={isNew ? FadeIn.duration(700) : undefined}>
          <ThemedText style={finding ? styles.sentence : styles.prompt}>{finding ? finding.sentence : prompt.text}</ThemedText>
        </Animated.View>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 64,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.rule,
  },
  text: { flex: 1, gap: Spacing.xs },
  label: { ...Ui.label, color: Colors.textSecondary },
  sentence: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  prompt: { color: Colors.textSecondary },
});
