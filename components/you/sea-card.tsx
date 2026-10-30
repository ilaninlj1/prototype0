import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useMyBottles } from '@/hooks/use-my-bottles';
import { useBottlesOn } from '@/lib/bottles-api';
import { seaCountLine } from '@/lib/sea-globe';

/** You → Discoveries: how far your bottles have gone. Tapping opens the Sea. Hidden with Bottles off. */
export function SeaCard({ onOpen }: { onOpen: () => void }) {
  const on = useBottlesOn() === true;
  const mine = useMyBottles();
  if (!on) return null;
  const line = seaCountLine([...mine.values()]);
  return (
    <Pressable onPress={onOpen} style={styles.card} accessibilityRole="button" accessibilityLabel={`The Sea, ${line}. Open the Sea`}>
      <View style={styles.row}>
        <ThemedText style={styles.title}>The Sea</ThemedText>
        <ThemedText style={styles.mono}>{line}</ThemedText>
      </View>
      <ThemedText style={styles.dim}>Where your blind finds have floated, and who kept them. Tap to open the globe.</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, backgroundColor: Colors.surface, marginBottom: Spacing.lg, padding: Spacing.md, gap: Spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.md },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  mono: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text, flexShrink: 1 },
  dim: { fontSize: 13, color: Colors.textSecondary },
});
