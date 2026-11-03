import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useOcean } from '@/hooks/use-ocean';
import type { SwipeEntry } from '@/lib/discovery';
import { loadSwipeHistory } from '@/lib/discovery-storage';
import { portrait } from '@/lib/ocean-person';
import { requestSteer } from '@/lib/steer-request';

const REEF = { water: 'reef', depth: 'popular' } as const;

/** You → Discoveries: your ocean in a few plain lines, and the way down. */
export function OceanCard() {
  const router = useRouter();
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      void loadSwipeHistory().then(setHistory);
    }, [])
  );
  const life = useOcean(history);
  if (!life) return null;
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      accessibilityHint="Goes under the water on Home"
      onPress={() => {
        requestSteer({ kind: 'ocean', place: REEF });
        router.navigate('/');
      }}>
      <ThemedText style={styles.title}>Your ocean</ThemedText>
      {portrait(life, Date.now())
        .slice(0, 3)
        .map((line) => (
          <ThemedText key={line} style={styles.line}>
            {line}
          </ThemedText>
        ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 20, padding: Spacing.lg, gap: Spacing.xs },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: Colors.text },
  line: { fontSize: 15, lineHeight: 21, color: Colors.text },
});
