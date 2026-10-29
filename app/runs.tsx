import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { runCandidates } from '@/lib/pool';
import { formatClock, formatMiles } from '@/lib/run-pace';
import { summarize } from '@/lib/run-reveal';
import { sampleRun } from '@/lib/run-sim';
import { loadRuns, saveRun } from '@/lib/run-storage';
import type { RunRecord } from '@/lib/run-types';

/** Every run on this phone, newest first; each opens its reveal. */
export default function RunsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadRuns().then(setRuns);
    }, [])
  );

  const seed = async () => {
    const run = sampleRun(Date.now(), runCandidates().slice(0, 600));
    await saveRun(run);
    router.push({ pathname: '/run-reveal', params: { id: run.id } });
  };

  return (
    <ScrollView style={styles.room} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Past runs</ThemedText>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={Colors.text} />
          </Pressable>
        </View>
        {runs && runs.length === 0 ? <ThemedText style={styles.line}>No runs yet. Your first one shows up here.</ThemedText> : null}
        {runs?.map((r) => {
          const s = summarize(r);
          const kept = r.played.filter((p) => p.kept).length;
          const date = new Date(r.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <Pressable key={r.id} onPress={() => router.push({ pathname: '/run-reveal', params: { id: r.id } })} style={styles.row} accessibilityRole="button">
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rowTitle}>
                  {date}
                  {r.simulated ? ' · simulated' : ''}
                </ThemedText>
                <ThemedText style={styles.rowSub}>
                  {formatMiles(s.distanceM)} · {formatClock(s.durationMs)} · {r.played.length} songs · {kept} kept
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </Pressable>
          );
        })}
        {__DEV__ ? (
          <Pressable onPress={seed} style={styles.link} hitSlop={8}>
            <ThemedText style={styles.linkText}>Seed a sample run (dev)</ThemedText>
          </Pressable>
        ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 30, color: Colors.text },
  close: { width: TapTarget, height: TapTarget, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.sm },
  line: { fontSize: 16, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.surface },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowSub: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  link: { minHeight: TapTarget, justifyContent: 'center', alignSelf: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 15, color: Colors.text, textDecorationLine: 'underline' },
});
