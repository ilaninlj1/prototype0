import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { COVER_BLUR } from '@/components/discovery/swipe-card';
import { DEFAULT_SWIPE_THRESHOLDS, isSwipeUp, resolveSwipeDirection, rotationForDrag, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { HeartBurst } from '@/components/heart-burst';
import { LivePrint } from '@/components/print/live-print';
import { PrintStill } from '@/components/print/print-still';
import { DarkColors, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { mixForDrag, shouldReportMix } from '@/lib/crossfade';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import type { PrintRecipe } from '@/lib/print-recipe';
import { agedRecipe, songAge } from '@/lib/song-age';
import { DragLabels, TintWash } from './drag-label';

const H = DEFAULT_SWIPE_THRESHOLDS.horizontal;
const V = DEFAULT_SWIPE_THRESHOLDS.vertical;
const FLY = 600;
const BADGE = 64;
/** The blind card is a soft square: big round corners, like an album sleeve on a white table. */
export const CARD_RADIUS = 28;
const TINT = 0.5;

export type ListenCardHandle = {
  /** Animate the card exactly as a swipe would. `preLocked`: the caller already holds Home's action lock. */
  fling: (direction: SwipeDirection, preLocked?: boolean) => void;
  /** The print badge's center on screen, where the flight into the piece takes off. */
  badgeCenter: () => Promise<{ x: number; y: number } | null>;
};

type Props = {
  track: DiscoveryTrack;
  size: CardSize;
  recipe: PrintRecipe;
  revealed: boolean;
  /** How far this song's sound is from your saves, 0 home to 1 deep (lib/taste-distance.ts), or null when unknown. */
  restless: number | null;
  /** How much of the song you'd heard when you revealed it (0–1): the badge's print is as settled as your listen. */
  heard: number;
  /** Asked before a gesture commits; false means another action is running and the card goes back. */
  takeLock: () => boolean;
  /** Once per committed swipe, blind or revealed. */
  onSwipe: (direction: SwipeDirection) => void;
  /** Swipe up on a revealed card: Details. The card springs back. */
  onSwipeUp?: () => void;
  onSave: () => void;
  /** A single tap: Home shows or hides its buttons (pause lives with them). */
  onTap: () => void;
  onRevealSettled: () => void;
  onMix?: (mix: number) => void;
  onCancelPeek?: () => void;
};

/**
 * The song you're hearing, blind: its sound drawn as moving particles on the
 * one dark thing on a light screen. No words on it: the clues and, after the
 * reveal, the name sit under it (ListenInfo). A right swipe reveals it in
 * place: the particles settle into the song's print and the cover sharpens in
 * the same frame.
 */
export const ListenCard = forwardRef<ListenCardHandle, Props>(function ListenCard(props, ref) {
  const { track, size, recipe, revealed, restless, heard, takeLock, onSwipe, onSwipeUp, onSave, onTap, onRevealSettled, onMix, onCancelPeek } = props;
  const { status } = usePlayback();
  const reduceMotion = useReducedMotion();

  const clock = useSharedValue(0);
  const playing = useSharedValue(false);
  const gather = useSharedValue(0);
  const cover = useSharedValue(0);
  const names = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const exiting = useSharedValue(false);
  const crossed = useSharedValue(0);
  const lastMix = useSharedValue(0);
  const duration = useSharedValue(0);
  const furthest = useSharedValue(0);
  const isRevealed = useSharedValue(revealed);
  const badgeRef = useRef<ViewInstance>(null);

  // Listening develops the print: the particles gather as the song plays, fully formed at 80% of the preview.
  // It follows the furthest point heard, so a replay never undoes it.
  const develop = useDerivedValue(() => (duration.get() > 0 ? Math.min(1, furthest.get() / (duration.get() * 0.8)) : 0));
  // A right drag pulls them together, left blows them apart, down lets them fall; a snap-back puts them back.
  const living = useDerivedValue(() =>
    isRevealed.get() ? gather.get() : Math.max(develop.get() * 0.9, interpolate(tx.get(), [0, H], [0, 1], 'clamp'))
  );
  const scatter = useDerivedValue(() => (isRevealed.get() ? 0 : interpolate(-tx.get(), [0, H], [0, 1], 'clamp')));
  const fall = useDerivedValue(() => interpolate(ty.get(), [0, V * 1.5], [0, 1], 'clamp'));
  // An older song comes in warmer and faded, a hint at its era before the reveal gives the date. The badge keeps the true print.
  const aged = useMemo(() => agedRecipe(recipe, songAge(track.releaseDate)), [recipe, track.releaseDate]);
  // Far from your taste, the particles get restless.
  const liveRecipe = useMemo(
    () => (restless ? { ...aged, turbulence: aged.turbulence * (1 + 1.5 * restless), speed: aged.speed * (1 + 0.6 * restless) } : aged),
    [aged, restless]
  );
  const [burst, setBurst] = useState(0);

  // Motion follows the player: frames advance it smoothly, and it re-syncs when it drifts (seek, a restart).
  useEffect(() => {
    playing.set(status.playing);
  }, [status.playing, playing]);
  useEffect(() => {
    duration.set(status.duration);
  }, [status.duration, duration]);
  useEffect(() => {
    if (Math.abs(clock.get() - status.currentTime) > 0.3) clock.set(status.currentTime);
  }, [status.currentTime, clock]);
  useFrameCallback((f) => {
    if (playing.get() && f.timeSincePreviousFrame) clock.set(clock.get() + f.timeSincePreviousFrame / 1000);
    if (clock.get() > furthest.get()) furthest.set(clock.get());
  });

  // Both cover sizes are fetched as soon as the card is on top, so the reveal rarely waits.
  useEffect(() => {
    Image.prefetch([artworkUrl(track.artworkUrl100, 300), artworkUrl(track.artworkUrl100, 600)]);
  }, [track.artworkUrl100]);

  // The reveal: settle (300ms), sharpen in place (400ms, one haptic), then the name.
  useEffect(() => {
    isRevealed.set(revealed);
    if (!revealed) {
      gather.set(0);
      cover.set(0);
      names.set(0);
      return;
    }
    const sharp = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Settle from wherever listening had brought them.
    gather.set(develop.get() * 0.9);
    gather.set(withTiming(1, { duration: reduceMotion ? 0 : 300 }));
    cover.set(
      withDelay(
        reduceMotion ? 0 : 300,
        withTiming(1, { duration: 400 }, (f) => {
          if (f) runOnJS(sharp)();
        })
      )
    );
    // ListenInfo's name comes in on the same beat (FadeIn after 700ms); this timing is the lock's.
    names.set(
      withDelay(
        reduceMotion ? 200 : 850,
        // Settled or cut short, the reveal is over: Home's action lock is released either way.
        withTiming(1, { duration: 250 }, () => {
          runOnJS(onRevealSettled)();
        })
      )
    );
    // Runs on each reveal of this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  function commit(direction: SwipeDirection) {
    onSwipe(direction);
  }

  // Plain JS function, reached from worklets only through runOnJS (see swipe-card.tsx's note on the 2026-09-16 crash).
  function flyOut(direction: SwipeDirection, preLocked = false) {
    if (exiting.get()) return;
    if (!preLocked && !takeLock()) {
      tx.set(withSpring(0));
      ty.set(withSpring(0));
      onCancelPeek?.();
      return;
    }
    // A right swipe on a blind card reveals in place: back to center, not off screen.
    if (direction === 'right' && !revealed) {
      tx.set(withSpring(0));
      ty.set(withSpring(0));
      onCancelPeek?.();
      commit('right');
      return;
    }
    exiting.set(true);
    if (direction !== 'left') onCancelPeek?.();
    if (direction === 'left') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(commit)(direction);
    };
    if (direction === 'down') ty.set(withTiming(FLY, { duration: 250 }, done));
    else tx.set(withTiming(direction === 'right' ? FLY : -FLY, { duration: 250 }, done));
  }

  function measureBadge(): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
      const node = badgeRef.current;
      if (!node) return resolve(null);
      try {
        node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { x: x + w / 2, y: y + h / 2 } : null));
      } catch {
        resolve(null);
      }
    });
  }

  useImperativeHandle(ref, () => ({ fling: flyOut, badgeCenter: measureBadge }));

  function tick() {
    Haptics.selectionAsync();
  }
  function saved() {
    setBurst((n) => n + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave();
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      lastMix.set(0);
      crossed.set(0);
    })
    .onUpdate((e) => {
      if (exiting.get()) return;
      tx.set(e.translationX);
      ty.set(e.translationY);
      const over = Math.abs(e.translationX) > H || e.translationY > V ? 1 : 0;
      if (over !== crossed.get()) {
        crossed.set(over);
        runOnJS(tick)();
      }
      if (!onMix || revealed) return;
      const mix = mixForDrag(e.translationX, e.translationY, H);
      if (mix === 0 && lastMix.get() > 0) {
        lastMix.set(0);
        if (onCancelPeek) runOnJS(onCancelPeek)();
      } else if (shouldReportMix(mix, lastMix.get())) {
        lastMix.set(mix);
        runOnJS(onMix)(mix);
      }
    })
    .onEnd((e) => {
      if (exiting.get()) return;
      const d = resolveSwipeDirection(e.translationX, e.translationY);
      if (d) runOnJS(flyOut)(d, false);
      else {
        tx.set(withSpring(0));
        ty.set(withSpring(0));
        if (onCancelPeek) runOnJS(onCancelPeek)();
        if (revealed && onSwipeUp && isSwipeUp(e.translationX, e.translationY)) runOnJS(onSwipeUp)();
      }
    });
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok) runOnJS(onTap)();
  });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(saved)();
    });
  const gesture = Gesture.Race(pan, Gesture.Exclusive(doubleTap, tap));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { rotate: `${rotationForDrag(tx.get(), size.width)}deg` }],
  }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: 0.25 * (1 - cover.get()) }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));
  const printStyle = useAnimatedStyle(() => ({ opacity: 1 - cover.get() }));
  const leftTint = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [-H, 0], [TINT, 0], 'clamp') }));
  const rightTint = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [0, H], [0, TINT], 'clamp') }));

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const paused = status.isLoaded && !status.playing;
  // The print is square: the card's shorter side, centered (the card fills whatever room Home has).
  const side = Math.min(size.width, size.height);
  const printBox = { top: (size.height - side) / 2, left: (size.width - side) / 2, width: side, height: side };

  return (
    <Animated.View style={cardStyle}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.card, size, { backgroundColor: aged.ground }]} accessibilityLabel={revealed ? `${track.trackName} by ${track.artistName}` : 'A song, playing blind'}>
          <Animated.View style={[StyleSheet.absoluteFill, blurStyle]} pointerEvents="none">
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={StyleSheet.absoluteFill} blurRadius={COVER_BLUR} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, coverStyle]} pointerEvents="none">
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </Animated.View>

          {/* The formation crossfades when sound data lands after the card appeared. */}
          <Animated.View pointerEvents="none" style={[styles.print, printBox, printStyle]}>
            {/* Keyed apart from the opacity above: the entering fade and the reveal fade can't share one view. */}
            <Animated.View key={`${recipe.source}:${recipe.label ?? ''}`} entering={FadeIn.duration(400)}>
              {reduceMotion ? (
                <PrintStill recipe={aged} size={side} ground={false} />
              ) : (
                <LivePrint recipe={liveRecipe} size={side} clock={clock} gather={living} scatter={scatter} fall={fall} />
              )}
            </Animated.View>
          </Animated.View>

          {!revealed && <TintWash side="left" color={DarkColors.destructive} style={leftTint} />}
          {!revealed && <TintWash side="right" color={DarkColors.positive} style={rightTint} />}

          {paused && !revealed && (
            <View style={styles.paused} pointerEvents="none">
              <Ionicons name="play" size={30} color={DarkColors.text} />
            </View>
          )}

          {revealed && (
            <Animated.View entering={FadeIn.delay(reduceMotion ? 0 : 700)} style={styles.badge} pointerEvents="none">
              {/* Measured for the flight: a plain view, since an animated one doesn't measure on every platform. */}
              <View ref={badgeRef} collapsable={false}>
                <PrintStill recipe={recipe} size={BADGE} detail="mini" heard={heard} />
              </View>
            </Animated.View>
          )}

          <View style={[styles.progress, { width: size.width * progress }]} pointerEvents="none" />
          <DragLabels tx={tx} ty={ty} revealed={revealed} />
          {burst > 0 && <HeartBurst key={burst} size={120} />}
        </View>
      </GestureDetector>

    </Animated.View>
  );
});

/** A card waiting under the top one: its still print over a faint blur of its cover. No gestures, no labels. */
export function StackFace({ track, size, recipe }: { track: DiscoveryTrack; size: CardSize; recipe: PrintRecipe }) {
  const side = Math.min(size.width, size.height);
  const aged = useMemo(() => agedRecipe(recipe, songAge(track.releaseDate)), [recipe, track.releaseDate]);
  return (
    <View style={[styles.card, size, { backgroundColor: aged.ground }]} pointerEvents="none">
      <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} blurRadius={COVER_BLUR} />
      <View style={[styles.print, { top: (size.height - side) / 2, left: (size.width - side) / 2, width: side, height: side }]}>
        <PrintStill recipe={aged} size={side} ground={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  print: { position: 'absolute' },
  paused: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(19, 33, 63, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  badge: {
    position: 'absolute',
    top: Spacing.xl + Spacing.md,
    right: Spacing.md,
    width: BADGE,
    height: BADGE,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DarkColors.hairline,
  },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: DarkColors.text, opacity: 0.5 },
});
