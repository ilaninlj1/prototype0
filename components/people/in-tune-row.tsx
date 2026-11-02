import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { deckProgressLine, type Person } from '@/lib/people';
import type { Progress } from '@/lib/people-api';
import { PersonPrint } from './person-print';

const PRINT = 56;

/** Who you're in tune with, above the song. Nobody yet: how close you are. */
export function InTuneRow({ people, progress }: { people: Person[]; progress: Progress | null }) {
  const router = useRouter();
  if (people.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText style={styles.emptyText}>{deckProgressLine({ close: progress?.close ?? 0, judged: progress?.judged ?? 0 })}</ThemedText>
        {!!progress?.members && (
          <ThemedText style={styles.emptyCount}>
            {progress.members} {progress.members === 1 ? 'person' : 'people'} here
          </ThemedText>
        )}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {people.map((p) => {
        const waiting = p.row.they_waved && !p.row.i_waved;
        return (
          <Pressable
            key={p.row.person}
            style={styles.person}
            accessibilityRole="button"
            accessibilityLabel={`${p.row.name}${waiting ? ', waved at you' : ''}`}
            onPress={() => router.push({ pathname: '/person', params: { id: p.row.person } })}>
            <View>
              <PersonPrint trackId={p.row.shared_tracks[0] ?? 0} rings={p.row.print} size={PRINT} />
              {waiting && <View style={styles.dot} />}
            </View>
            <ThemedText style={styles.name} numberOfLines={1}>
              {p.row.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },
  person: { width: PRINT + Spacing.sm, alignItems: 'center', gap: Spacing.xs },
  dot: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: Colors.background, backgroundColor: Colors.signal },
  name: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  empty: { minHeight: PRINT + 19, justifyContent: 'center', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.lg },
  emptyText: { fontWeight: '600', textAlign: 'center' },
  emptyCount: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
});
