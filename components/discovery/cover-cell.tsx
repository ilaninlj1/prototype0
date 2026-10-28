import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { noteText } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, TapTarget, Ui } from '@/constants/theme';
import { callLabel, callReceipt, type CalledShot } from '@/lib/called-shots';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { foundLine } from '@/lib/library';

type Props = {
  track: DiscoveryTrack;
  listenersNow?: number;
  /** Now, for "Found at 98.6K · today". */
  today: number;
  call?: CalledShot;
  onShare?: (message: string) => void;
  playing: boolean;
  selected?: boolean;
  selecting?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

/** A saved song in the Library grid: the cover, then the title, the artist and how the artist grew since you found them. */
export function CoverCell({ track, listenersNow, today, call, onShare, playing, selected, selecting, onPress, onLongPress }: Props) {
  const found = foundLine(track.artistListeners, listenersNow, track.likedAt, today);
  const receipt = call ? callReceipt(call, listenersNow) : null;
  const a11y = [track.trackName, track.artistName, found?.text, found?.change].filter(Boolean).join(', ');
  return (
    <View style={styles.cell}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={styles.content}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={selecting ? (selected ? 'Picked. Tap to unpick.' : 'Tap to pick.') : 'Plays a preview. Hold to pick songs.'}
        accessibilityState={selecting ? { selected: !!selected } : undefined}>
        <View style={[styles.art, selected && styles.artSelected]}>
          <Image source={{ uri: artworkUrl(track.artworkUrl100, 400) }} style={StyleSheet.absoluteFill} />
          {receipt && (
            <View style={styles.called}>
              <ThemedText style={styles.calledText}>called it</ThemedText>
            </View>
          )}
          {(playing || selecting) && (
            <View style={[styles.badge, selected && styles.badgeOn]}>
              <Ionicons
                name={selecting ? (selected ? 'checkmark' : 'ellipse-outline') : 'pause'}
                size={18}
                color={selected ? Colors.accentText : Colors.text}
              />
            </View>
          )}
        </View>
        <ThemedText style={styles.title} numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText style={styles.artist} numberOfLines={1}>
          {track.artistName}
        </ThemedText>
        {found && (
          <ThemedText style={styles.found} numberOfLines={2}>
            {found.text}
            {found.change && <ThemedText style={[styles.found, found.up && styles.up]}>{` · ${found.change.replace(' ', '\u00a0')}`}</ThemedText>}
          </ThemedText>
        )}
        {call && <ThemedText style={styles.found}>{callLabel(call, listenersNow)}</ThemedText>}
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
  cell: { width: '48%', gap: 2, marginBottom: Spacing.lg },
  content: { gap: 2 },
  share: { ...Ui.outlineButton, minHeight: 36, alignSelf: 'flex-start', backgroundColor: Colors.accent, borderColor: Colors.accent, marginTop: Spacing.xs },
  shareLabel: { ...Ui.label, color: Colors.accentText },
  disabled: { opacity: 0.5 },
  art: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.surface, marginBottom: Spacing.xs },
  artSelected: { borderWidth: 3, borderColor: Colors.accent },
  // A hand-placed gold scrap, black marker on it.
  called: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.highlight, paddingHorizontal: 6, paddingTop: 2, transform: [{ rotate: '-4deg' }], borderTopRightRadius: 4, borderBottomLeftRadius: 5 },
  calledText: { fontFamily: Fonts.marker, fontSize: 12, lineHeight: 16, color: Colors.text },
  badge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: TapTarget - 12,
    height: TapTarget - 12,
    borderRadius: (TapTarget - 12) / 2,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: Colors.accent },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, lineHeight: 19 },
  artist: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  found: { fontSize: 12, lineHeight: 16, color: Colors.textSecondary },
  up: { color: Colors.text, fontFamily: Fonts.sansSemiBold },
  note: { marginTop: 2, transform: [{ rotate: '-1deg' }] },
});
