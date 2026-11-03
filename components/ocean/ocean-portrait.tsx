import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, Spacing } from '@/constants/theme';
import { EXAMPLE_NOTICE, portrait, type OceanLife } from '@/lib/ocean-person';

/** How thin an ocean is before it offers an example of a grown one. */
export const THIN_OCEAN = 8;

/** The ocean, in plain words, from the same data it's drawn from. */
export function OceanPortrait({
  visible,
  life,
  example,
  onExample,
  onClose,
}: {
  visible: boolean;
  life: OceanLife | null;
  /** Showing the made-up ocean rather than yours. */
  example: boolean;
  /** Toggles the example; null hides the button. */
  onExample: (() => void) | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="70%">
      <SheetHeader title={example ? 'An example ocean' : 'Your ocean'} onDone={onClose} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {example && <ThemedText style={styles.note}>{EXAMPLE_NOTICE}</ThemedText>}
        {(life ? portrait(life, Date.now()) : ['Still filling up.']).map((line) => (
          <ThemedText key={line} style={styles.line}>
            {line}
          </ThemedText>
        ))}
        {onExample && (
          <Pressable style={styles.button} onPress={onExample} accessibilityRole="button">
            <ThemedText style={styles.buttonText}>{example ? 'Back to your ocean' : 'See an example'}</ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingBottom: Spacing.xl },
  note: { fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  line: { fontSize: 17, lineHeight: 24, color: Colors.text },
  button: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.rule, borderRadius: 22, height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.text },
});
