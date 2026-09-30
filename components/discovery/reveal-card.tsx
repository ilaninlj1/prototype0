import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
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
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { COVER_BLUR } from './swipe-card';
import type { CardSize } from './swipe-physics';

type RevealCardProps = {
  track: DiscoveryTrack;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  size: CardSize;
  onDone: () => void;
  /** Extra lines under the listener count — DJ Picks puts the DJ's note here. */
  extra?: ReactNode;
};

/** Shown after a right swipe: who it is, how few people know them, and what people say. */
export function RevealCard({ track, listeners, size, onDone, extra }: RevealCardProps) {
  const router = useRouter();
  // The cover arrives still blurred, as it was on the blind card, then sharpens.
  const blur = useSharedValue(1);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    blur.set(withDelay(450, withTiming(0, { duration: 1000 })));
  }, [blur]);
  const blurStyle = useAnimatedStyle(() => ({ opacity: blur.get() }));

  const described = listeners != null ? describeListeners(listeners) : null;
  // A full square cover, never cropped: as wide as the card allows, or smaller on a short screen.
  const side = Math.round(Math.min(size.width - Spacing.lg * 2, size.height * 0.5));

  return (
    <DoubleTapLike track={track}>
      <Animated.View entering={FlipInEasyY.springify().damping(14)}>
        <ThemedView style={[styles.card, size]} backgroundColor="transparent">
          <View style={[styles.artwork, { width: side, height: side }]}>
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={StyleSheet.absoluteFill} />
            <Animated.View style={[StyleSheet.absoluteFill, blurStyle]} pointerEvents="none">
              <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={StyleSheet.absoluteFill} blurRadius={COVER_BLUR} />
            </Animated.View>
          </View>

          {/* Never cut off: long text scrolls under the cover instead of clipping. */}
          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
            <ThemedText type="subtitle" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {track.trackName}
            </ThemedText>
            <ThemedText numberOfLines={2} style={styles.secondary}>
              {track.artistName}
            </ThemedText>

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
            <HumanBadge artist={track.artistName} />
            {extra}

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
              <Pressable style={styles.next} onPress={onDone}>
                <ThemedText style={[Ui.label, { color: Colors.accentText }]}>
                  Next
                </ThemedText>
                <Ionicons name="arrow-forward" size={16} color={Colors.accentText} />
              </Pressable>
            </View>
            <ThemedText style={styles.hint}>double-tap to save it</ThemedText>
          </ScrollView>
        </ThemedView>
      </Animated.View>
    </DoubleTapLike>
  );
}

const styles = StyleSheet.create({
  // No fill: a thin cream outline, like the buttons.
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  artwork: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  body: {
    padding: Spacing.lg,
    gap: 2,
  },
  secondary: {
    color: Colors.textSecondary,
  },
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
  links: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  commentsBtn: Ui.outlineButton,
  next: { ...Ui.outlineButton, marginLeft: 'auto', backgroundColor: Colors.accent, borderColor: Colors.accent },
  hint: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16, color: Colors.textTertiary, marginTop: Spacing.xs },
});
