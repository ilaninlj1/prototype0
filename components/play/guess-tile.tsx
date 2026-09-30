import { Image } from 'expo-image';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FlipInEasyY } from 'react-native-reanimated';

import { AppleMusicLink } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Fonts } from '@/constants/theme';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';

type Props = {
  label: string;
  sub?: string;
  selected?: boolean;
  revealed?: boolean;
  correct?: boolean;
  song?: { title: string; artist: string; artworkUrl: string; listeners: number; itunesTrackId?: number };
  onPress?: () => void;
  /** When revealed, show a heart to save this song to Liked. */
  likeTrack?: DiscoveryTrack;
};

/** A blind numbered tile that flips to show the song and its listener count. */
export function GuessTile({ label, sub, selected, revealed, correct, song, onPress, likeTrack }: Props) {
  const border = revealed && correct ? Colors.positive : selected ? Colors.accent : 'transparent';
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.8} style={styles.wrap}>
      {revealed && song ? (
        <Animated.View entering={FlipInEasyY.springify().damping(14)}>
          <ThemedView style={[styles.tile, { borderColor: border }]} backgroundColor={Colors.surface}>
            <Image source={{ uri: artworkUrl(song.artworkUrl, 300) }} style={styles.art} />
            <ThemedText type="defaultSemiBold" numberOfLines={2} style={styles.title}>
              {song.title}
            </ThemedText>
            <ThemedText type="caption" numberOfLines={1}>{song.artist}</ThemedText>
            <ThemedText style={styles.count}>{describeListeners(song.listeners).count}</ThemedText>
            {song.itunesTrackId != null && <AppleMusicLink trackId={song.itunesTrackId} />}
            {likeTrack && <LikeButton track={likeTrack} />}
          </ThemedView>
        </Animated.View>
      ) : (
        <ThemedView style={[styles.tile, { borderColor: border }]} backgroundColor={Colors.surface}>
          <ThemedText style={styles.label}>{label}</ThemedText>
          {sub && <ThemedText type="caption">{sub}</ThemedText>}
        </ThemedView>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '46%', flexGrow: 1 },
  tile: { aspectRatio: 0.85, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, padding: Spacing.sm, gap: 2 },
  label: { fontSize: 36, lineHeight: 40, fontWeight: '800' },
  art: { width: '70%', aspectRatio: 1, borderRadius: Radius.sm, marginBottom: 4 },
  title: { textAlign: 'center', fontSize: 14, lineHeight: 18 },
  count: { color: Colors.signal, fontFamily: Fonts.display, fontWeight: '800', fontSize: 18 },
});
