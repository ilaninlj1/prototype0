import { Image } from 'expo-image';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import type { Finding } from '@/lib/taste-decoded';

/** What "Share my taste" sends, shown as-is above the button: the top finding, up to 3 covers, and where it came from. */
export function ShareCard({ cardRef, finding }: { cardRef: RefObject<View | null>; finding: Finding }) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <View ref={cardRef} collapsable={false} style={styles.card}>
      <ThemedText style={styles.eyebrow}>My taste, decoded</ThemedText>
      <ThemedText style={styles.sentence}>{finding.sentence}</ThemedText>
      <View style={styles.covers}>
        {finding.evidence.slice(0, 3).map((e) => (
          <Image key={e.song.id} source={{ uri: artworkUrl(e.song.artworkUrl, 300) }} style={styles.cover} />
        ))}
      </View>
      <ThemedText style={styles.foot}>Decoded by Blindspot · {date}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.background,
  },
  eyebrow: { ...Ui.label, color: Colors.textSecondary },
  sentence: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34, color: Colors.text },
  covers: { flexDirection: 'row', gap: Spacing.sm },
  cover: { width: 72, height: 72, borderRadius: Radius.sm },
  foot: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textTertiary },
});
