import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { lastfmArtistUrl } from '@/lib/credits';
import { artworkUrl, buildSpotifySearchUrl, describeGrowth, describeListeners, type DiscoveryTrack } from '@/lib/discovery';

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
  /** The artist's Last.fm listener count today — shown against the found-at count saved with the like. */
  listenersNow?: number;
};

const fmt = (n: number) => describeListeners(n).count;

function ListenersLine({ found, now }: { found?: number; now?: number }) {
  if (found != null && now != null) {
    const { pct, calledIt } = describeGrowth(found, now);
    return (
      <ThemedView style={styles.listenersRow} backgroundColor="transparent">
        <ThemedText type="caption">
          Found at {fmt(found)} → {fmt(now)} now
        </ThemedText>
        {pct !== 0 && (
          <ThemedText type="caption" style={calledIt ? styles.calledIt : pct > 0 ? styles.up : styles.down}>
            {calledIt ? 'Called it ' : ''}
            {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}%
          </ThemedText>
        )}
      </ThemedView>
    );
  }
  if (found != null) return <ThemedText type="caption">Found at {fmt(found)} listeners</ThemedText>;
  if (now != null) return <ThemedText type="caption">{fmt(now)} listeners</ThemedText>;
  return null;
}

/** Artwork, title/artist, listener growth (or genre), Apple Music/Spotify links, and a play/pause button — shared by the liked tracks list and export history. */
export function TrackRow({ track, isPlaying, onTogglePlay, disabled = false, listenersNow }: TrackRowProps) {
  return (
    <ThemedView style={styles.row} backgroundColor="transparent">
      {track.artworkUrl100 ? (
        <Image source={{ uri: artworkUrl(track.artworkUrl100, ROW_ARTWORK_SIZE) }} style={styles.artwork} />
      ) : null}
      <ThemedView style={styles.info} backgroundColor="transparent">
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.artist}>
          {track.artistName}
        </ThemedText>
        {track.artistListeners != null || listenersNow != null ? (
          <ListenersLine found={track.artistListeners} now={listenersNow} />
        ) : (
          <ThemedText type="caption">{track.primaryGenreName}</ThemedText>
        )}
        <ThemedView style={styles.linksRow} backgroundColor="transparent">
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
          <TouchableOpacity disabled={disabled} onPress={() => openUrl(lastfmArtistUrl(track.artistName))}>
            <ThemedText type="link" style={[styles.linkText, disabled && styles.dimmed]}>
              Last.fm
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
      <TouchableOpacity disabled={disabled} onPress={onTogglePlay} activeOpacity={0.7}>
        <ThemedView style={[styles.playButton, disabled && styles.dimmed]} backgroundColor={Colors.surfaceElevated}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={Colors.text} />
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  artist: {
    color: Colors.textSecondary,
  },
  dimmed: {
    opacity: 0.35,
  },
  linksRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
  },
  listenersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.sm,
  },
  up: {
    color: Colors.positive,
  },
  down: {
    color: Colors.textSecondary,
  },
  calledIt: {
    color: Colors.accent,
    fontWeight: '700',
  },
  linkText: {
    fontSize: 13,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
