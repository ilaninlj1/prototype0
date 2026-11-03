import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { DEPTHS, DEPTH_INFO, WATERS, WATER_INFO, WATER_WORD, placeLabel, type Depth, type Place, type Water } from '@/lib/ocean-map';

function SoundWord({ water, i, here, posX, width, onPress }: { water: Water; i: number; here: boolean; posX: SharedValue<number>; width: number; onPress: () => void }) {
  // The white word fades in over the black one as the highlight arrives, so it changes with the swipe rather than after it.
  const light = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(posX.get() - i) * 1.15) }));
  return (
    <Pressable
      onPress={onPress}
      style={[styles.soundWord, { width }]}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityState={{ selected: here }}
      accessibilityLabel={`Go to ${WATER_INFO[water].name}, ${WATER_INFO[water].caption}`}>
      <ThemedText style={styles.soundText} numberOfLines={1}>
        {WATER_WORD[water]}
      </ThemedText>
      <Animated.View style={[styles.soundLight, light]} pointerEvents="none">
        <ThemedText style={styles.soundTextOn} numberOfLines={1}>
          {WATER_WORD[water]}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

/** How a song sounds, across: the partner of the depth control. Its highlight follows the water as you swipe sideways. */
function SoundStrip({ place, posX, onWater }: { place: Place; posX: SharedValue<number>; onWater: (w: Water) => void }) {
  const [inner, setInner] = useState(0);
  const each = inner / WATERS.length;
  const slider = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, Math.min(WATERS.length - 1, posX.get())) * each }] }));
  return (
    <View style={styles.sounds} onLayout={(e) => setInner(e.nativeEvent.layout.width - 6)}>
      {each > 0 && <Animated.View style={[styles.soundSlider, { width: each }, slider]} />}
      {each > 0 &&
        WATERS.map((water, i) => (
          <SoundWord key={water} water={water} i={i} here={water === place.water} posX={posX} width={each} onPress={() => onWater(water)} />
        ))}
    </View>
  );
}

/**
 * What stays on screen under the water: where you are and how many songs are left there, the two controls for how it
 * sounds and how well known it is, Swipe these songs, and the way back up. Every move has a button, so nothing depends on a swipe.
 */
export function OceanUi({
  place,
  subtitle,
  hint,
  posX,
  canSwipe,
  offerExample,
  allCount,
  onWater,
  onDepth,
  onSwipe,
  onBackUp,
  onPortrait,
  onOpenList,
  onExample,
  onChart,
  onToggleMeter,
}: {
  place: Place;
  subtitle: string;
  hint: string | null;
  /** Where you are across the waters, so the strip's highlight moves with the water as you swipe. */
  posX: SharedValue<number>;
  canSwipe: boolean;
  /** Your ocean is still thin: offer a look at a grown one. */
  offerExample: boolean;
  /** How many of yours live here, when more live here than can swim at once; otherwise 0. */
  allCount: number;
  onWater: (water: Water) => void;
  onDepth: (depth: Depth) => void;
  onSwipe: () => void;
  onBackUp: () => void;
  onPortrait: () => void;
  onOpenList: () => void;
  onExample: () => void;
  onChart: () => void;
  /** Holding the pill shows the frame rate, to measure smoothness on a real phone. */
  onToggleMeter: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <Pressable style={styles.pill} onLongPress={onToggleMeter} accessibilityRole="header" accessibilityLiveRegion="polite">
          <ThemedText style={styles.pillTitle} numberOfLines={1}>
            {placeLabel(place)}
          </ThemedText>
          <ThemedText style={styles.pillSub} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </Pressable>
        {hint && <ThemedText style={styles.hint}>{hint}</ThemedText>}
        {offerExample && (
          <Pressable style={styles.plain} onPress={onExample} accessibilityRole="button">
            <ThemedText style={styles.plainText}>See an example</ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.depths}>
        {DEPTHS.map((d) => {
          const here = d === place.depth;
          return (
            <Pressable
              key={d}
              onPress={() => onDepth(d)}
              hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
              style={[styles.depth, here && styles.depthHere]}
              accessibilityRole="button"
              accessibilityState={{ selected: here }}
              accessibilityLabel={`Go to ${DEPTH_INFO[d].name}`}>
              <ThemedText style={[styles.depthText, here && styles.depthTextHere]}>{DEPTH_INFO[d].name}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]} pointerEvents="box-none">
        <SoundStrip place={place} posX={posX} onWater={onWater} />
        <Pressable
          onPress={onSwipe}
          disabled={!canSwipe}
          style={[styles.swipe, !canSwipe && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSwipe }}>
          <ThemedText style={styles.swipeText}>Swipe these songs</ThemedText>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onBackUp} style={styles.plain} accessibilityRole="button" accessibilityLabel="Back up">
            <Ionicons name="arrow-up" size={16} color={Colors.text} />
            <ThemedText style={styles.plainText}>Back up</ThemedText>
          </Pressable>
          <Pressable onPress={onPortrait} style={styles.plain} accessibilityRole="button">
            <ThemedText style={styles.plainText}>Your ocean</ThemedText>
          </Pressable>
          <Pressable onPress={onChart} style={styles.plain} accessibilityRole="button">
            <ThemedText style={styles.plainText}>See it all</ThemedText>
          </Pressable>
          {allCount > 0 && (
            <Pressable onPress={onOpenList} style={styles.plain} accessibilityRole="button">
              <ThemedText style={styles.plainText}>All {allCount} here</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  pill: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    maxWidth: '100%',
    shadowColor: '#04222d',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pillTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: Colors.text },
  pillSub: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  hint: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#ffffff', textAlign: 'center', textShadowColor: 'rgba(0,30,45,0.55)', textShadowRadius: 6 },
  sounds: { flexDirection: 'row', alignSelf: 'stretch', maxWidth: 340, width: '100%', height: 38, padding: 3, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.94)', shadowColor: '#04222d', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  soundSlider: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 16, backgroundColor: Colors.text },
  soundWord: { alignItems: 'center', justifyContent: 'center' },
  soundText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.text },
  soundLight: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  soundTextOn: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: Colors.accentText },
  // One solid control, so it reads over any water and doesn't look like four loose labels.
  depths: { position: 'absolute', right: Spacing.sm, top: '52%', padding: 3, gap: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)', shadowColor: '#04222d', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  depth: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  depthHere: { backgroundColor: Colors.text },
  depthText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.text },
  depthTextHere: { fontWeight: '700', color: Colors.accentText },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  swipe: { alignSelf: 'stretch', maxWidth: 340, width: '100%', backgroundColor: Colors.text, borderRadius: 26, height: 48, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  swipeText: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: Colors.accentText },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm },
  plain: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 19, height: 38, paddingHorizontal: 14 },
  plainText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: Colors.text },
});
