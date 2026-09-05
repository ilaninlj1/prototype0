import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { TrackRow } from '@/components/discovery/track-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadExportBatches, type ExportBatch } from '@/lib/discovery-storage';

export default function ExportHistoryScreen() {
  const [loaded, setLoaded] = useState(false);
  const [batches, setBatches] = useState<ExportBatch[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<number | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

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
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const newestFirst = [...batches].reverse();

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        {newestFirst.length === 0 ? (
          <ThemedText>No export batches yet — bulk-export some liked tracks first.</ThemedText>
        ) : (
          newestFirst.map((batch) => {
            const isOpen = expanded.has(batch.id);
            const date = new Date(batch.exportedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            return (
              <ThemedView key={batch.id}>
                <TouchableOpacity onPress={() => toggleExpanded(batch.id)} activeOpacity={0.7}>
                  <ThemedView style={styles.batchRow} lightColor="#1a1a1a" darkColor="#1a1a1a">
                    <ThemedView style={styles.batchInfo} lightColor="transparent" darkColor="transparent">
                      <ThemedText type="defaultSemiBold">{date}</ThemedText>
                      <ThemedText style={styles.dim}>
                        {batch.tracks.length} track{batch.tracks.length === 1 ? '' : 's'}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText style={styles.chevron}>{isOpen ? '▾' : '▸'}</ThemedText>
                  </ThemedView>
                </TouchableOpacity>
                {isOpen && (
                  <ThemedView style={styles.batchTracks}>
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
    padding: 20,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  batchInfo: {
    gap: 2,
  },
  dim: {
    opacity: 0.6,
  },
  chevron: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.6,
  },
  batchTracks: {
    paddingTop: 12,
    paddingLeft: 12,
    gap: 12,
  },
});
