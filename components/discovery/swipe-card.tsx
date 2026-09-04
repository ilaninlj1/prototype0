import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DiscoveryTrack } from '@/lib/discovery';
import { resolveSwipeDirection, rotationForDrag, type SwipeDirection } from './swipe-physics';

const CARD_WIDTH = 320;
const FLY_OUT_DISTANCE = 600;

export function CardFace({ track }: { track: DiscoveryTrack }) {
  return (
    <ThemedView style={styles.card}>
      {track.artworkUrl100 ? (
        <Image source={{ uri: track.artworkUrl100 }} style={styles.artwork} />
      ) : null}
      <ThemedView style={styles.info}>
        <ThemedText type="subtitle">{track.trackName}</ThemedText>
        <ThemedText>{track.artistName}</ThemedText>
        <ThemedText style={styles.dim}>{track.primaryGenreName}</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

type SwipeCardProps = {
  track: DiscoveryTrack;
  onSwipe: (direction: SwipeDirection, track: DiscoveryTrack) => void;
};

export function SwipeCard({ track, onSwipe }: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Pass `track` explicitly rather than letting the caller re-derive "which
  // track was this" from whatever's currently at the front of its own queue.
  // `track` is this component's own prop, so it's pinned to the card that was
  // actually dragged regardless of how much queue state changes elsewhere
  // before this fires (the fly-out animation's runOnJS callback lands ~250ms
  // after the gesture ends).
  function commit(direction: SwipeDirection) {
    onSwipe(direction, track);
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const direction = resolveSwipeDirection(e.translationX, e.translationY);
      if (direction === 'right') {
        translateX.value = withTiming(FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('right'));
      } else if (direction === 'left') {
        translateX.value = withTiming(-FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('left'));
      } else if (direction === 'down') {
        translateY.value = withTiming(FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('down'));
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotationForDrag(translateX.value, CARD_WIDTH)}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>
        <CardFace track={track} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
  },
  artwork: {
    width: '100%',
    height: CARD_WIDTH,
  },
  info: {
    padding: 16,
    gap: 4,
  },
  dim: {
    opacity: 0.6,
  },
});
