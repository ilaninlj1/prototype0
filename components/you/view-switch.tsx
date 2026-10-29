import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, TapTarget } from '@/constants/theme';

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
            <ThemedText style={[styles.label, { color: active ? Colors.accentText : Colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {v.label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// A grey pill track; the view you're on is a black pill.
const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: TapTarget / 2, padding: 3, marginTop: Spacing.sm },
  item: { flex: 1, minHeight: TapTarget - 6, alignItems: 'center', justifyContent: 'center', borderRadius: (TapTarget - 6) / 2, paddingHorizontal: Spacing.xs },
  active: { backgroundColor: Colors.accent },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 18 },
});
