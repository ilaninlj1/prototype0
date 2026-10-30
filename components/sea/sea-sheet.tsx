import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Spacing } from '@/constants/theme';
import { journeySummary } from '@/lib/bottle-journey';
import type { Bottle } from '@/lib/bottle-rows';
import type { DiscoveryTrack } from '@/lib/discovery';

type Props = {
  bottle: Bottle;
  track: DiscoveryTrack | null;
  color: string;
  playing: boolean;
  bottom: number;
  onPlay: () => void;
  onClose: () => void;
};

function day(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A tapped bottle on the Sea: its song (to play), how it's doing, and every stop in order. */
export function SeaSheet({ bottle, track, color, playing, bottom, onPlay, onClose }: Props) {
  const title = track ? track.trackName : 'A song you floated';
  return (
    <View style={[styles.sheet, { paddingBottom: bottom + Spacing.lg }]}>
      <View style={styles.top}>
        <View style={[styles.light, { backgroundColor: color }]} />
        <View style={styles.words}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          {track && (
            <ThemedText style={styles.artist} numberOfLines={1}>
              {track.artistName}
            </ThemedText>
          )}
        </View>
        {track?.previewUrl ? (
          <Pressable
            onPress={onPlay}
            hitSlop={8}
            style={styles.play}
            accessibilityRole="button"
            accessibilityLabel={playing ? `Pause ${title}` : `Play ${title}`}>
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={DarkColors.accentText} />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={DarkColors.textSecondary} />
        </Pressable>
      </View>
      <ThemedText style={styles.summary}>{journeySummary(bottle)}</ThemedText>
      <ScrollView style={styles.stops} contentContainerStyle={styles.stopsInner}>
        {bottle.hops.map((h, i) => (
          <View key={i} style={styles.stop} accessible accessibilityLabel={`${h.kind === 'launch' ? 'Found blind' : 'Kept'} in ${h.city}, ${day(h.at)}`}>
            <View style={[styles.dot, h.kind === 'launch' && { backgroundColor: color }]} />
            <ThemedText style={styles.city} numberOfLines={1}>
              {h.city}
            </ThemedText>
            <ThemedText style={styles.kind}>{h.kind === 'launch' ? 'Found blind' : 'Kept'}</ThemedText>
            <ThemedText style={styles.kind}>{day(h.at)}</ThemedText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: DarkColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  light: { width: 12, height: 12, borderRadius: 6 },
  words: { flex: 1 },
  title: { fontFamily: Fonts.display, fontSize: 20, lineHeight: 26, color: DarkColors.text },
  artist: { fontSize: 14, color: DarkColors.textSecondary },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: DarkColors.accent, alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 14, color: DarkColors.text },
  stops: { maxHeight: 150 },
  stopsInner: { gap: Spacing.xs },
  stop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DarkColors.textSecondary },
  city: { flex: 1, fontSize: 14, color: DarkColors.text },
  kind: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.6, color: DarkColors.textSecondary },
});
