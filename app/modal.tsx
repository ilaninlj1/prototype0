import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks } from '@/lib/discovery-storage';

export default function LikedTracksScreen() {
  const [loaded, setLoaded] = useState(false);
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // Reload every time this screen gains focus, so a track liked after it was
  // last opened still shows up on return — mirrors the Profile tab's pattern.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const liked = await loadLikedTracks();
        if (cancelled) return;
        setTracks(liked);
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

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const newestFirst = [...tracks].reverse();

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        {newestFirst.length === 0 ? (
          <ThemedText>No liked tracks yet — swipe right on something you like.</ThemedText>
        ) : (
          newestFirst.map((track) => {
            const isPlayingThis = playingId === track.id && status.playing;
            return (
              <ThemedView key={track.id} style={styles.row}>
                {track.artworkUrl100 ? (
                  <Image source={{ uri: track.artworkUrl100 }} style={styles.artwork} />
                ) : null}
                <ThemedView style={styles.info} lightColor="transparent" darkColor="transparent">
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {track.trackName}
                  </ThemedText>
                  <ThemedText numberOfLines={1}>{track.artistName}</ThemedText>
                  <ThemedText style={styles.dim}>{track.primaryGenreName}</ThemedText>
                </ThemedView>
                <TouchableOpacity onPress={() => togglePlay(track)} activeOpacity={0.7}>
                  <ThemedView style={styles.playButton} lightColor="#2a2a2a" darkColor="#2a2a2a">
                    <ThemedText style={styles.playButtonText}>{isPlayingThis ? '⏸' : '▶'}</ThemedText>
                  </ThemedView>
                </TouchableOpacity>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  dim: {
    opacity: 0.6,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 14,
  },
});
