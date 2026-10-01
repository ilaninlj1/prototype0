import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { COVER_BLUR } from '@/components/discovery/swipe-card';
import { Colors } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';

// A save on Home drops into the You tab, where the Tasteform lives: the heart
// pops on the card, then the song detaches as a glowing cell and falls into
// the YOU icon. Saved blind, it's the blurred cover (colors only, nothing
// given away); saved from the reveal, it's the real cover. The layer sits at
// the app's root so the flight can cross over the tab bar.

type Point = { x: number; y: number };
type Flight = { id: number; artwork: string; blind: boolean; from: Point; to: Point };

let measureTarget: ((done: (p: Point) => void) => void) | null = null;
let launch: ((f: Omit<Flight, 'id' | 'to'>) => void) | null = null;
const landings = new Set<() => void>();

/** The tab bar lends a way to find the YOU icon on screen, measured fresh for every flight. */
export function setYouTabTarget(measure: ((done: (p: Point) => void) => void) | null) {
  measureTarget = measure;
}

/** Hear about each save landing on the YOU icon. Returns an unsubscribe. */
export function onSaveLanded(fn: () => void): () => void {
  landings.add(fn);
  return () => {
    landings.delete(fn);
  };
}

/** Send a just-saved song from `from` (screen coordinates) into the You tab. */
export function flySave(f: { artwork: string; blind: boolean; from: Point }) {
  launch?.(f);
}

/** Mounted once, above everything (app/_layout.tsx). */
export function SaveFlightLayer() {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    let next = 0;
    launch = (f) => measureTarget?.((to) => setFlights((list) => [...list, { ...f, to, id: ++next }]));
    return () => {
      launch = null;
    };
  }, []);

  const landed = useCallback((id: number) => {
    setFlights((list) => list.filter((f) => f.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    landings.forEach((fn) => fn());
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((f) => (
        <SaveFlight key={f.id} flight={f} onLanded={landed} />
      ))}
    </View>
  );
}

const SIZE = 88;
/** Small enough to disappear into a 24px icon. */
const END_SCALE = 18 / SIZE;

function SaveFlight({ flight, onLanded }: { flight: Flight; onLanded: (id: number) => void }) {
  const { id, artwork, blind, from, to } = flight;
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Wait for the heart to pop, lift off the card a little, then fall in an arc.
    const wait = 300;
    const lift = { duration: 200, easing: Easing.out(Easing.quad) };
    const fall = 560;
    opacity.value = withDelay(wait, withTiming(1, { duration: 120 }));
    scale.value = withDelay(
      wait,
      withSequence(withTiming(1, lift), withTiming(END_SCALE, { duration: fall, easing: Easing.in(Easing.quad) }))
    );
    x.value = withDelay(wait + lift.duration, withTiming(to.x, { duration: fall, easing: Easing.inOut(Easing.cubic) }));
    y.value = withDelay(
      wait,
      withSequence(
        withTiming(from.y - 36, lift),
        withTiming(to.y, { duration: fall, easing: Easing.in(Easing.quad) }, (done) => {
          if (done) runOnJS(onLanded)(id);
        })
      )
    );
    // One flight per mount; its path never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value - SIZE / 2 }, { translateY: y.value - SIZE / 2 }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.cell, style]}>
      <Image
        source={{ uri: artworkUrl(artwork, blind ? 100 : 300) }}
        style={styles.art}
        blurRadius={blind ? COVER_BLUR : 0}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.hairline,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  art: {
    width: SIZE,
    height: SIZE,
  },
});
