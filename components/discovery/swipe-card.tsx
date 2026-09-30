import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import { BlindspotMark } from '@/components/emblems';
import { HeartBurst } from '@/components/heart-burst';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { DEFAULT_SWIPE_THRESHOLDS, resolveSwipeDirection, rotationForDrag, type CardSize, type SwipeDirection } from './swipe-physics';

const FLY_OUT_DISTANCE = 600;

// Skip/like tint: invisible at rest, ramping to this as a drag nears its commit threshold.
const TINT_ACTIVE_OPACITY = 0.32;

type CardFaceProps = {
  /** Computed by the screen from the space actually available (see computeCardSize) — never a fixed constant, so the card shrinks to fit on a small screen. */
  size: CardSize;
  /** True only for the top card while its preview plays — drives the pulse. */
  playing?: boolean;
  /** Shows a play glyph instead of the pulse — paused or a finished preview. */
  showPlayIcon?: boolean;
  /** Skip/like tint overlays — only the interactive top card passes these. */
  leftTintStyle?: AnimatedStyle<ViewStyle>;
  rightTintStyle?: AnimatedStyle<ViewStyle>;
};

// Blind by design: no artwork, title, artist or genre until you like the
// track (see RevealCard). All you get is the sound.
export function CardFace({ size, playing = false, showPlayIcon = false, leftTintStyle, rightTintStyle }: CardFaceProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = playing ? withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1) : withTiming(0);
  }, [playing, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    // Invisible at rest; only a playing preview sends rings out.
    opacity: interpolate(pulse.value, [0, 0.05, 1], [0, 0.4, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.2]) }],
  }));

  return (
    <ThemedView style={[styles.card, size]} backgroundColor={Colors.surface}>
      {leftTintStyle && (
        <Animated.View pointerEvents="none" style={[styles.tintZone, styles.tintZoneLeft, leftTintStyle]} />
      )}
      {rightTintStyle && (
        <Animated.View pointerEvents="none" style={[styles.tintZone, styles.tintZoneRight, rightTintStyle]} />
      )}

      <ThemedView style={styles.center} backgroundColor="transparent">
        <Animated.View style={[styles.ring, ringStyle]} />
        <BlindspotMark size={120} />
        {showPlayIcon && (
          <ThemedView style={styles.playBadge} backgroundColor={Colors.accent}>
            <Ionicons name="play" size={22} color={Colors.accentText} style={styles.playIcon} />
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={styles.footer} backgroundColor="transparent">
        <ThemedText type="subtitle">Just listen.</ThemedText>
        <ThemedText type="caption" style={styles.hint}>
          Like it to find out who it is.
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

type SwipeCardProps = {
  track: DiscoveryTrack;
  size: CardSize;
  onSwipe: (direction: SwipeDirection, track: DiscoveryTrack) => void;
  /** Fires on a ~400ms hold, not a tap — see the gesture composition below for why tap was reassigned to skip/like. */
  onHold: () => void;
  playing: boolean;
  showPlayIcon: boolean;
  /** False turns off swipe-down (the Daily Drop has no genre to jump from). */
  allowDown?: boolean;
  /** Home only: double-tap saves the song to Liked (still blind). Single taps then wait a beat for a second tap. */
  onDoubleTap?: (track: DiscoveryTrack) => void;
};

export function SwipeCard({ track, size, onSwipe, onHold, playing, showPlayIcon, allowDown = true, onDoubleTap }: SwipeCardProps) {
  const [burst, setBurst] = useState(0);
  function doubleTapped() {
    setBurst((n) => n + 1);
    onDoubleTap?.(track);
  }
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Which half is currently pressed, before/independent of any drag —
  // -1 left, 1 right, 0 neither. Combined with translateX below so a press
  // shows immediate feedback and a drag's direction can override it (see
  // the tint styles) — dragging left after pressing down on the right
  // should show LEFT intensifying, since that's what release would do now.
  const pressedSide = useSharedValue(0);

  // Pass `track` explicitly rather than letting the caller re-derive "which
  // track was this" from whatever's currently at the front of its own queue.
  // `track` is this component's own prop, so it's pinned to the card that was
  // actually dragged regardless of how much queue state changes elsewhere
  // before this fires (the fly-out animation's runOnJS callback lands ~250ms
  // after the gesture ends).
  function commit(direction: SwipeDirection) {
    // Each direction feels different: a like lands heavier than a skip.
    Haptics.impactAsync(direction === 'right' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onSwipe(direction, track);
  }

  // Plain JS-thread function, deliberately NOT a worklet — it's a shared
  // committed-swipe path called from two worklet contexts (tap.onEnd below,
  // and pan.onEnd's left/right branch), and a plain function reference
  // isn't reliably callable directly from a UI-thread worklet just because
  // a worklet happens to call it. Every call site must go through
  // runOnJS(flyOutHorizontally)(...), never a direct call from inside a
  // worklet — see git history around 2026-09-16 for a real crash
  // (Hermes exception inside the UI-runtime worklet, on gesture release,
  // no red screen — uncatchable by RN's normal JS-thread error handler)
  // caused by pan.onEnd calling this directly instead.
  function flyOutHorizontally(direction: 'left' | 'right') {
    translateX.value = withTiming(direction === 'right' ? FLY_OUT_DISTANCE : -FLY_OUT_DISTANCE, { duration: 250 }, () =>
      runOnJS(commit)(direction)
    );
  }

  const pan = Gesture.Pan()
    .onBegin((e) => {
      pressedSide.value = e.x < size.width / 2 ? -1 : 1;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const direction = resolveSwipeDirection(e.translationX, e.translationY);
      if (direction === 'right' || direction === 'left') {
        runOnJS(flyOutHorizontally)(direction);
      } else if (direction === 'down' && allowDown) {
        translateY.value = withTiming(FLY_OUT_DISTANCE, { duration: 250 }, () => runOnJS(commit)('down'));
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    })
    .onFinalize(() => {
      pressedSide.value = 0;
    });

  // Left half skips, right half likes — same commit path (and the same
  // fly-out animation) a swipe in that direction already uses, so a tap and
  // a swipe toward the same edge are visually indistinguishable in their
  // outcome. Zone is resolved from the tap's own x position, not from
  // pressedSide — a tap never moves, so there's no drag direction to defer
  // to, just where it landed.
  const tap = Gesture.Tap().onEnd((e, success) => {
    if (success) runOnJS(flyOutHorizontally)(e.x < size.width / 2 ? 'left' : 'right');
  });

  // Reassigned from a plain tap (2026-09-15): tap now belongs to skip/like,
  // the app's core interaction, so pause moved to the next-cheapest gesture
  // instead of competing with it for the same touch. minDuration is the
  // hold threshold; maxDistance is what makes "press then decide to swipe
  // instead" safe — RNGH fails a LongPress outright once the finger moves
  // past it, before minDuration even elapses, so a real drag can never also
  // register as a hold. Swipe wins over hold structurally, not by timing
  // coincidence.
  const longPress = Gesture.LongPress()
    .minDuration(400)
    .maxDistance(10)
    .onStart(() => {
      runOnJS(onHold)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (success) runOnJS(doubleTapped)();
    });

  const gesture = onDoubleTap ? Gesture.Race(pan, longPress, Gesture.Exclusive(doubleTap, tap)) : Gesture.Race(pan, longPress, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotationForDrag(translateX.value, size.width)}deg` },
    ],
  }));

  // Pure function of drag distance — 0 at zero displacement (the artwork is
  // the point of the card; no tint should show until a swipe is actually in
  // progress), ramping smoothly to TINT_ACTIVE_OPACITY as translateX
  // approaches that side's commit threshold, so the tint visibly telegraphs
  // "how close to committing this is." Deliberately NOT consulting
  // pressedSide here (2026-09-16), even though it's still set by pan's
  // onBegin/onFinalize above and its own comment there still describes the
  // tint-feedback role it used to play — folding it into this activation
  // calc (a flat jump to full opacity on mere touch-down, no drag) is gone:
  // no tint at zero displacement, full stop. pressedSide itself stays
  // populated, unused, rather than removed — it was suspected (2026-09-16)
  // as the cause of a real release-time crash during triage, restored out
  // of caution, and the actual cause turned out to be unrelated (see
  // flyOutHorizontally's own comment). Safe to remove for real at this
  // point; left alone since there's nothing to gain by touching it again.
  const leftTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-DEFAULT_SWIPE_THRESHOLDS.horizontal, 0], [TINT_ACTIVE_OPACITY, 0], 'clamp'),
  }));
  const rightTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, DEFAULT_SWIPE_THRESHOLDS.horizontal], [0, TINT_ACTIVE_OPACITY], 'clamp'),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>
        <CardFace
          size={size}
          playing={playing}
          showPlayIcon={showPlayIcon}
          leftTintStyle={leftTintStyle}
          rightTintStyle={rightTintStyle}
        />
        {burst > 0 && <HeartBurst key={burst} size={120} />}
      </Animated.View>
    </GestureDetector>
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
  tintZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
  },
  tintZoneLeft: {
    left: 0,
    backgroundColor: Colors.destructive,
  },
  tintZoneRight: {
    right: 0,
    backgroundColor: Colors.positive,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: Radius.round,
    backgroundColor: Colors.signal,
  },
  playBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: 44 }, { translateY: 44 }],
  },
  playIcon: {
    marginLeft: 3, // optical centering
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  hint: {
    color: Colors.textSecondary,
  },
});
