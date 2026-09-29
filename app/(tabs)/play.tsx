import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
import { loadBestStreaks, loadBlindTest, type BestStreaks, type BlindTestResult } from '@/lib/discovery-storage';

function Entry({ title, line, detail, onPress }: { title: string; line: string; detail?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.8}>
      <ThemedView style={styles.entry} backgroundColor={Colors.surface}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText style={styles.line}>{line}</ThemedText>
        {detail && <ThemedText type="caption">{detail}</ThemedText>}
      </ThemedView>
    </TouchableOpacity>
  );
}

export default function PlayScreen() {
  const router = useRouter();
  const daily = useDailyDrop();
  const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });
  const [test, setTest] = useState<BlindTestResult | null>(null);

  useFocusEffect(
    useCallback(() => {
      daily.refresh();
      loadBestStreaks().then(setBest);
      loadBlindTest().then(setTest);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const d = daily.drop;
  let dropLine = 'No drop today — check back tomorrow';
  let dropGo: (() => void) | undefined;
  if (d && daily.played === 0) [dropLine, dropGo] = ["Play today's 5 — blind", () => router.push('/drop-play')];
  else if (d && daily.active) [dropLine, dropGo] = [`Continue · ${daily.played}/5`, () => router.push('/drop-play')];
  else if (d && daily.guess == null) [dropLine, dropGo] = ['Make your guess', () => router.push('/drop-guess')];
  else if (d)
    [dropLine, dropGo] = [
      `Liked ${daily.likedCount}/5 · 🎯 ${daily.guessRight ? '✓' : '✗'} — see your songs`,
      () => router.push('/drop-results'),
    ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Play</ThemedText>
      <Entry
        title={d ? `Daily Drop #${d.number}` : 'Daily Drop'}
        line={dropLine}
        detail={daily.streak > 0 ? `🔥 ${daily.streak} day streak` : undefined}
        onPress={dropGo}
      />
      <Entry
        title="Blind Spot Test"
        line={test ? `Retake — you liked ${test.neverLiked}/5 of your "nevers"` : "Pick genres you'd never listen to, then hear them blind"}
        detail={test ? `Last time: never ${test.never.join(', ')}` : undefined}
        onPress={() => router.push('/blind-test')}
      />
      <Entry
        title="Spot the Star"
        line="Find the one with 1M+ listeners"
        detail={best.spot > 0 ? `Best streak ${best.spot}` : undefined}
        onPress={() => router.push('/play-spot')}
      />
      <Entry
        title="Head to Head"
        line="Which has more listeners?"
        detail={best.h2h > 0 ? `Best streak ${best.h2h}` : undefined}
        onPress={() => router.push('/play-h2h')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, paddingTop: Spacing.xxl * 2, gap: Spacing.lg, flexGrow: 1 },
  entry: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.xs },
  line: { color: Colors.accent, fontWeight: '600' },
});
