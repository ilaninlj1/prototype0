import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Fonts, Ui } from '@/constants/theme';
import { useListenersNow } from '@/hooks/use-listeners-now';
import {
  countSongsHeard,
  describeGrowth,
  describeListeners,
  summarizeFinds,
  withLikedAt,
  type DiscoveryTrack,
  type SwipeEntry,
} from '@/lib/discovery';
import { loadBestStreaks, loadLikedTracks, loadSwipeHistory, type BestStreaks } from '@/lib/discovery-storage';

const fmt = (n: number) => describeListeners(n).count;

function topGenre(tracks: DiscoveryTrack[]): { genre: string; genres: number } | null {
  const counts = new Map<string, number>();
  for (const t of tracks) counts.set(t.primaryGenreName, (counts.get(t.primaryGenreName) ?? 0) + 1);
  const [genre] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return genre ? { genre, genres: counts.size } : null;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [finds, setFinds] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [liked, h, streaks] = await Promise.all([loadLikedTracks(), loadSwipeHistory(), loadBestStreaks()]);
        if (cancelled) return;
        setBest(streaks);
        setFinds(withLikedAt(liked, h));
        setHistory(h);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const now = useListenersNow(finds.map((t) => t.artistName));
  const summary = summarizeFinds(finds.map((t) => ({ artistName: t.artistName, found: t.artistListeners, now: now[t.artistName] })));
  const calledIt = finds.filter(
    (t) => t.artistListeners != null && now[t.artistName] != null && describeGrowth(t.artistListeners, now[t.artistName]).calledIt
  );
  const genre = useMemo(() => topGenre(finds), [finds]);
  const heard = countSongsHeard(history);
  const firstFind = finds.find((t) => t.likedAt != null);

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top }]}>
      <ThemedView style={styles.container}>
        <ThemedText type="eyebrow">Blindspot · what you hear</ThemedText>
        <ThemedText type="hero">Your ears</ThemedText>

        {finds.length === 0 ? (
          <ThemedText style={styles.dim}>Nothing found yet. Like a song blind and it shows up here.</ThemedText>
        ) : (
          <>
            <ThemedView style={styles.hero} backgroundColor="transparent">
              <ThemedText style={styles.heroNumber}>{finds.length}</ThemedText>
              <ThemedText style={styles.dim}>
                songs found blind{heard > 0 ? `, out of ${heard} you heard` : ''}.
              </ThemedText>
            </ThemedView>

            {(best.spot > 0 || best.h2h > 0) && (
              <ThemedText style={styles.streaks}>
                Best streaks · Spot the Star {best.spot} · Head to Head {best.h2h}
              </ThemedText>
            )}

            {summary.medianFound != null && (
              <ThemedText style={styles.line}>
                Half your finds had under <ThemedText style={styles.em}>{fmt(summary.medianFound)}</ThemedText> listeners
                when you found them. {describeListeners(summary.medianFound).verdict}
              </ThemedText>
            )}

            {calledIt.length > 0 ? (
              <ThemedView style={styles.block} backgroundColor="transparent">
                <ThemedText style={styles.line}>
                  You called <ThemedText style={styles.em}>{calledIt.length}</ThemedText> — they&apos;ve at least doubled
                  since you found them:
                </ThemedText>
                {calledIt.map((t) => (
                  <ThemedText key={t.id} style={styles.dim}>
                    {t.artistName}: {fmt(t.artistListeners!)} → {fmt(now[t.artistName])}
                  </ThemedText>
                ))}
              </ThemedView>
            ) : summary.best ? (
              <ThemedText style={styles.line}>
                Best call so far: <ThemedText style={styles.em}>{summary.best.artistName}</ThemedText>, up{' '}
                {summary.best.pct}% since you found them.
              </ThemedText>
            ) : (
              <ThemedText style={styles.line}>
                None of your finds have grown yet. When one doubles, you called it.
              </ThemedText>
            )}

            {genre && (
              <ThemedText style={styles.line}>
                You&apos;ve liked songs blind in <ThemedText style={styles.em}>{genre.genres}</ThemedText>{' '}
                {genre.genres === 1 ? 'genre' : 'genres'}, most of all {genre.genre}.
              </ThemedText>
            )}

            {firstFind && (
              <ThemedText style={styles.dim}>
                First find: {firstFind.trackName} by {firstFind.artistName},{' '}
                {new Date(firstFind.likedAt!).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.
              </ThemedText>
            )}
          </>
        )}
        <ThemedText type="caption" style={styles.about}>
          Blindspot is a student project. Song previews provided courtesy of iTunes; listener counts from Last.fm. No
          accounts — Daily Drop votes are anonymous and tied only to a random device id.
        </ThemedText>
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
    gap: Spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No box: the big number sits on a thin rule, like the collage on Home.
  hero: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingBottom: Spacing.lg,
    gap: 2,
  },
  streaks: {
    ...Ui.label,
    color: Colors.textSecondary,
  },
  heroNumber: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
    color: Colors.signal,
    fontFamily: Fonts.display,
  },
  block: {
    gap: Spacing.xs,
  },
  line: {
    fontSize: 18,
    lineHeight: 26,
  },
  // Cream, not red: red is kept for the one big number at the top.
  em: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  about: {
    color: Colors.textTertiary,
    marginTop: Spacing.xl,
  },
  dim: {
    color: Colors.textSecondary,
  },
});
