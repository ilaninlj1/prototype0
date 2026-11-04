import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader, sheetStyles } from '@/components/ui/sheet';
import { Colors, Fonts, Spacing, TapTarget, Ui } from '@/constants/theme';
import { importHeadline, leftOutLine, type ImportReport, type SkipGroup } from '@/lib/import-file';
import { knownCount } from '@/lib/known-artists';
import type { KeptImport } from '@/lib/spotify-api';

/** Short enough to read at a glance, so it starts open. A long list starts closed. */
const OPEN_UP_TO = 12;

function Group({ group, startOpen }: { group: SkipGroup; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const more = group.count - group.rows.length;
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        style={styles.groupRow}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${group.text}, ${group.count}`}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.textSecondary} />
        <ThemedText style={styles.groupText}>{group.text}</ThemedText>
        <ThemedText style={styles.groupCount}>{group.count.toLocaleString('en-US')}</ThemedText>
      </Pressable>
      {open && (
        <View style={styles.rows}>
          {group.rows.map((row) => (
            <ThemedText key={row} style={styles.row}>
              {row}
            </ThemedText>
          ))}
          {more > 0 && <ThemedText style={styles.row}>And {more.toLocaleString('en-US')} more</ThemedText>}
        </View>
      )}
    </View>
  );
}

/** What came in, what didn't and why. Used by the real import and by Tune's broken samples. */
export function ImportReportBody({ report, newCount }: { report: ImportReport; newCount?: number }) {
  const leftOut = leftOutLine(report);
  const saved = newCount != null && report.songs.length > 0 && !report.saveFailed;
  return (
    <View style={styles.body}>
      <ThemedText style={styles.headline}>{importHeadline(report)}</ThemedText>
      {report.saveFailed && (
        <ThemedText style={styles.line}>Your phone ran out of room for this many songs. Try a smaller file.</ThemedText>
      )}
      {saved && (
        <ThemedText style={styles.line}>
          {newCount === 0 ? 'You already had all of them.' : `${newCount.toLocaleString('en-US')} ${newCount === 1 ? 'is' : 'are'} new here.`}{' '}
          Home now skips the {knownCount().toLocaleString('en-US')} artists you already have.
        </ThemedText>
      )}
      {leftOut && <ThemedText style={styles.small}>{leftOut}</ThemedText>}

      {report.skipped.length > 0 && (
        <View style={styles.block}>
          <ThemedText style={sheetStyles.heading}>Why they didn’t come in</ThemedText>
          {report.skipped.map((g) => (
            <Group key={g.reason} group={g} startOpen={report.skippedCount <= OPEN_UP_TO} />
          ))}
        </View>
      )}

      {report.files.length > 0 && (
        <View style={styles.block}>
          <ThemedText style={sheetStyles.heading}>{report.files.length === 1 ? 'The file' : 'The files'}</ThemedText>
          {report.files.map((f, i) => (
            <View key={`${f.name}${i}`} style={styles.file}>
              <ThemedText style={styles.fileName} numberOfLines={1}>
                {f.name}
              </ThemedText>
              {f.problem ? (
                <ThemedText style={styles.problem}>{f.problem}</ThemedText>
              ) : (
                <ThemedText style={styles.small}>
                  {f.kind}. {f.found.toLocaleString('en-US')} {f.found === 1 ? 'song' : 'songs'} read.
                </ThemedText>
              )}
              {f.note && <ThemedText style={styles.problem}>{f.note}</ThemedText>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** After a real import. There's always a way forward: pick another file, or Done. */
export function ImportReportSheet({
  kept,
  onClose,
  onPickAnother,
}: {
  kept: KeptImport | null;
  onClose: () => void;
  onPickAnother: () => void;
}) {
  return (
    <BottomSheet visible={kept != null} onClose={onClose}>
      <SheetHeader title="Your import" onDone={onClose} />
      {kept && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ImportReportBody report={kept.report} newCount={kept.newCount} />
          <TouchableOpacity onPress={onPickAnother} style={[Ui.outlineButton, styles.again]} accessibilityRole="button">
            <Ionicons name="document-outline" size={16} color={Colors.text} />
            <ThemedText style={Ui.label}>Pick another file</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.lg },
  body: { gap: Spacing.sm },
  headline: { fontFamily: Fonts.sansSemiBold, fontSize: 22, lineHeight: 28, color: Colors.text },
  line: { fontSize: 15, lineHeight: 21, color: Colors.text },
  small: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  block: { gap: 2 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: TapTarget },
  groupText: { flex: 1, fontSize: 15, lineHeight: 20, color: Colors.text },
  groupCount: { fontFamily: Fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: Colors.text },
  rows: { gap: 4, paddingLeft: 22, paddingBottom: Spacing.sm },
  row: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  file: { gap: 2, paddingVertical: Spacing.xs },
  fileName: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 19, color: Colors.text },
  problem: { fontSize: 14, lineHeight: 19, color: Colors.text },
  again: { alignSelf: 'flex-start' },
});
