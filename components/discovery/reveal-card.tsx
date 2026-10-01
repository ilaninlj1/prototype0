import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FlipInEasyY, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppleMusicLink, SpotifyLink, LastfmLink } from '@/components/credits';
import { DoubleTapLike } from '@/components/double-tap-like';
import { HumanBadge } from '@/components/human-badge';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Fonts, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { COVER_BLUR } from './swipe-card';

/** The small cover beside the title, in pixels. */
export const REVEAL_COVER = 96;
const CONTROL = 56;
/** The small cover's center, from the card's top-left corner — where Home's collage flight takes off. */
export const REVEAL_COVER_CENTER = {
  x: 1 + Spacing.lg + REVEAL_COVER / 2,
  y: 1 + Spacing.lg + CONTROL + Spacing.lg + REVEAL_COVER / 2,
};

type RevealCardProps = {
  track: DiscoveryTrack;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  /** The card is this wide and as tall as its content; it scrolls, it never clips. */
  width: number;
  onDone: () => void;
  /** Extra lines under the listener count — DJ Picks puts the DJ's note here. */
  extra?: ReactNode;
};

/**
 * Shown after a right swipe. Up top only what you need to move on: the
 * controls, Next, who it is and how few people know them. Links, the big
 * cover and comments wait below "Swipe up to reveal more".
 */
export function RevealCard({ track, listeners, width, onDone, extra }: RevealCardProps) {
  const router = useRouter();
  const { player, status } = usePlayback();
  const scrollRef = useRef<ScrollView>(null);
  const moreY = useRef(0);
  // The cover arrives still blurred, as it was on the blind card, then sharpens.
  const blur = useSharedValue(1);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    blur.set(withDelay(450, withTiming(0, { duration: 1000 })));
  }, [blur]);
  const blurStyle = useAnimatedStyle(() => ({ opacity: blur.get() }));

  // The preview keeps playing through the reveal; once it has run out, play starts it over.
  const ended = !status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.25;
  async function togglePlay() {
    if (!status.isLoaded) return;
    if (status.playing) return player.pause();
    if (ended) await player.seekTo(0);
    player.play();
  }
  async function restart() {
    if (!status.isLoaded) return;
    await player.seekTo(0);
    player.play();
  }

  const described = listeners != null ? describeListeners(listeners) : null;
  // Full-width inside the padding, never cropped.
  const side = Math.round(width - 2 - Spacing.lg * 2);

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
      <DoubleTapLike track={track}>
        <Animated.View entering={FlipInEasyY.springify().damping(14)}>
          <ThemedView style={[styles.card, { width }]} backgroundColor="transparent">
            <View style={styles.body}>
              <View style={styles.controls}>
                <Pressable style={styles.control} onPress={togglePlay} accessibilityLabel={status.playing ? 'Pause' : 'Play'}>
                  <Ionicons name={status.playing ? 'pause' : 'play'} size={24} color={Colors.text} />
                </Pressable>
                <Pressable style={styles.control} onPress={restart} accessibilityLabel="Play from the start">
                  <Ionicons name="refresh" size={24} color={Colors.text} />
                </Pressable>
                <Pressable style={styles.next} onPress={onDone}>
                  <ThemedText style={styles.nextLabel}>Next</ThemedText>
                  <Ionicons name="arrow-forward" size={22} color={Colors.accentText} />
                </Pressable>
              </View>

              <View style={styles.head}>
                <View style={styles.cover}>
                  <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={StyleSheet.absoluteFill} />
                  <Animated.View style={[StyleSheet.absoluteFill, blurStyle]} pointerEvents="none">
                    <Image source={{ uri: artworkUrl(track.artworkUrl100, 100) }} style={StyleSheet.absoluteFill} blurRadius={COVER_BLUR} />
                  </Animated.View>
                </View>
                <View style={styles.names}>
                  <ThemedText type="subtitle" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {track.trackName}
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={styles.secondary}>
                    {track.artistName}
                  </ThemedText>
                  {!!track.primaryGenreName && (
                    <ThemedText numberOfLines={1} style={styles.genre}>
                      {track.primaryGenreName}
                    </ThemedText>
                  )}
                </View>
              </View>

              <ThemedView style={styles.stat} backgroundColor="transparent">
                {described ? (
                  <Animated.View entering={FadeIn.delay(450)}>
                    <ThemedText style={styles.count}>{described.count}</ThemedText>
                    <ThemedText style={styles.secondary}>listeners · {described.verdict}</ThemedText>
                  </Animated.View>
                ) : listeners === undefined ? (
                  <ActivityIndicator color={Colors.accent} style={styles.loading} />
                ) : (
                  <ThemedText style={styles.secondary}>Last.fm has no count for this artist yet.</ThemedText>
                )}
              </ThemedView>
              {extra}

              <Pressable
                style={styles.more}
                onPress={() => scrollRef.current?.scrollTo({ y: moreY.current, animated: true })}
                accessibilityLabel="Reveal more about this song">
                <ThemedText style={styles.moreLabel}>Swipe up to reveal more</ThemedText>
                <Ionicons name="chevron-up" size={16} color={Colors.textSecondary} />
              </Pressable>

              <View style={styles.details} onLayout={(e) => (moreY.current = e.nativeEvent.layout.y)}>
                <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={[styles.bigCover, { width: side, height: side }]} />
                <HumanBadge artist={track.artistName} />
                <ThemedView style={styles.links} backgroundColor="transparent">
                  <AppleMusicLink trackId={track.id} url={track.trackViewUrl} />
                  <SpotifyLink artist={track.artistName} title={track.trackName} />
                  {described && <LastfmLink artist={track.artistName} />}
                </ThemedView>
                <View style={styles.actions}>
                  <LikeButton track={track} size={26} />
                  <Pressable
                    style={styles.commentsBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/comments',
                        params: { trackId: String(track.id), title: track.trackName, artist: track.artistName },
                      })
                    }>
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.text} />
                    <ThemedText style={Ui.label}>Comments</ThemedText>
                  </Pressable>
                </View>
                <ThemedText style={styles.hint}>double-tap to save it</ThemedText>
              </View>
            </View>
          </ThemedView>
        </Animated.View>
      </DoubleTapLike>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'stretch' },
  // No fill: a thin cream outline, like the buttons.
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  body: {
    padding: Spacing.lg,
    gap: 2,
  },
  controls: { flexDirection: 'row', gap: Spacing.sm, height: CONTROL },
  control: { ...Ui.outlineButton, width: CONTROL, height: CONTROL, paddingHorizontal: 0 },
  next: { ...Ui.outlineButton, flex: 1, height: CONTROL, backgroundColor: Colors.accent, borderColor: Colors.accent, gap: Spacing.sm },
  nextLabel: { ...Ui.label, fontSize: 18, lineHeight: 22, color: Colors.accentText },
  head: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, alignItems: 'center' },
  cover: { width: REVEAL_COVER, height: REVEAL_COVER, borderRadius: Radius.sm, overflow: 'hidden' },
  names: { flex: 1, gap: 2 },
  secondary: {
    color: Colors.textSecondary,
  },
  genre: { ...Ui.label, fontSize: 12, lineHeight: 16, color: Colors.textTertiary },
  stat: {
    marginTop: Spacing.md,
  },
  loading: {
    alignSelf: 'flex-start',
    height: 44,
  },
  count: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    color: Colors.signal,
    fontFamily: Fonts.display,
  },
  more: { ...Ui.textButton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md },
  moreLabel: { ...Ui.label, color: Colors.textSecondary },
  details: { gap: 2, paddingTop: Spacing.sm },
  bigCover: { borderRadius: Radius.sm, marginBottom: Spacing.md },
  links: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  commentsBtn: Ui.outlineButton,
  hint: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16, color: Colors.textTertiary, marginTop: Spacing.xs },
});
