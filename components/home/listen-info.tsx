import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { CallButton } from '@/components/discovery/call-button';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Typography } from '@/constants/theme';
import { describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { releaseLine } from '@/lib/song-age';

type Props = {
  track: DiscoveryTrack;
  revealed: boolean;
  /** "104 BPM · E minor · Close to home" (lib/home-copy.ts cluesLine), or null when nothing is measured. */
  clues: string | null;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  onCallSave?: (track: DiscoveryTrack) => Promise<void>;
};

// Fixed, so the buttons under it never move between blind and revealed.
const HEIGHT = 92;

/**
 * The words under the card. Blind: "Just listen." and the only clues, tempo,
 * key and how far it is from your taste. Revealed: who it is, when it came
 * out, how many people listen, and Call it.
 */
export function ListenInfo({ track, revealed, clues, listeners, onCallSave }: Props) {
  const reduceMotion = useReducedMotion();
  if (!revealed) {
    return (
      <View style={styles.box}>
        <ThemedText type="subtitle" style={styles.center}>
          Just listen.
        </ThemedText>
        {!!clues && <ThemedText style={[styles.caption, styles.center]}>{clues}</ThemedText>}
      </View>
    );
  }
  const described = listeners != null ? describeListeners(listeners) : null;
  const release = releaseLine(track.releaseDate, track.collectionName);
  return (
    <Animated.View key={track.id} entering={FadeIn.delay(reduceMotion ? 0 : 700)} style={styles.box}>
      <ThemedText style={[styles.title, styles.center]} numberOfLines={1}>
        {track.trackName}
      </ThemedText>
      <ThemedText style={[styles.caption, styles.center]} numberOfLines={1}>
        {release ? `${track.artistName} · ${release}` : track.artistName}
      </ThemedText>
      <View style={styles.callRow}>
        <ThemedText style={styles.caption} numberOfLines={1}>
          {described ? `${described.count} listeners` : listeners === undefined ? 'Counting listeners…' : 'No listener count yet'}
        </ThemedText>
        <View style={styles.call}>
          <CallButton track={track} listeners={listeners} onSave={onCallSave} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT, justifyContent: 'center', gap: 4 },
  center: { textAlign: 'center' },
  caption: { ...Typography.caption, fontSize: 15, lineHeight: 20, color: Colors.textSecondary },
  title: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  call: { width: 116, flexDirection: 'row' },
});
