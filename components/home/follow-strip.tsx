import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { DIRECTIONS, DIRECTION_WORD, type Direction } from '@/lib/follow-sound';

/**
 * Follow the Sound: after a reveal, the ways you can head from this song. Tapping one starts the next song that way.
 * A word stays in place but dims when there's nothing further that way, so the row never shifts.
 */
export function FollowStrip({
  open,
  heading,
  onPick,
}: {
  open: readonly Direction[];
  heading: Direction | null;
  onPick: (dir: Direction) => void;
}) {
  return (
    <View style={styles.strip}>
      {DIRECTIONS.map((dir) => {
        const can = open.includes(dir);
        const here = heading === dir && can;
        return (
          <Pressable
            key={dir}
            onPress={() => onPick(dir)}
            disabled={!can}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.word, here && styles.wordHere, !can && styles.wordOut]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !can, selected: here }}
            accessibilityLabel={`Next songs: ${DIRECTION_WORD[dir].toLowerCase()} than this one`}>
            <ThemedText style={[styles.text, here && styles.textHere]} numberOfLines={1}>
              {DIRECTION_WORD[dir]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// The negative margin lifts it into the room Home's row keeps above itself, so the credit line under it stays clear of the water.
const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignSelf: 'stretch', maxWidth: 360, width: '100%', height: 30, padding: 2, marginTop: -30, marginBottom: 1, borderRadius: 15, backgroundColor: Colors.surface },
  word: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  wordHere: { backgroundColor: Colors.text },
  wordOut: { opacity: 0.32 },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.text },
  textHere: { fontWeight: '700', color: Colors.accentText },
});
