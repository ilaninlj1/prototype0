import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { CallButton } from '@/components/discovery/call-button';
import { COVER_BLUR } from '@/components/discovery/swipe-card';
import { DEFAULT_SWIPE_THRESHOLDS, resolveSwipeDirection, rotationForDrag, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { HeartBurst } from '@/components/heart-burst';
import { LivePrint } from '@/components/print/live-print';
import { PrintStill } from '@/components/print/print-still';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { mixForDrag, shouldReportMix } from '@/lib/crossfade';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import type { PrintRecipe } from '@/lib/print-recipe';
import { DragLabels, TintWash } from './drag-label';

const H = DEFAULT_SWIPE_THRESHOLDS.horizontal;
const V = DEFAULT_SWIPE_THRESHOLDS.vertical;
const FLY = 600;
const BADGE = 64;
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
  /** e.g. PRINT 12/50: the piece slot this song will take. */
  slotLabel: string;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  /** Asked before a gesture commits; false means another action is running and the card goes back. */
  takeLock: () => boolean;
  /** Once per committed swipe, blind or revealed. */
  onSwipe: (direction: SwipeDirection) => void;
  onSave: () => void;
  onTogglePlay: () => void;
  onRevealSettled: () => void;
  onCallSave?: (track: DiscoveryTrack) => Promise<void>;
  onMix?: (mix: number) => void;
  onCancelPeek?: () => void;
};

const clockText = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The song you're hearing, blind: its sound drawn as moving particles, a few
 * measured facts, and the clock. Swipe or use the buttons below. A right
 * swipe reveals it in place: the particles settle into the song's print, the
 * cover sharpens in the same frame, then the name comes in.
 */
export const ListenCard = forwardRef<ListenCardHandle, Props>(function ListenCard(props, ref) {
  const { track, size, recipe, revealed, slotLabel, listeners, takeLock, onSwipe, onSave, onTogglePlay, onRevealSettled, onCallSave, onMix, onCancelPeek } =
    props;
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
  const badgeRef = useRef<View>(null);
  const [burst, setBurst] = useState(0);

  // Motion follows the player: frames advance it smoothly, and it re-syncs when it drifts (seek, a restart).
  useEffect(() => {
    playing.set(status.playing);
  }, [status.playing, playing]);
  useEffect(() => {
    if (Math.abs(clock.get() - status.currentTime) > 0.3) clock.set(status.currentTime);
  }, [status.currentTime, clock]);
  useFrameCallback((f) => {
    if (playing.get() && f.timeSincePreviousFrame) clock.set(clock.get() + f.timeSincePreviousFrame / 1000);
  });

  // Both cover sizes are fetched as soon as the card is on top, so the reveal rarely waits.
  useEffect(() => {
    Image.prefetch([artworkUrl(track.artworkUrl100, 300), artworkUrl(track.artworkUrl100, 600)]);
  }, [track.artworkUrl100]);

  // The reveal: settle (300ms), sharpen in place (400ms, one haptic), then the name.
  useEffect(() => {
    if (!revealed) {
      gather.set(0);
      cover.set(0);
      names.set(0);
      return;
    }
    const sharp = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    gather.set(withTiming(1, { duration: reduceMotion ? 0 : 300 }));
    cover.set(
      withDelay(
        reduceMotion ? 0 : 300,
        withTiming(1, { duration: 400 }, (f) => {
          if (f) runOnJS(sharp)();
        })
      )
    );
    names.set(
      withDelay(
        reduceMotion ? 200 : 850,
        withTiming(1, { duration: 250 }, (f) => {
          if (f) runOnJS(onRevealSettled)();
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
      node.measureInWindow((x, y, w, h) => resolve({ x: x + w / 2, y: y + h / 2 }));
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
      }
    });
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok) runOnJS(onTogglePlay)();
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
  const blindStyle = useAnimatedStyle(() => ({ opacity: 1 - cover.get() }));
  const namesStyle = useAnimatedStyle(() => ({ opacity: names.get(), transform: [{ translateY: 16 * (1 - names.get()) }] }));
  const leftTint = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [-H, 0], [TINT, 0], 'clamp') }));
  const rightTint = useAnimatedStyle(() => ({ opacity: interpolate(tx.get(), [0, H], [0, TINT], 'clamp') }));

  const described = listeners != null ? describeListeners(listeners) : null;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const paused = status.isLoaded && !status.playing;
  const printTop = (size.height - size.width) / 2;

  return (
    <Animated.View style={cardStyle}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.card, size, { backgroundColor: recipe.ground }]} accessibilityLabel={revealed ? `${track.trackName} by ${track.artistName}` : 'A song, playing blind'}>
          <Animated.View style={[StyleSheet.absoluteFill, blurStyle]} pointerEvents="none">
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={StyleSheet.absoluteFill} blurRadius={COVER_BLUR} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, coverStyle]} pointerEvents="none">
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </Animated.View>

          {/* The formation crossfades when sound data lands after the card appeared. */}
          <Animated.View
            key={`${recipe.source}:${recipe.label ?? ''}`}
            entering={FadeIn.duration(400)}
            pointerEvents="none"
            style={[styles.print, { top: printTop, width: size.width, height: size.width }, printStyle]}>
            {reduceMotion ? (
              <PrintStill recipe={recipe} size={size.width} ground={false} />
            ) : (
              <LivePrint recipe={recipe} size={size.width} clock={clock} gather={gather} />
            )}
          </Animated.View>

          {!revealed && <TintWash side="left" color={Colors.destructive} style={leftTint} />}
          {!revealed && <TintWash side="right" color={Colors.positive} style={rightTint} />}

          <View style={styles.topRow} pointerEvents="none">
            <ThemedText style={styles.mono}>{slotLabel}</ThemedText>
            <ThemedText style={styles.mono}>
              {clockText(status.currentTime)}
              {status.duration > 0 ? ` / ${clockText(status.duration)}` : ''}
            </ThemedText>
          </View>

          {paused && !revealed && (
            <View style={styles.paused} pointerEvents="none">
              <Ionicons name="play" size={30} color={Colors.text} />
            </View>
          )}

          {revealed ? (
            <>
              <Gradient />
              <Animated.View style={[styles.names, namesStyle]} pointerEvents="none">
                <ThemedText style={styles.title} numberOfLines={2}>
                  {track.trackName}
                </ThemedText>
                <ThemedText style={styles.artist} numberOfLines={1}>
                  {track.artistName}
                </ThemedText>
              </Animated.View>
              <Animated.View ref={badgeRef} entering={FadeIn.delay(reduceMotion ? 0 : 700)} style={styles.badge} pointerEvents="none">
                <PrintStill recipe={recipe} size={BADGE} detail="mini" />
              </Animated.View>
            </>
          ) : (
            <Animated.View style={[styles.blindFoot, blindStyle]} pointerEvents="none">
              <ThemedText type="subtitle">Just listen.</ThemedText>
              {!!recipe.label && <ThemedText style={styles.mono}>{recipe.label}</ThemedText>}
            </Animated.View>
          )}

          <View style={[styles.progress, { width: size.width * progress }]} pointerEvents="none" />
          <DragLabels tx={tx} ty={ty} revealed={revealed} />
          {burst > 0 && <HeartBurst key={burst} size={120} />}
        </View>
      </GestureDetector>

      {/* Above the gesture layer, so tapping Call it never also pauses the song. */}
      {revealed && (
        <Animated.View style={[styles.callRow, namesStyle]} pointerEvents="box-none">
          <ThemedText style={styles.listeners} numberOfLines={1}>
            {described ? `${described.count} listeners` : listeners === undefined ? 'Counting listeners…' : 'No listener count yet'}
          </ThemedText>
          <View style={styles.call}>
            <CallButton track={track} listeners={listeners} onSave={onCallSave} />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
});

/** Navy rising from the bottom of the revealed cover, so the name reads over any artwork. */
function Gradient() {
  return (
    <View style={styles.gradient} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="reveal-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.background} stopOpacity={0} />
            <Stop offset="1" stopColor={Colors.background} stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#reveal-fade)" />
      </Svg>
    </View>
  );
}

/** A card waiting under the top one: its still print over a faint blur of its cover. No gestures, no labels. */
export function StackFace({ track, size, recipe }: { track: DiscoveryTrack; size: CardSize; recipe: PrintRecipe }) {
  return (
    <View style={[styles.card, size, { backgroundColor: recipe.ground }]} pointerEvents="none">
      <Image source={{ uri: artworkUrl(track.artworkUrl100, 300) }} style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} blurRadius={COVER_BLUR} />
      <View style={[styles.print, { top: (size.height - size.width) / 2, width: size.width, height: size.width }]}>
        <PrintStill recipe={recipe} size={size.width} ground={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  print: { position: 'absolute', left: 0 },
  topRow: { position: 'absolute', top: Spacing.md, left: Spacing.lg, right: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1, color: Colors.textSecondary },
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
  blindFoot: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, bottom: Spacing.xl, gap: Spacing.xs },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  names: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, bottom: 64, gap: 2 },
  title: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26, color: Colors.text },
  artist: { color: Colors.textSecondary },
  badge: {
    position: 'absolute',
    top: Spacing.xl + Spacing.md,
    right: Spacing.md,
    width: BADGE,
    height: BADGE,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: Colors.text, opacity: 0.5 },
  callRow: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  listeners: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  call: { width: 116, flexDirection: 'row' },
});
