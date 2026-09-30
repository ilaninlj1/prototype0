import { useState, type ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';

import { HeartBurst } from '@/components/heart-burst';
import { saveLike } from '@/components/like-button';
import type { DiscoveryTrack } from '@/lib/discovery';

/** Double-tap anything wrapped in this to save its song to Liked, with a heart burst. */
export function DoubleTapLike({ track, style, children }: { track: DiscoveryTrack; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [burst, setBurst] = useState(0);

  function like() {
    setBurst((n) => n + 1);
    saveLike(track);
  }

  const gesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(like)();
    });

  if (Platform.OS === 'web') return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style}>
        {children}
        {burst > 0 && <HeartBurst key={burst} />}
      </Animated.View>
    </GestureDetector>
  );
}
