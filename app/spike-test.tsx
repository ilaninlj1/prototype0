import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import spikeResults from '@/assets/spike-results.json';

// Dev-only demo screen for Prototype 3's sound-features spike
// (scripts/spike-sound-features.ts, docs/superpowers/specs/2026-09-17-sound-space-design.md's
// Check 1). Reads the precomputed assets/spike-results.json rather than running
// essentia.js/node-web-audio-api in the app itself — those stay dev-only tools,
// same convention as assets/catalogs/ vs. the Phase 0 precompute scripts that build them.
export default function SpikeTestScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <ThemedText type="caption">Extracted offline with essentia.js from iTunes previews.</ThemedText>
        {spikeResults.map((track) => (
          <ThemedView key={`${track.artist}-${track.title}`} style={styles.row} backgroundColor={Colors.surface}>
            <ThemedText type="defaultSemiBold">{track.title}</ThemedText>
            <ThemedText type="caption">
              {track.artist} · {track.genre}
            </ThemedText>
            <ThemedText style={styles.stats}>
              {track.bpm} BPM · {track.key} · danceability {track.danceability}
            </ThemedText>
          </ThemedView>
        ))}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  row: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
  },
  stats: {
    color: Colors.accent,
    marginTop: Spacing.xs,
  },
});
