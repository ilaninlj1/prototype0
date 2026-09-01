import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  clearGenrePicks,
  isMismatch,
  loadGenrePicks,
  loadHistory,
  type GenrePicks,
  type HistoryEntry,
} from '@/lib/taste-test';

const TOP_GENRE_COUNT = 3;

type GenreStat = {
  genre: string;
  avgRating: number;
  count: number;
};

function computeTopGenres(history: HistoryEntry[], take: number): GenreStat[] {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const entry of history) {
    const bucket = totals.get(entry.sourceGenre) ?? { sum: 0, count: 0 };
    bucket.sum += entry.rating;
    bucket.count += 1;
    totals.set(entry.sourceGenre, bucket);
  }
  return Array.from(totals.entries())
    .map(([genre, { sum, count }]) => ({ genre, avgRating: sum / count, count }))
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, take);
}

export default function ProfileScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [picks, setPicks] = useState<GenrePicks | null>(null);

  // Reload every time this tab gains focus, so ratings made on the Home tab
  // (or a "redo setup" on this one) always show fresh data.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [h, p] = await Promise.all([loadHistory(), loadGenrePicks()]);
        if (cancelled) return;
        setHistory(h);
        setPicks(p);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function handleRedoSetup() {
    Alert.alert(
      'Redo setup?',
      'This clears your saved genre picks so you can choose again. Your rating history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redo Setup',
          style: 'destructive',
          onPress: async () => {
            await clearGenrePicks();
            setPicks(null);
            router.push('/');
          },
        },
      ]
    );
  }

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const total = history.length;
  const claimedLiked = picks?.liked ?? [];
  const topGenres = computeTopGenres(history, TOP_GENRE_COUNT);
  const mismatchCount = history.filter(isMismatch).length;
  const mismatchRate = total > 0 ? Math.round((mismatchCount / total) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Taste Profile</ThemedText>

        {total === 0 ? (
          <ThemedText>
            No listening history yet. Rate some tracks in the Home tab to build your taste
            profile.
          </ThemedText>
        ) : (
          <>
            <ThemedView style={styles.statsRow}>
              <ThemedView style={styles.statTile} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText style={styles.statNumber}>{total}</ThemedText>
                <ThemedText style={styles.statLabel}>tracks rated</ThemedText>
              </ThemedView>
              <ThemedView style={styles.statTile} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText style={styles.statNumber}>{mismatchRate}%</ThemedText>
                <ThemedText style={styles.statLabel}>mismatch rate</ThemedText>
              </ThemedView>
            </ThemedView>
            <ThemedText style={styles.dim}>
              {mismatchCount} of {total} rated tracks didn&apos;t match what you said you like or
              dislike.
            </ThemedText>

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Stated vs. actual taste
            </ThemedText>
            <ThemedView style={styles.compareRow}>
              <ThemedView style={styles.compareCol}>
                <ThemedText type="defaultSemiBold" style={styles.compareHeading}>
                  Your actual top genres
                </ThemedText>
                {topGenres.length > 0 ? (
                  topGenres.map((g) => (
                    <ThemedText key={g.genre}>
                      {g.genre} — {g.avgRating.toFixed(1)}★ ({g.count})
                    </ThemedText>
                  ))
                ) : (
                  <ThemedText style={styles.dim}>—</ThemedText>
                )}
              </ThemedView>

              <ThemedView style={styles.compareCol}>
                <ThemedText type="defaultSemiBold" style={styles.compareHeading}>
                  You said you like
                </ThemedText>
                {claimedLiked.length > 0 ? (
                  claimedLiked.map((g) => <ThemedText key={g}>{g}</ThemedText>)
                ) : (
                  <ThemedText style={styles.dim}>No picks saved</ThemedText>
                )}
              </ThemedView>
            </ThemedView>
          </>
        )}

        <TouchableOpacity onPress={handleRedoSetup} activeOpacity={0.7} style={styles.redoLink}>
          <ThemedText type="link">Redo setup</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    opacity: 0.7,
    fontSize: 13,
  },
  dim: {
    opacity: 0.6,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 20,
  },
  compareCol: {
    flex: 1,
    gap: 4,
  },
  compareHeading: {
    marginBottom: 4,
  },
  redoLink: {
    marginTop: 24,
    alignSelf: 'flex-start',
  },
});
