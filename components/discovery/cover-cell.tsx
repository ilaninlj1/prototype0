import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { noteText } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { callLabel, callReceipt, type CalledShot } from '@/lib/called-shots';
import { artworkUrl, growthLabel, type DiscoveryTrack } from '@/lib/discovery';

type Props = {
  track: DiscoveryTrack;
  listenersNow?: number;
  call?: CalledShot;
  onShare?: (message: string) => void;
  playing: boolean;
  selected?: boolean;
  selecting?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

/** A Liked song as a cover, YouTube-style: art first, growth over it like a view count. */
export function CoverCell({ track, listenersNow, call, onShare, playing, selected, selecting, onPress, onLongPress }: Props) {
  const growth = growthLabel(track.artistListeners, listenersNow);
  const receipt = call ? callReceipt(call, listenersNow) : null;
  return (
    <View style={styles.cell}>
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={styles.content}>
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
          {receipt && (
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
        {call && <ThemedText type="caption">{callLabel(call, listenersNow)}</ThemedText>}
        {track.note && (
          <ThemedText style={[noteText, styles.note]} numberOfLines={2}>
            “{track.note}”
          </ThemedText>
        )}
      </Pressable>
      {receipt && onShare && (
        <Pressable
          style={[styles.share, selecting && styles.disabled]}
          disabled={selecting}
          onPress={() => onShare(receipt)}
          accessibilityRole="button"
          accessibilityLabel={`Share your call for ${track.trackName}`}>
          <Ionicons name="share-outline" size={16} color={Colors.accentText} />
          <ThemedText style={styles.shareLabel}>Share</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: '48%', gap: 2, marginBottom: Spacing.md },
  content: { gap: 2 },
  share: { ...Ui.outlineButton, alignSelf: 'flex-start', backgroundColor: Colors.accent, borderColor: Colors.accent, marginTop: Spacing.xs },
  shareLabel: { ...Ui.label, color: Colors.accentText },
  disabled: { opacity: 0.5 },
  art: { aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  artSelected: { borderWidth: 3, borderColor: Colors.accent },
  growth: { position: 'absolute', left: Spacing.sm, right: Spacing.sm, bottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between' },
  growthText: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 14, color: Colors.text },
  called: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.highlight, paddingHorizontal: 6, paddingTop: 2, transform: [{ rotate: '-4deg' }], borderTopRightRadius: 4, borderBottomLeftRadius: 5 },
  calledText: { fontFamily: Fonts.marker, fontSize: 12, lineHeight: 16, color: Colors.accentText },
  badge: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: Radius.round, padding: 4 },
  title: { fontFamily: 'Figtree_700Bold', fontSize: 15, lineHeight: 19, marginTop: Spacing.xs },
  artist: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  note: { marginTop: 2, transform: [{ rotate: '-1deg' }] },
});
