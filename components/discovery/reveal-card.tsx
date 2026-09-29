import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FlipInEasyY } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import type { CardSize } from './swipe-physics';

type RevealCardProps = {
  track: DiscoveryTrack;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  size: CardSize;
  onDone: () => void;
};

/** Shown after a right swipe: who you just liked, and how few people know them. Tap to move on. */
export function RevealCard({ track, listeners, size, onDone }: RevealCardProps) {
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const described = listeners != null ? describeListeners(listeners) : null;

  return (
    <Pressable onPress={onDone}>
      <Animated.View entering={FlipInEasyY.springify().damping(14)}>
        <ThemedView style={[styles.card, size]} backgroundColor={Colors.surface}>
          <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={styles.artwork} />

          <ThemedView style={styles.body} backgroundColor={Colors.surface}>
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

            <ThemedText type="caption" style={styles.hint}>
              Tap to keep going
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
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
    color: Colors.accent,
  },
  hint: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
