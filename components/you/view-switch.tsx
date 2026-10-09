import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, TapTarget, Ui } from '@/constants/theme';

export type YouView = 'piece' | 'discoveries' | 'insights';

const VIEWS: { key: YouView; label: string }[] = [
  { key: 'piece', label: 'Piece' },
  { key: 'discoveries', label: 'Discoveries' },
  { key: 'insights', label: 'Insights' },
];

/** You's three views behind one switch: your piece first, then what you found, then the numbers. */
export function ViewSwitch({ view, onChange }: { view: YouView; onChange: (view: YouView) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {VIEWS.map((v) => {
        const active = view === v.key;
        return (
          <TouchableOpacity
            key={v.key}
            style={[styles.item, active && styles.active]}
            onPress={() => onChange(v.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}>
            <ThemedText style={[Ui.label, { color: active ? Colors.accentText : Colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {v.label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: Colors.hairline, borderRadius: Radius.sm, padding: 2, marginTop: Spacing.sm },
  item: { flex: 1, minHeight: TapTarget, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm - 1, paddingHorizontal: Spacing.xs },
  active: { backgroundColor: Colors.accent },
});
