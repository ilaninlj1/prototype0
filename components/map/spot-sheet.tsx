import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { KNOWN_SHARE } from '@/lib/dark-map';

type Props = { words: string; songs: number; heard: number; bottom: number; onGo: () => void; onClose: () => void };

/** What's around a tapped spot, and the way in. */
export function SpotSheet({ words, songs, heard, bottom, onGo, onClose }: Props) {
  const known = songs > 0 && heard / songs > KNOWN_SHARE;
  return (
    <View style={[styles.sheet, { paddingBottom: bottom + Spacing.lg }]}>
      <View style={styles.top}>
        <ThemedText style={styles.words}>{words.toUpperCase()}</ThemedText>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>
      {songs === 0 ? (
        <ThemedText style={styles.body}>Nothing here. Tap where the dots are.</ThemedText>
      ) : (
        <>
          <ThemedText style={styles.big}>
            {songs} {songs === 1 ? 'song' : 'songs'} around here
          </ThemedText>
          <ThemedText style={styles.body}>{known ? 'You know this part.' : `You've heard ${heard} of them.`}</ThemedText>
          <Pressable onPress={onGo} style={styles.go} accessibilityRole="button" accessibilityLabel={`Swipe blind here, ${words.replace(/ · /g, ', ')}`}>
            <ThemedText style={styles.goText}>SWIPE BLIND HERE →</ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.xs,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  words: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.2, color: Colors.textSecondary },
  big: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 28, color: Colors.text },
  body: { fontSize: 14, color: Colors.textSecondary },
  go: { marginTop: Spacing.md, backgroundColor: Colors.accent, borderRadius: Radius.lg, alignItems: 'center', paddingVertical: Spacing.md },
  goText: { fontFamily: Fonts.monoMedium, fontSize: 13, letterSpacing: 1.2, color: Colors.accentText },
});
