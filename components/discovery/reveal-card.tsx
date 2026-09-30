import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FlipInEasyY } from 'react-native-reanimated';

import { AppleMusicLink, SpotifyLink, CreditLine, LastfmLink } from '@/components/credits';
import { DoubleTapLike } from '@/components/double-tap-like';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Fonts } from '@/constants/theme';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import type { CardSize } from './swipe-physics';

type RevealCardProps = {
  track: DiscoveryTrack;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  size: CardSize;
  onDone: () => void;
};

/** Shown after a right swipe: who it is, how few people know them, and what people say. */
export function RevealCard({ track, listeners, size, onDone }: RevealCardProps) {
  const router = useRouter();
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const described = listeners != null ? describeListeners(listeners) : null;

  return (
    <DoubleTapLike track={track}>
      <Animated.View entering={FlipInEasyY.springify().damping(14)}>
        <ThemedView style={[styles.card, size]} backgroundColor={Colors.surface}>
          {/* The song's own colors: its art, blurred behind the whole card. */}
          <Image source={{ uri: artworkUrl(track.artworkUrl100, 100) }} style={StyleSheet.absoluteFill} blurRadius={50} />
          <ThemedView style={[StyleSheet.absoluteFill, styles.scrim]} backgroundColor="transparent" />
          <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={styles.artwork} />

          <ThemedView style={styles.body} backgroundColor="transparent">
            <ThemedText type="subtitle" numberOfLines={1}>
              {track.trackName}
            </ThemedText>
            <ThemedText numberOfLines={1} style={styles.secondary}>
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

            <ThemedView style={styles.links} backgroundColor="transparent">
              <AppleMusicLink trackId={track.id} url={track.trackViewUrl} />
              <SpotifyLink artist={track.artistName} title={track.trackName} />
              {described && <LastfmLink artist={track.artistName} />}
            </ThemedView>
            <CreditLine />

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
                <ThemedText type="label">Comments</ThemedText>
              </Pressable>
              <Pressable style={styles.next} onPress={onDone}>
                <ThemedText type="label" style={{ color: Colors.accentText }}>
                  Next
                </ThemedText>
                <Ionicons name="arrow-forward" size={16} color={Colors.accentText} />
              </Pressable>
            </View>
            <ThemedText style={styles.hint}>double-tap to save it</ThemedText>
          </ThemedView>
        </ThemedView>
      </Animated.View>
    </DoubleTapLike>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  artwork: {
    flex: 1,
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
  commentsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' },
  next: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, backgroundColor: Colors.accent },
  hint: { fontFamily: Fonts.note, fontSize: 17, lineHeight: 20, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
});
