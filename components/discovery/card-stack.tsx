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
  playing: boolean;
  showPlayIcon: boolean;
  allowDown?: boolean;
};

export function CardStack({ queue, cardSize, onSwipe, onHold, playing, showPlayIcon, allowDown }: CardStackProps) {
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
                playing={playing}
                showPlayIcon={showPlayIcon}
                allowDown={allowDown}
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
              <CardFace size={cardSize} />
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
