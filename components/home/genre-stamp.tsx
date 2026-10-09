import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';

const TOTAL_MS = 700;

/**
 * A down swipe: the new genre's name stamps over the card area for a moment
 * before the next song arrives. "New to you" only when your history says so.
 */
export function GenreStamp({ genre, fresh, onDone }: { genre: string | null; fresh: boolean; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!genre) return;
    // Finished or interrupted, the stamp is done (Home releases its action lock here).
    const done = () => {
      'worklet';
      runOnJS(onDone)();
    };
    scale.set(reduceMotion ? 1 : 1.15);
    if (!reduceMotion) scale.set(withTiming(1, { duration: 180 }));
    opacity.set(withSequence(withTiming(1, { duration: 180 }), withDelay(TOTAL_MS - 180 - 200, withTiming(0, { duration: 200 }, done))));
    // Runs once per stamped genre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));

  if (!genre) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, style]}>
      <View style={styles.box}>
        <ThemedText style={styles.genre} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
          {genre.toUpperCase()}
        </ThemedText>
        {fresh && <ThemedText style={styles.fresh}>NEW TO YOU</ThemedText>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  box: { alignItems: 'center', paddingHorizontal: 24, gap: 6 },
  genre: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 44, color: Colors.text, textAlign: 'center' },
  fresh: { fontFamily: Fonts.monoMedium, fontSize: 12, letterSpacing: 2, color: Colors.textSecondary },
});
