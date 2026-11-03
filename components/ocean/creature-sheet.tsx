import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader, sheetStyles } from '@/components/ui/sheet';
import { Colors, Spacing } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { placeLabel } from '@/lib/ocean-map';
import { whyLines, type Creature } from '@/lib/ocean-person';

/** A creature explains itself: which song it is, and why it looks the way it does. */
export function CreatureSheet({
  creature,
  track,
  blind,
  playing,
  onPlay,
  onSwipeLike,
  onClose,
}: {
  creature: Creature | null;
  track: DiscoveryTrack | null;
  /** The song's card is still up and blind: nothing here may give it away. */
  blind: boolean;
  playing: boolean;
  onPlay: () => void;
  onSwipeLike: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={!!creature} onClose={onClose} maxHeight="80%">
      {creature && (
        <>
          <SheetHeader title={blind ? 'Still blind' : 'Your song'} onDone={onClose} />
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {blind ? (
              <ThemedText style={styles.blind}>Still blind. Reveal it on Home first.</ThemedText>
            ) : (
              <View style={styles.song}>
                {!!track?.artworkUrl100 && <Image source={{ uri: track.artworkUrl100 }} style={styles.cover} accessibilityIgnoresInvertColors />}
                <View style={styles.names}>
                  <ThemedText style={styles.title} numberOfLines={2}>
                    {track?.trackName ?? 'A song you saved'}
                  </ThemedText>
                  <ThemedText style={styles.artist} numberOfLines={1}>
                    {track?.artistName ?? creature.artist}
                  </ThemedText>
                  <ThemedText style={styles.artist}>{placeLabel(creature.place)}</ThemedText>
                </View>
              </View>
            )}
            {!blind && !!track?.note && <ThemedText style={styles.note}>{track.note}</ThemedText>}
            {!blind && (
              <View style={styles.actions}>
                {!!track?.previewUrl && (
                  <Pressable style={styles.play} onPress={onPlay} accessibilityRole="button">
                    <ThemedText style={styles.playText}>{playing ? 'Pause' : 'Play'}</ThemedText>
                  </Pressable>
                )}
                <Pressable style={styles.outline} onPress={onSwipeLike} accessibilityRole="button">
                  <ThemedText style={styles.outlineText}>Swipe songs like this</ThemedText>
                </Pressable>
              </View>
            )}
            {/* Even the reasons can hint at it (a school means you already saved this artist), so they wait too. */}
            {!blind && <ThemedText style={sheetStyles.heading}>Why it looks like this</ThemedText>}
            {!blind &&
              whyLines(creature, Date.now()).map((line) => (
                <ThemedText key={line} style={styles.line}>
                  {line}
                </ThemedText>
              ))}
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  blind: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: Colors.text },
  song: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  cover: { width: 84, height: 84, borderRadius: 16, backgroundColor: Colors.surface },
  names: { flex: 1, gap: 2 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: Colors.text },
  artist: { fontSize: 14, lineHeight: 19, color: Colors.textSecondary },
  note: { fontSize: 15, lineHeight: 21, color: Colors.text, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  play: { backgroundColor: Colors.text, borderRadius: 22, height: 44, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  playText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: Colors.accentText },
  outline: { borderWidth: 1, borderColor: Colors.rule, borderRadius: 22, height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.text },
  line: { fontSize: 15, lineHeight: 21, color: Colors.text },
});
