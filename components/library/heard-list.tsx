import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useHeardTracks } from '@/hooks/use-heard-tracks';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { heardDays, outcomeLine, type HeardSong } from '@/lib/heard';

const SHOW_MAX = 300;

type Props = {
  songs: HeardSong[];
  likedIds: Set<number>;
  liked: DiscoveryTrack[];
  playingId: number | null;
  playing: boolean;
  /** For Today and Yesterday. */
  now: number;
  onPlay: (track: DiscoveryTrack) => void;
  onHeart: (track: DiscoveryTrack, hearted: boolean) => void;
};

/** Every song you swiped, by day: play it again, or heart it now if it's stuck in your head. */
export function HeardList({ songs, likedIds, liked, playingId, playing, now, onPlay, onHeart }: Props) {
  const shown = songs.slice(0, SHOW_MAX);
  const resolved = useHeardTracks(
    shown.map((s) => s.track.id),
    liked
  );
  if (songs.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText style={styles.emptyTitle}>Nothing heard yet.</ThemedText>
        <ThemedText style={styles.emptyText}>Every song you swipe on Home lands here, so you can find it again later.</ThemedText>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {heardDays(shown, now).map((day) => (
        <View key={day.label} style={styles.day}>
          <ThemedText style={styles.dayLabel} accessibilityRole="header">
            {day.label}
          </ThemedText>
          {day.songs.map((s) => {
            const full = resolved.get(s.track.id);
            const track = full ? { ...full, trackName: full.trackName || s.track.trackName, artistName: full.artistName || s.track.artistName } : s.track;
            const hearted = likedIds.has(track.id);
            const isPlaying = playingId === track.id && playing;
            const canPlay = !!track.previewUrl;
            return (
              <View key={track.id} style={styles.row}>
                <Pressable
                  style={styles.main}
                  disabled={!canPlay}
                  onPress={() => onPlay(track)}
                  accessibilityRole="button"
                  accessibilityLabel={`${track.trackName || 'Unknown song'}, ${track.artistName}. ${outcomeLine(s)}. ${isPlaying ? 'Pause' : 'Play'}`}>
                  <View style={styles.art}>
                    {track.artworkUrl100 ? <Image source={{ uri: artworkUrl(track.artworkUrl100, 120) }} style={StyleSheet.absoluteFill} /> : null}
                    {canPlay && (
                      <View style={styles.playBadge}>
                        <Ionicons name={isPlaying ? 'pause' : 'play'} size={14} color={Colors.text} />
                      </View>
                    )}
                  </View>
                  <View style={styles.words}>
                    <ThemedText style={styles.title} numberOfLines={1}>
                      {track.trackName || 'Unknown song'}
                    </ThemedText>
                    <ThemedText style={styles.sub} numberOfLines={1}>
                      {track.artistName}
                      {track.artistName ? ' · ' : ''}
                      {outcomeLine({ ...s, outcome: hearted ? 'saved' : s.outcome === 'saved' ? 'revealed' : s.outcome })}
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => onHeart(track, hearted)}
                  disabled={!full}
                  hitSlop={10}
                  style={styles.heart}
                  accessibilityRole="button"
                  accessibilityState={{ selected: hearted }}
                  accessibilityLabel={hearted ? `Take the heart off ${track.trackName}` : `Heart ${track.trackName}`}>
                  <Ionicons name={hearted ? 'heart' : 'heart-outline'} size={24} color={hearted ? Colors.signal : full ? Colors.text : Colors.textTertiary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      {songs.length > SHOW_MAX && <ThemedText style={styles.more}>Showing your latest {SHOW_MAX} · search to find older ones</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.lg },
  day: { gap: Spacing.sm },
  dayLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56 },
  art: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.surface },
  playBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textSecondary },
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: Spacing.sm, paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  more: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
