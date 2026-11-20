import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { CallButton } from '@/components/discovery/call-button';
import { useSkyInk } from '@/components/home/sky-ink';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Typography } from '@/constants/theme';
import { useTextScale } from '@/hooks/use-text-scale';
import { describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { releaseLine } from '@/lib/song-age';
import { scaled, TEXT_CAP } from '@/lib/text-scale';

type Props = {
  track: DiscoveryTrack;
  revealed: boolean;
  /** "104 BPM · E minor · Close to home" (lib/home-copy.ts cluesLine), or null when nothing is measured. */
  clues: string | null;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  onCallSave?: (track: DiscoveryTrack) => Promise<void>;
  /** A bottle's "Washed up from Lisbon": takes the release line's place, which stays in Details. */
  origin?: string | null;
  /** A first-time visitor's hint, said in place of "Just listen." while the finger shows on the card. */
  hint?: string | null;
};

// Fixed, so the buttons under it never move between blind and revealed.
export const LISTEN_INFO_HEIGHT = 92;

/** The box is taller when the phone's text is bigger, so its three lines still fit; the card above gives up the room. */
export function listenInfoHeight(fontScale: number): number {
  return scaled(LISTEN_INFO_HEIGHT, fontScale, TEXT_CAP.label);
}

/**
 * The words under the card. Blind: "Just listen." and the only clues, tempo,
 * key and how far it is from your taste. Revealed: who it is, when it came
 * out, how many people listen, and Call it.
 */
export function ListenInfo({ track, revealed, clues, listeners, onCallSave, origin, hint }: Props) {
  const reduceMotion = useReducedMotion();
  const ink = useSkyInk();
  const box = [styles.box, { height: listenInfoHeight(useTextScale()) }];
  // Increase Contrast: a panel hugs the words only, not the whole box they sit in.
  const panel = ink.backing ? [styles.panel, { backgroundColor: ink.backing }] : styles.plain;
  if (!revealed) {
    return (
      <View style={box}>
        <View style={panel}>
          <ThemedText type="subtitle" grows="label" style={[styles.center, { color: ink.text }]} accessibilityLiveRegion="polite">
            {hint ?? 'Just listen.'}
          </ThemedText>
          {!!clues && (
            <ThemedText
              grows="label"
              style={[styles.caption, styles.center, { color: ink.secondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {clues}
            </ThemedText>
          )}
        </View>
      </View>
    );
  }
  const described = listeners != null ? describeListeners(listeners) : null;
  const release = origin ?? releaseLine(track.releaseDate, track.collectionName);
  return (
    <Animated.View key={track.id} entering={FadeIn.delay(reduceMotion ? 0 : 700)} style={box}>
      <View style={panel}>
        <ThemedText grows="label" style={[styles.title, styles.center, { color: ink.text }]} numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText grows="label" style={[styles.caption, styles.center, { color: ink.secondary }]} numberOfLines={1}>
          {release ? `${track.artistName} · ${release}` : track.artistName}
        </ThemedText>
        <View style={styles.callRow}>
          <ThemedText grows="label" style={[styles.caption, styles.listeners, { color: ink.secondary }]} numberOfLines={1}>
            {described ? `${described.count} listeners` : listeners === undefined ? 'Counting listeners…' : 'No listener count yet'}
          </ThemedText>
          <View style={styles.call}>
            <CallButton track={track} listeners={listeners} onSave={onCallSave} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: LISTEN_INFO_HEIGHT,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: 4,
  },
  center: { textAlign: 'center' },
  plain: { alignSelf: 'stretch', gap: 4 },
  panel: {
    alignSelf: 'center',
    maxWidth: '100%',
    gap: 2,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  caption: {
    ...Typography.caption,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  title: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  call: { width: 116, flexDirection: 'row' },
  listeners: { flexShrink: 1 },
});
