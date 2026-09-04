import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { buildSpotifySearchUrl, type DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks, saveLikedTracks } from '@/lib/discovery-storage';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

// react-native-web's Alert.alert is a no-op (confirmed against the installed
// react-native-web@0.21 source — `static alert() {}`), so a Cancel/Remove
// button pair there never fires either callback. window.confirm is a real,
// blocking browser dialog available in any DOM environment; wrapping both
// paths in a promise keeps the caller platform-agnostic.
function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

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

  async function handleRequestDelete(track: DiscoveryTrack, closeRow: () => void) {
    const confirmed = await confirmDialog(
      'Remove from liked tracks?',
      `"${track.trackName}" will be removed.`
    );
    if (confirmed) {
      await handleConfirmDelete(track);
    } else {
      closeRow();
    }
  }

  async function handleConfirmDelete(track: DiscoveryTrack) {
    if (playingId === track.id) {
      player.pause();
      setPlayingId(null);
    }
    const next = tracks.filter((t) => t.id !== track.id);
    setTracks(next);
    await saveLikedTracks(next);
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
              <Swipeable
                key={track.id}
                overshootRight={false}
                renderRightActions={(_progress, _translation, swipeableMethods) => (
                  <TouchableOpacity
                    onPress={() => handleRequestDelete(track, swipeableMethods.close)}
                    style={styles.deleteAction}>
                    <ThemedText style={styles.deleteActionText}>Delete</ThemedText>
                  </TouchableOpacity>
                )}>
                <ThemedView style={styles.row}>
                  {track.artworkUrl100 ? (
                    <Image source={{ uri: track.artworkUrl100 }} style={styles.artwork} />
                  ) : null}
                  <ThemedView style={styles.info} lightColor="transparent" darkColor="transparent">
                    <ThemedText type="defaultSemiBold" numberOfLines={1}>
                      {track.trackName}
                    </ThemedText>
                    <ThemedText numberOfLines={1}>{track.artistName}</ThemedText>
                    <ThemedText style={styles.dim}>{track.primaryGenreName}</ThemedText>
                    <ThemedView style={styles.linksRow} lightColor="transparent" darkColor="transparent">
                      {track.trackViewUrl ? (
                        <TouchableOpacity onPress={() => openUrl(track.trackViewUrl)}>
                          <ThemedText type="link" style={styles.linkText}>
                            Apple Music
                          </ThemedText>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => openUrl(buildSpotifySearchUrl(track.artistName, track.trackName))}>
                        <ThemedText type="link" style={styles.linkText}>
                          Spotify
                        </ThemedText>
                      </TouchableOpacity>
                    </ThemedView>
                  </ThemedView>
                  <TouchableOpacity onPress={() => togglePlay(track)} activeOpacity={0.7}>
                    <ThemedView style={styles.playButton} lightColor="#2a2a2a" darkColor="#2a2a2a">
                      <ThemedText style={styles.playButtonText}>{isPlayingThis ? '⏸' : '▶'}</ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                </ThemedView>
              </Swipeable>
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
  linksRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  linkText: {
    fontSize: 13,
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
  deleteAction: {
    backgroundColor: '#c0392b', // matches errorText's red in app/(tabs)/index.tsx
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '600',
  },
});
