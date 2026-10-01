import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppleMusicLink, SpotifyLink } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { noteText } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';

/** Spotify-style bar for whatever is playing from a list: art, names, progress, controls. */
export function MiniPlayer({
  track,
  playing,
  progress,
  onToggle,
  onEditNote,
}: {
  track: DiscoveryTrack;
  playing: boolean;
  progress: number;
  onToggle: () => void;
  /** Saved songs only: shows the song's note (or "Add a note") and opens the editor. */
  onEditNote?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Image source={{ uri: artworkUrl(track.artworkUrl100, 200) }} style={styles.art} />
        <View style={styles.text}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {track.trackName}
          </ThemedText>
          <ThemedText style={styles.artist} numberOfLines={1}>
            {track.artistName}
          </ThemedText>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() =>
            router.push({ pathname: '/comments', params: { trackId: String(track.id), title: track.trackName, artist: track.artistName } })
          }>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
        </Pressable>
        <LikeButton track={track} />
        <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel={playing ? 'Pause' : 'Play'}>
          <Ionicons name={playing ? 'pause' : 'play'} size={26} color={Colors.text} />
        </Pressable>
      </View>
      {onEditNote && (
        <Pressable onPress={onEditNote} style={styles.note} accessibilityRole="button" accessibilityLabel={track.note ? 'Edit your note' : 'Add a note'}>
          <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
          {track.note ? (
            <ThemedText style={[noteText, styles.noteText]} numberOfLines={1}>
              {track.note}
            </ThemedText>
          ) : (
            <ThemedText style={styles.addNote}>Add a note</ThemedText>
          )}
        </Pressable>
      )}
      <View style={styles.links}>
        <AppleMusicLink trackId={track.id} url={track.trackViewUrl} height={26} />
        <SpotifyLink artist={track.artistName} title={track.trackName} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, overflow: 'hidden', marginHorizontal: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm },
  art: { width: 44, height: 44, borderRadius: Radius.sm },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Figtree_700Bold', fontSize: 14, lineHeight: 18 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: Spacing.sm },
  noteText: { flex: 1 },
  addNote: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  links: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingBottom: 2 },
  artist: { fontSize: 12, lineHeight: 16, color: Colors.textSecondary, flexShrink: 1 },
  track: { height: 2, backgroundColor: 'rgba(243,234,216,0.15)' },
  fill: { height: 2, backgroundColor: Colors.signal },
});
