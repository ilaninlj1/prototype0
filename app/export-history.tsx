import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { TrackRow } from '@/components/discovery/track-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadExportBatches, type ExportBatch } from '@/lib/discovery-storage';

export default function ExportHistoryScreen() {
  const [loaded, setLoaded] = useState(false);
  const [batches, setBatches] = useState<ExportBatch[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<number | null>(null);

  // Shared across every screen that plays audio — see hooks/use-playback.tsx —
  // so starting a preview here always stops one already playing on the swipe
  // screen or the liked tracks list, and vice versa, since it's the same player.
  const { player, status } = usePlayback();

  // Reload every time this screen gains focus, so a batch exported after it
  // was last opened still shows up on return — mirrors the liked tracks screen.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const loadedBatches = await loadExportBatches();
        if (cancelled) return;
        setBatches(loadedBatches);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Leaving this screen pauses playback rather than leaving it running in the
  // background, and clears the local "which row is playing" state so a row
  // doesn't keep showing a pause icon for a track that's no longer playing.
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setPlayingId(null);
      };
    }, [player])
  );

  function togglePlay(track: DiscoveryTrack) {
    if (playingId === track.id) {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlayingId(track.id);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  const newestFirst = [...batches].reverse();

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        {newestFirst.length === 0 ? (
          <ThemedText style={styles.emptyText}>
            No export batches yet — bulk-export some liked tracks first.
          </ThemedText>
        ) : (
          newestFirst.map((batch) => {
            const isOpen = expanded.has(batch.id);
            const date = new Date(batch.exportedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            return (
              <ThemedView key={batch.id} backgroundColor="transparent">
                <TouchableOpacity onPress={() => toggleExpanded(batch.id)} activeOpacity={0.7}>
                  <ThemedView style={styles.batchRow} backgroundColor={Colors.surface}>
                    <ThemedView style={styles.batchInfo} backgroundColor="transparent">
                      <ThemedText type="defaultSemiBold">{date}</ThemedText>
                      <ThemedText type="caption">
                        {batch.tracks.length} track{batch.tracks.length === 1 ? '' : 's'}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText style={styles.chevron}>{isOpen ? '▾' : '▸'}</ThemedText>
                  </ThemedView>
                </TouchableOpacity>
                {isOpen && (
                  <ThemedView style={styles.batchTracks} backgroundColor="transparent">
                    {batch.tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        isPlaying={playingId === track.id && status.playing}
                        onTogglePlay={() => togglePlay(track)}
                      />
                    ))}
                  </ThemedView>
                )}
              </ThemedView>
            );
          })
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
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  batchInfo: {
    gap: 2,
  },
  chevron: {
    color: Colors.textTertiary,
    fontSize: 16,
  },
  batchTracks: {
    paddingTop: Spacing.md,
    paddingLeft: Spacing.md,
    gap: Spacing.md,
  },
});
