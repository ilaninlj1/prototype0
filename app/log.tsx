import { useMemo } from 'react';
import { FlatList, Share, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { clockOf, type LogEntry } from '@/lib/app-log';
import { appLogText, clearAppLog, phoneDetails, useAppLog } from '@/lib/app-log-app';

/** Tune → More → Log: what the app did and when, newest first, with Share to send it to the developer. */
export default function LogScreen() {
  const entries = useAppLog();
  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);
  const details = phoneDetails();
  const errors = entries.filter((e) => e.kind === 'error').length;

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.top}>
        {details.map((line) => (
          <ThemedText key={line} style={styles.detail}>{line}</ThemedText>
        ))}
        <ThemedText type="caption">
          {entries.length} {entries.length === 1 ? 'line' : 'lines'}
          {errors ? ` · ${errors} ${errors === 1 ? 'error' : 'errors'}` : ''}. Kept on this phone only, until you share it.
        </ThemedText>
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => void Share.share({ message: appLogText() }).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Share the log">
            <ThemedText style={styles.primaryText}>Share log</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={Ui.outlineButton} onPress={clearAppLog} accessibilityRole="button" accessibilityLabel="Clear the log">
            <ThemedText style={Ui.label}>Clear</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={newestFirst}
        keyExtractor={(e, i) => `${e.t}-${i}`}
        renderItem={({ item }) => <Row entry={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<ThemedText type="caption">Nothing logged yet.</ThemedText>}
      />
    </ThemedView>
  );
}

function Row({ entry }: { entry: LogEntry }) {
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.meta, entry.kind === 'error' && styles.error]}>
        {clockOf(entry.t)} · {entry.area}
        {entry.kind === 'info' ? '' : ` · ${entry.kind}`}
      </ThemedText>
      <ThemedText style={[styles.msg, entry.kind === 'error' && styles.error]} selectable>
        {entry.msg}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { padding: Spacing.lg, gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  detail: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm, alignItems: 'center' },
  primary: { backgroundColor: Colors.text, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  primaryText: { color: Colors.background, fontWeight: '600' },
  list: { padding: Spacing.lg, gap: Spacing.md },
  row: { gap: 2 },
  meta: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary },
  msg: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 17 },
  error: { color: Colors.destructive },
});
