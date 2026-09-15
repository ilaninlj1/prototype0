import { StyleSheet, View } from 'react-native';

import type { DiscoveryTrack } from '@/lib/discovery';
import { CardFace, SwipeCard } from './swipe-card';
import type { CardSize, SwipeDirection } from './swipe-physics';

const STACK_DEPTH = 3;

type CardStackProps = {
  queue: DiscoveryTrack[];
  /** Computed by the screen from the space actually available — see computeCardSize. Shared by every layered card so the stack stays uniform. */
  cardSize: CardSize;
  onSwipe: (direction: SwipeDirection, track: DiscoveryTrack) => void;
  /** Fires on a ~400ms hold on the top card, not a tap — see SwipeCard. */
  onHold: () => void;
  showPlayIcon: boolean;
  /** Passed through to every layered card uniformly — see CardFace's own doc comment. Uniform so swiping the top card away doesn't visibly shift where the next card's artwork starts. */
  artworkTopInset?: number;
};

export function CardStack({ queue, cardSize, onSwipe, onHold, showPlayIcon, artworkTopInset }: CardStackProps) {
  const visible = queue.slice(0, STACK_DEPTH);

  return (
    <View style={styles.container}>
      {visible
        .map((track, index) => ({ track, index }))
        .reverse()
        .map(({ track, index }) =>
          index === 0 ? (
            <View key={track.id} style={styles.layer}>
              <SwipeCard
                track={track}
                size={cardSize}
                onSwipe={onSwipe}
                onHold={onHold}
                showPlayIcon={showPlayIcon}
                artworkTopInset={artworkTopInset}
              />
            </View>
          ) : (
            <View
              key={track.id}
              pointerEvents="none"
              style={[
                styles.layer,
                { transform: [{ scale: 1 - index * 0.04 }, { translateY: index * 10 }] },
              ]}>
              <CardFace track={track} size={cardSize} artworkTopInset={artworkTopInset} />
            </View>
          )
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  layer: {
    position: 'absolute',
  },
});
