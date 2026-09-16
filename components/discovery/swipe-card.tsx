import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { DEFAULT_SWIPE_THRESHOLDS, resolveSwipeDirection, rotationForDrag, type CardSize, type SwipeDirection } from './swipe-physics';

const FLY_OUT_DISTANCE = 600;
// artworkUrl100 is only 100x100, stretched to fill the full-width card —
// visibly blurry. iTunes serves the same asset at any size via the URL, so
// ask for one big enough for the card instead of upscaling a thumbnail.
const CARD_ARTWORK_SIZE = 600;

// Tint zones: fully transparent at rest — the album art is the point of the
// screen, not a competing visual — visible only once a drag is actually in
// progress, ramping to this max as translateX approaches the swipe
// threshold (see leftTintStyle/rightTintStyle below). Previously had a
// TINT_REST_OPACITY floor (0.08) so the zones stayed faintly visible even
// with no drag; removed 2026-09-15 because that floor, combined with a
// press-only jump to full opacity, was washing out artwork on a mere
// touch-down before any actual swipe intent. 0.32 itself is unchanged from
// the 2026-09-15 empirical check against two real iTunes covers (a
// near-black one and a bright/colorful one, both composited with the exact
// tint colors — see that conversation for the images) — that number is
// about how strong the tint should get at full activation, independent of
// when it starts appearing.
const TINT_ACTIVE_OPACITY = 0.32;

type CardFaceProps = {
  track: DiscoveryTrack;
  /** Computed by the screen from the space actually available (see computeCardSize) — never a fixed constant, so the card shrinks to fit on a small screen. */
  size: CardSize;
  /** Overlays a play icon on the artwork — paused or a finished preview. Never set by CardStack's static background cards. Doubles as the hold-to-pause indicator now (see SwipeCard) — pausing just sets this the same way finishing a preview already did. */
  showPlayIcon?: boolean;
  /**
   * Breathing room between the card's own top edge and where the artwork
   * image starts — the app screen's absolutely-positioned header overlay
   * (Undo/genre pill/preset chips) floats over the top of the card rather
   * than taking space from it (see app/(tabs)/index.tsx), so without this
   * the header would sit directly on top of artwork instead of a blank
   * strip. This is an INTERNAL inset — the card's own outer `size` never
   * changes because of it, only how much of that fixed box the artwork
   * image fills. Defaults to 0 (edge-to-edge) for any caller that doesn't
   * have a header floating over it.
   */
  artworkTopInset?: number;
  /**
   * Skip/like zone tint overlays — only ever set by the interactive top
   * card (SwipeCard); CardStack's static background layers never pass
   * these, since press/drag feedback on a card you can't currently touch
   * would be misleading. Rendered INSIDE this component's own
   * borderRadius+overflow:hidden container (rather than layered on top of
   * it from SwipeCard) specifically so the tint respects the card's
   * rounded corners instead of showing square edges past them.
   */
  leftTintStyle?: AnimatedStyle<ViewStyle>;
  rightTintStyle?: AnimatedStyle<ViewStyle>;
};

// Artwork fills the card below artworkTopInset; title/artist/genre sit
// directly over its bottom edge on a BlurView rather than a separate panel
// below — the artwork stays the visual focus (just softened where the text
// needs to sit, and inset at the top where the header floats) instead of
// being pushed up to make room for a solid info block.
export function CardFace({
  track,
  size,
  showPlayIcon = false,
  artworkTopInset = 0,
  leftTintStyle,
  rightTintStyle,
}: CardFaceProps) {
  return (
    <ThemedView style={[styles.card, size]} backgroundColor={Colors.surface}>
      {track.artworkUrl100 ? (
        <Image
          source={{ uri: artworkUrl(track.artworkUrl100, CARD_ARTWORK_SIZE) }}
          style={[styles.artwork, { top: artworkTopInset }]}
        />
      ) : track.placeholderColor ? (
        // No real artwork — a flat colored block instead of leaving the
        // card's plain Colors.surface background showing through, so a
        // stub deck (or any track a real source ever fails to find
        // artwork for) still reads as "the card changed" at a glance.
        <ThemedView
          style={[styles.artwork, { top: artworkTopInset }]}
          backgroundColor={track.placeholderColor}
        />
      ) : null}

      {leftTintStyle && (
        <Animated.View pointerEvents="none" style={[styles.tintZone, styles.tintZoneLeft, leftTintStyle]} />
      )}
      {rightTintStyle && (
        <Animated.View pointerEvents="none" style={[styles.tintZone, styles.tintZoneRight, rightTintStyle]} />
      )}

      {showPlayIcon && (
        <ThemedView style={styles.playOverlay} backgroundColor="transparent">
          <ThemedView style={styles.playOverlayCircle} backgroundColor="rgba(0, 0, 0, 0.5)">
            <ThemedText style={styles.playOverlayIcon}>▶</ThemedText>
          </ThemedView>
        </ThemedView>
      )}

      <BlurView intensity={55} tint="dark" style={styles.infoOverlay}>
        <ThemedText type="subtitle" numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.artist}>
          {track.artistName}
        </ThemedText>
        <ThemedText type="caption" numberOfLines={1} style={styles.genre}>
          {track.primaryGenreName}
        </ThemedText>
      </BlurView>
    </ThemedView>
  );
}

type SwipeCardProps = {
  track: DiscoveryTrack;
  size: CardSize;
  onSwipe: (direction: SwipeDirection, track: DiscoveryTrack) => void;
  /** Fires on a ~400ms hold, not a tap — see the gesture composition below for why tap was reassigned to skip/like. */
  onHold: () => void;
  showPlayIcon: boolean;
  artworkTopInset?: number;
};

export function SwipeCard({ track, size, onSwipe, onHold, showPlayIcon, artworkTopInset }: SwipeCardProps) {
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
      } else if (direction === 'down') {
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

  const gesture = Gesture.Race(pan, longPress, tap);

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
          track={track}
          size={size}
          showPlayIcon={showPlayIcon}
          artworkTopInset={artworkTopInset}
          leftTintStyle={leftTintStyle}
          rightTintStyle={rightTintStyle}
        />
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
  artwork: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // top comes from the artworkTopInset prop, not from absoluteFill —
    // that's the whole mechanism this style exists to support.
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
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayIcon: {
    color: Colors.text,
    fontSize: 28,
    marginLeft: 4, // optical centering — the glyph itself sits slightly left otherwise
  },
  infoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: 2,
  },
  artist: {
    color: Colors.textSecondary,
  },
  genre: {
    marginTop: 2,
  },
});
