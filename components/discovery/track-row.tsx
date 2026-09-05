import { Image } from 'expo-image';
import { Linking, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { artworkUrl, buildSpotifySearchUrl, type DiscoveryTrack } from '@/lib/discovery';

// Rows are small (56x56) — a modest bump from the default 100x100 is plenty,
// no need for the swipe cards' full 600x600.
const ROW_ARTWORK_SIZE = 200;

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

type TrackRowProps = {
  track: DiscoveryTrack;
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** Dims and disables the play button and links — used during multi-select, where a tap on the row means "select", not "act". */
  disabled?: boolean;
};

/** Artwork, title/artist/genre, Apple Music/Spotify links, and a play/pause button — shared by the liked tracks list and export history. */
export function TrackRow({ track, isPlaying, onTogglePlay, disabled = false }: TrackRowProps) {
  return (
    <ThemedView style={styles.row}>
      {track.artworkUrl100 ? (
        <Image source={{ uri: artworkUrl(track.artworkUrl100, ROW_ARTWORK_SIZE) }} style={styles.artwork} />
      ) : null}
      <ThemedView style={styles.info} lightColor="transparent" darkColor="transparent">
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText numberOfLines={1}>{track.artistName}</ThemedText>
        <ThemedText style={styles.dim}>{track.primaryGenreName}</ThemedText>
        <ThemedView style={styles.linksRow} lightColor="transparent" darkColor="transparent">
          {track.trackViewUrl ? (
            <TouchableOpacity disabled={disabled} onPress={() => openUrl(track.trackViewUrl)}>
              <ThemedText type="link" style={[styles.linkText, disabled && styles.dimmed]}>
                Apple Music
              </ThemedText>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            disabled={disabled}
            onPress={() => openUrl(buildSpotifySearchUrl(track.artistName, track.trackName))}>
            <ThemedText type="link" style={[styles.linkText, disabled && styles.dimmed]}>
              Spotify
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
      <TouchableOpacity disabled={disabled} onPress={onTogglePlay} activeOpacity={0.7}>
        <ThemedView style={[styles.playButton, disabled && styles.dimmed]} lightColor="#2a2a2a" darkColor="#2a2a2a">
          <ThemedText style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  dimmed: {
    opacity: 0.35,
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
});
