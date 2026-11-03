import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { DEPTHS, DEPTH_INFO, WATERS, WATER_INFO, placeLabel, type Depth, type Place, type Water } from '@/lib/ocean-map';

/**
 * What stays on screen under the water: where you are and how many songs are left there, the way to the next water
 * and depth, Swipe these songs, and the way back up. Every move has a button, so nothing depends on a swipe.
 */
export function OceanUi({
  place,
  title,
  subtitle,
  hint,
  speciesTag,
  canSwipe,
  allCount,
  onWater,
  onDepth,
  onSwipe,
  onBackUp,
  onPortrait,
  onOpenList,
  onClearSpecies,
}: {
  place: Place;
  /** Overrides the place's name, for "Fast songs in Midnight · Buried". */
  title: string | null;
  subtitle: string;
  hint: string | null;
  speciesTag: string | null;
  canSwipe: boolean;
  /** How many of yours live here, when more live here than can swim at once; otherwise 0. */
  allCount: number;
  onWater: (water: Water) => void;
  onDepth: (depth: Depth) => void;
  onSwipe: () => void;
  onBackUp: () => void;
  onPortrait: () => void;
  onOpenList: () => void;
  onClearSpecies: () => void;
}) {
  const insets = useSafeAreaInsets();
  const w = WATERS.indexOf(place.water);
  const previous = w > 0 ? WATERS[w - 1] : null;
  const next = w < WATERS.length - 1 ? WATERS[w + 1] : null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <View style={styles.pill} accessibilityRole="header" accessibilityLiveRegion="polite">
          <ThemedText style={styles.pillTitle} numberOfLines={1}>
            {title ?? placeLabel(place)}
          </ThemedText>
          <ThemedText style={styles.pillSub} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </View>
        {speciesTag && (
          <Pressable
            onPress={onClearSpecies}
            hitSlop={8}
            style={styles.tag}
            accessibilityRole="button"
            accessibilityLabel={`${speciesTag}. Clear this filter`}>
            <ThemedText style={styles.tagText}>{speciesTag}</ThemedText>
            <Ionicons name="close" size={14} color={Colors.accentText} />
          </Pressable>
        )}
        {hint && <ThemedText style={styles.hint}>{hint}</ThemedText>}
      </View>

      {previous && (
        <Pressable
          onPress={() => onWater(previous)}
          hitSlop={10}
          style={[styles.arrow, styles.arrowLeft]}
          accessibilityRole="button"
          accessibilityLabel={`Go to ${WATER_INFO[previous].name}`}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
      )}
      {next && (
        <Pressable
          onPress={() => onWater(next)}
          hitSlop={10}
          style={[styles.arrow, styles.arrowRight]}
          accessibilityRole="button"
          accessibilityLabel={`Go to ${WATER_INFO[next].name}`}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </Pressable>
      )}

      <View style={styles.depths} pointerEvents="box-none">
        {DEPTHS.map((d) => {
          const here = d === place.depth;
          return (
            <Pressable
              key={d}
              onPress={() => onDepth(d)}
              hitSlop={6}
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
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.text,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tagText: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: Colors.accentText },
  hint: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#ffffff', textAlign: 'center', textShadowColor: 'rgba(0,30,45,0.55)', textShadowRadius: 6 },
  arrow: {
    position: 'absolute',
    top: '42%',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: { left: Spacing.sm },
  arrowRight: { right: Spacing.sm },
  depths: { position: 'absolute', right: Spacing.sm, top: '52%', alignItems: 'flex-end', gap: 4 },
  depth: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 12, minHeight: 26, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.42)' },
  depthHere: { backgroundColor: '#ffffff' },
  depthText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.text },
  depthTextHere: { fontWeight: '700' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  swipe: { alignSelf: 'stretch', maxWidth: 340, width: '100%', backgroundColor: Colors.text, borderRadius: 26, height: 52, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  swipeText: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: Colors.accentText },
  row: { flexDirection: 'row', gap: Spacing.sm },
  plain: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, height: 40, paddingHorizontal: 16 },
  plainText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: Colors.text },
});
