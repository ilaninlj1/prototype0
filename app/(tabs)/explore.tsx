import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  averageListenMs,
  deriveGenrePath,
  deriveSessions,
  deriveTopArtists,
  derivePlayedToEndButSkipped,
  rankGenresByListenTime,
  rankGenresByVisits,
  type SwipeEntry,
} from '@/lib/discovery';
import { loadDiscoveredGenres, loadSwipeHistory } from '@/lib/discovery-storage';

const TOP_GENRE_COUNT = 5;

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatSessionLabel(startedAt: number): string {
  const date = new Date(startedAt);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

/** The chain of genres a run of entries moved through, e.g. "Pop → House → Jazz". */
function genrePathLabel(entries: SwipeEntry[]): string {
  return deriveGenrePath(entries)
    .map((visit) => visit.genre)
    .join(' → ');
}

export default function ProfileScreen() {
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [discoveredGenres, setDiscoveredGenres] = useState<string[]>([]);

  // Reload every time this tab gains focus, so swipes made on the Home tab
  // always show fresh data.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [h, genres] = await Promise.all([loadSwipeHistory(), loadDiscoveredGenres()]);
        if (cancelled) return;
        setHistory(h);
        setDiscoveredGenres(genres);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const sessions = useMemo(() => deriveSessions(history), [history]);
  const genresByListenTime = useMemo(
    () => rankGenresByListenTime(history).slice(0, TOP_GENRE_COUNT),
    [history]
  );
  const genresByVisits = useMemo(
    () => rankGenresByVisits(sessions).slice(0, TOP_GENRE_COUNT),
    [sessions]
  );
  const topArtists = useMemo(() => deriveTopArtists(history), [history]);
  const playedToEndSkipped = useMemo(() => derivePlayedToEndButSkipped(history), [history]);
  const currentSession = sessions[sessions.length - 1] ?? null;
  const sessionsNewestFirst = useMemo(() => [...sessions].reverse(), [sessions]);

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  const total = history.length;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Listening Data</ThemedText>

        {total === 0 ? (
          <ThemedText style={styles.dim}>
            No listening history yet. Swipe on some tracks in the Home tab to build your profile.
          </ThemedText>
        ) : (
          <>
            <ThemedView style={styles.statsRow} backgroundColor="transparent">
              <ThemedView style={styles.statTile} backgroundColor={Colors.surface}>
                <ThemedText style={styles.statNumber}>{total}</ThemedText>
                <ThemedText type="caption">tracks logged</ThemedText>
              </ThemedView>
              <ThemedView style={styles.statTile} backgroundColor={Colors.surface}>
                <ThemedText style={styles.statNumber}>{formatDuration(averageListenMs(history))}</ThemedText>
                <ThemedText type="caption">avg listen time</ThemedText>
              </ThemedView>
              <ThemedView style={styles.statTile} backgroundColor={Colors.surface}>
                <ThemedText style={styles.statNumber}>{discoveredGenres.length}</ThemedText>
                <ThemedText type="caption">genres discovered</ThemedText>
              </ThemedView>
            </ThemedView>

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Where you go vs. where you stay
            </ThemedText>
            <ThemedView style={styles.compareRow} backgroundColor="transparent">
              <ThemedView style={styles.compareCol} backgroundColor="transparent">
                <ThemedText type="defaultSemiBold" style={styles.compareHeading}>
                  By listen time
                </ThemedText>
                {genresByListenTime.length > 0 ? (
                  genresByListenTime.map((g) => (
                    <ThemedText key={g.genre}>
                      {g.genre} — {formatDuration(g.listenMs)}
                    </ThemedText>
                  ))
                ) : (
                  <ThemedText style={styles.dim}>—</ThemedText>
                )}
              </ThemedView>

              <ThemedView style={styles.compareCol} backgroundColor="transparent">
                <ThemedText type="defaultSemiBold" style={styles.compareHeading}>
                  By visit count
                </ThemedText>
                {genresByVisits.length > 0 ? (
                  genresByVisits.map((g) => (
                    <ThemedText key={g.genre}>
                      {g.genre} — {g.visits} {g.visits === 1 ? 'visit' : 'visits'}
                    </ThemedText>
                  ))
                ) : (
                  <ThemedText style={styles.dim}>—</ThemedText>
                )}
              </ThemedView>
            </ThemedView>

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Artists beating your average
            </ThemedText>
            {topArtists.length > 0 ? (
              topArtists.map((a) => (
                <ThemedText key={a.artistId}>
                  {a.artistName} — {formatDuration(a.avgListenMs)} avg ({a.trackCount})
                </ThemedText>
              ))
            ) : (
              <ThemedText style={styles.dim}>No artist beats your average yet.</ThemedText>
            )}

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Played to the end, skipped anyway
            </ThemedText>
            {playedToEndSkipped.length > 0 ? (
              playedToEndSkipped.map((e) => (
                <ThemedText key={`${e.trackId}-${e.timestamp}`} numberOfLines={1}>
                  {e.trackName ?? 'Unknown track'} — {e.artistName ?? e.genre}
                </ThemedText>
              ))
            ) : (
              <ThemedText style={styles.dim}>None yet.</ThemedText>
            )}

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Genre path
            </ThemedText>
            {currentSession ? (
              <>
                <ThemedText type="defaultSemiBold">Current session</ThemedText>
                <ThemedText style={styles.pathText}>{genrePathLabel(currentSession.entries)}</ThemedText>
              </>
            ) : null}
            <ThemedText type="defaultSemiBold" style={styles.allSessionsHeading}>
              All sessions
            </ThemedText>
            {sessionsNewestFirst.map((session, i) => (
              <ThemedView
                key={`${session.startedAt}-${i}`}
                style={styles.sessionRow}
                backgroundColor={Colors.surface}>
                <ThemedText type="caption">
                  {formatSessionLabel(session.startedAt)} · {session.entries.length}{' '}
                  {session.entries.length === 1 ? 'track' : 'tracks'}
                </ThemedText>
                <ThemedText style={styles.pathText}>{genrePathLabel(session.entries)}</ThemedText>
              </ThemedView>
            ))}
          </>
        )}
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
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'stretch',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statTile: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  dim: {
    color: Colors.textSecondary,
  },
  compareRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  compareCol: {
    flex: 1,
    gap: Spacing.xs,
  },
  compareHeading: {
    marginBottom: Spacing.xs,
  },
  allSessionsHeading: {
    marginTop: Spacing.sm,
  },
  sessionRow: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
  },
  pathText: {
    color: Colors.textSecondary,
  },
});
