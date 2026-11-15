import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { sheetStyles } from '@/components/ui/sheet';
import { Colors, DarkColors, Spacing } from '@/constants/theme';
import type { LinkType } from '@/lib/coral-types';

export function CoralButton({ children, onPress, label, disabled = false, dark = false, primary = false }: {
  children: ReactNode; onPress: () => void; label?: string; disabled?: boolean; dark?: boolean; primary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.button, dark && styles.dark, primary && (dark ? styles.darkPrimary : styles.primary), { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
      <ThemedText style={[styles.buttonText, dark && styles.darkText, primary && { color: dark ? DarkColors.background : Colors.accentText }]}>{children}</ThemedText>
    </Pressable>
  );
}

export function LinkTypeControl({ value, onChange, disabled = false }: { value: LinkType; onChange: (value: LinkType) => void; disabled?: boolean }) {
  return (
    <View style={styles.type}>
      <View style={[sheetStyles.segment, styles.wrap]}>
        {(['fade', 'cut'] as const).map((type) => (
          <Pressable key={type} accessibilityRole="radio" accessibilityState={{ selected: value === type, disabled }} disabled={disabled}
            onPress={() => onChange(type)} style={[sheetStyles.segmentItem, styles.segment, value === type && sheetStyles.segmentOn]}>
            <ThemedText style={[sheetStyles.segmentText, value === type && sheetStyles.segmentTextOn]}>{type === 'fade' ? 'Fade' : 'Cut'}</ThemedText>
          </Pressable>
        ))}
      </View>
      <ThemedText style={styles.explain}>{value === 'fade' ? 'Blend the songs as you move.' : 'Switch songs halfway along.'}</ThemedText>
    </View>
  );
}

export const coralSheetStyles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  text: { fontSize: 16, color: Colors.text },
  secondary: { fontSize: 14, color: Colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  error: { fontSize: 15, color: Colors.text, backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: 12 },
});

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 26, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  buttonText: { fontSize: 15, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  primary: { backgroundColor: Colors.text },
  dark: { backgroundColor: '#12384a', borderWidth: 1, borderColor: '#40616d' },
  darkText: { color: DarkColors.text },
  darkPrimary: { backgroundColor: '#f1e6ce', borderColor: '#f1e6ce' },
  type: { gap: Spacing.sm },
  wrap: { flexWrap: 'wrap' },
  segment: { paddingVertical: 12, minWidth: 90 },
  explain: { fontSize: 15, color: Colors.textSecondary },
});
