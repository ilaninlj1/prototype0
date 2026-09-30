import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, growthLabel, type DiscoveryTrack } from '@/lib/discovery';

type Props = {
  track: DiscoveryTrack;
  listenersNow?: number;
  playing: boolean;
  selected?: boolean;
  selecting?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

/** A Liked song as a cover, YouTube-style: art first, growth over it like a view count. */
export function CoverCell({ track, listenersNow, playing, selected, selecting, onPress, onLongPress }: Props) {
  const growth = growthLabel(track.artistListeners, listenersNow);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={styles.cell}>
      <View style={[styles.art, selected && styles.artSelected]}>
        <Image source={{ uri: artworkUrl(track.artworkUrl100, 400) }} style={StyleSheet.absoluteFill} />
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.45" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#shade)" />
        </Svg>
        {growth?.calledIt && (
          <View style={styles.called}>
            <ThemedText style={styles.calledText}>called it</ThemedText>
          </View>
        )}
        {(playing || selecting) && (
          <View style={styles.badge}>
            <Ionicons
              name={selecting ? (selected ? 'checkmark-circle' : 'ellipse-outline') : 'pause'}
              size={20}
              color={Colors.text}
            />
          </View>
        )}
        {growth && (
          <View style={styles.growth}>
            <ThemedText style={styles.growthText}>{growth.text}</ThemedText>
            {growth.change && (
              <ThemedText style={[styles.growthText, { color: growth.change.startsWith('↑') ? Colors.highlight : Colors.textSecondary }]}>
                {growth.change}
              </ThemedText>
            )}
          </View>
        )}
      </View>
      <ThemedText style={styles.title} numberOfLines={1}>
        {track.trackName}
      </ThemedText>
      <ThemedText style={styles.artist} numberOfLines={1}>
        {track.artistName}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { width: '48%', gap: 2, marginBottom: Spacing.md },
  art: { aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  artSelected: { borderWidth: 3, borderColor: Colors.accent },
  growth: { position: 'absolute', left: Spacing.sm, right: Spacing.sm, bottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  growthText: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 14, color: Colors.text },
  called: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.highlight, paddingHorizontal: 6, paddingTop: 2, transform: [{ rotate: '-4deg' }], borderTopRightRadius: 4, borderBottomLeftRadius: 5 },
  calledText: { fontFamily: Fonts.marker, fontSize: 12, lineHeight: 16, color: Colors.accentText },
  badge: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: Radius.round, padding: 4 },
  title: { fontFamily: 'Figtree_700Bold', fontSize: 15, lineHeight: 19, marginTop: Spacing.xs },
  artist: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
});
