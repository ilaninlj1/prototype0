import { StyleSheet, View } from 'react-native';

import type { DiscoveryTrack } from '@/lib/discovery';
import { CardFace, SwipeCard } from './swipe-card';
import type { SwipeDirection } from './swipe-physics';

const STACK_DEPTH = 3;

type CardStackProps = {
  queue: DiscoveryTrack[];
  onSwipe: (direction: SwipeDirection, track: DiscoveryTrack) => void;
  onTap: () => void;
  showPlayIcon: boolean;
};

export function CardStack({ queue, onSwipe, onTap, showPlayIcon }: CardStackProps) {
  const visible = queue.slice(0, STACK_DEPTH);

  return (
    <View style={styles.container}>
      {visible
        .map((track, index) => ({ track, index }))
        .reverse()
        .map(({ track, index }) =>
          index === 0 ? (
            <View key={track.id} style={styles.layer}>
              <SwipeCard track={track} onSwipe={onSwipe} onTap={onTap} showPlayIcon={showPlayIcon} />
            </View>
          ) : (
            <View
              key={track.id}
              pointerEvents="none"
              style={[
                styles.layer,
                { transform: [{ scale: 1 - index * 0.04 }, { translateY: index * 10 }] },
              ]}>
              <CardFace track={track} />
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
