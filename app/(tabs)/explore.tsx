import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecodedLine } from '@/components/decoded/decoded-line';
import { RewindEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { MiniPlayer } from '@/components/mini-player';
import { NoteSheet } from '@/components/note-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { Tasteform } from '@/components/tasteform/tasteform';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Fonts, Ui } from '@/constants/theme';
import { useListenersNow } from '@/hooks/use-listeners-now';
import { usePlayback } from '@/hooks/use-playback';
import { useTasteDecoded } from '@/hooks/use-taste-decoded';
import {
  countSongsHeard,
  describeGrowth,
  describeListeners,
  summarizeFinds,
  withLikedAt,
  type DiscoveryTrack,
  type SwipeEntry,
} from '@/lib/discovery';
import { loadBestStreaks, loadLikedTracks, loadSwipeHistory, setLikedNote, type BestStreaks } from '@/lib/discovery-storage';
import { setNote } from '@/lib/saved-songs';

const fmt = (n: number) => describeListeners(n).count;

function topGenre(tracks: DiscoveryTrack[]): { genre: string; genres: number } | null {
  const counts = new Map<string, number>();
  for (const t of tracks) counts.set(t.primaryGenreName, (counts.get(t.primaryGenreName) ?? 0) + 1);
  const [genre] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return genre ? { genre, genres: counts.size } : null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Zoomed into the Tasteform, one finger moves around the shape instead of the page.
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finds, setFinds] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });
  const decoded = useTasteDecoded(finds, history);

  // Tap a cover in the Tasteform to hear it. Leaving the tab stops it and
  // forgets it, since another screen may load a different song meanwhile.
  const { player, status } = usePlayback();
  const [nowPlaying, setNowPlaying] = useState<DiscoveryTrack | null>(null);
  const [noteTrack, setNoteTrack] = useState<DiscoveryTrack | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setNowPlaying(null);
      };
    }, [player])
  );
  function togglePlay(track: DiscoveryTrack) {
    if (nowPlaying?.id === track.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setNowPlaying(track);
    if (!track.previewUrl) return;
    player.replace(track.previewUrl);
    player.play();
  }

  async function saveNote(track: DiscoveryTrack, text: string) {
    const next = setNote(finds, track.id, text);
    setFinds(next);
    setNowPlaying((p) => (p?.id === track.id ? (next.find((t) => t.id === track.id) ?? p) : p));
    await setLikedNote(track.id, text);
  }

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
  const doubled = finds.filter(
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
    <View style={styles.screen}>
      <ScrollView
        scrollEnabled={!zoomed}
        contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top, paddingBottom: nowPlaying ? 180 : 0 }]}>
        <ThemedView style={styles.container}>
          <ThemedText type="eyebrow">Blindspot · what you hear</ThemedText>
          <ThemedText type="hero">Your ears</ThemedText>

          {finds.length === 0 ? (
            <ThemedText style={styles.dim}>
              Nothing found yet. Double-tap a song on Home to save it, and your shape starts growing here.
            </ThemedText>
          ) : (
            <>
              <Tasteform
                liked={finds}
                history={history}
                width={width - 2 * Spacing.lg}
                selectedId={nowPlaying?.id ?? null}
                playing={status.playing}
                onPick={togglePlay}
                onZoomChange={setZoomed}
              />
              {decoded.ready && <DecodedLine finding={decoded.findings[0] ?? null} prompt={decoded.prompt} isNew={decoded.isNew} />}

              <PressableScale onPress={() => router.push('/rewind')} style={styles.rewind}>
                <RewindEmblem size={44} />
                <View style={styles.rewindText}>
                  <ThemedText style={styles.rewindTitle}>Rewind</ThemedText>
                  <ThemedText style={styles.dim}>Drag back through your finds.</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </PressableScale>

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

              {doubled.length > 0 ? (
                <ThemedView style={styles.block} backgroundColor="transparent">
                  <ThemedText style={styles.line}>
                    <ThemedText style={styles.em}>{doubled.length}</ThemedText> of your finds have at least doubled
                    since you found them:
                  </ThemedText>
                  {doubled.map((t) => (
                    <ThemedText key={t.id} style={styles.dim}>
                      {t.artistName}: {fmt(t.artistListeners!)} → {fmt(now[t.artistName])}
                    </ThemedText>
                  ))}
                </ThemedView>
              ) : summary.best ? (
                <ThemedText style={styles.line}>
                  Best find so far: <ThemedText style={styles.em}>{summary.best.artistName}</ThemedText>, up{' '}
                  {summary.best.pct}% since you found them.
                </ThemedText>
              ) : (
                <ThemedText style={styles.line}>
                  None of your finds have grown yet. Make a prediction with Call it on a revealed song.
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
      {nowPlaying && (
        <View style={styles.mini}>
          <MiniPlayer
            track={nowPlaying}
            playing={status.playing}
            progress={status.duration ? status.currentTime / status.duration : 0}
            onToggle={() => togglePlay(nowPlaying)}
            onEditNote={() => setNoteTrack(nowPlaying)}
          />
        </View>
      )}
      <NoteSheet track={noteTrack} onSave={saveNote} onClose={() => setNoteTrack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Pinned over the page, like the Liked screen's player.
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.md,
  },
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
  // A row, not a button: the emblem says what it is, the chevron says it opens.
  rewind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.rule,
  },
  rewindText: {
    flex: 1,
  },
  rewindTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 18,
    lineHeight: 22,
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
