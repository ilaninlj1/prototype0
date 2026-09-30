import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BlindPackEmblem,
  BlindTestEmblem,
  DailyDropEmblem,
  HeadToHeadEmblem,
  SpotTheStarEmblem,
} from '@/components/emblems';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
import { loadBestStreaks, loadBlindTest, type BestStreaks, type BlindTestResult } from '@/lib/discovery-storage';

// A plain list row, not a card: title, one line of state, and a chevron.
function Entry({
  title,
  line,
  detail,
  onPress,
  emblem,
}: {
  title: string;
  line: string;
  detail?: string;
  onPress?: () => void;
  emblem: ReactNode;
}) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} style={styles.entry}>
      {emblem}
      <View style={styles.entryText}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText style={styles.line}>{line}</ThemedText>
        {detail && <ThemedText style={styles.detail}>{detail}</ThemedText>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />}
    </PressableScale>
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
      `Liked ${daily.likedCount}/5 · ${daily.guessRight ? 'found the famous one' : 'missed the famous one'}`,
      () => router.push('/drop-results'),
    ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Play</ThemedText>
      <Entry
        title={d ? `Daily Drop #${d.number}` : 'Daily Drop'}
        emblem={<DailyDropEmblem />}
        line={dropLine}
        detail={daily.streak > 0 ? `${daily.streak}-day streak` : undefined}
        onPress={dropGo}
      />
      <Entry
        title="Blind Spot Test"
        emblem={<BlindTestEmblem />}
        line={test ? `Retake — you liked ${test.neverLiked}/5 of your "nevers"` : "Pick genres you'd never listen to, then hear them blind"}
        detail={test ? `Last time: never ${test.never.join(', ')}` : undefined}
        onPress={() => router.push('/blind-test')}
      />
      <Entry
        title="Blind Pack"
        emblem={<BlindPackEmblem />}
        line="Send 5 of your finds to a friend — they hear them blind"
        onPress={() => router.push('/pack-send')}
      />
      <Entry
        title="Spot the Star"
        emblem={<SpotTheStarEmblem />}
        line="Find the one with 1M+ listeners"
        detail={best.spot > 0 ? `Best streak ${best.spot}` : undefined}
        onPress={() => router.push('/play-spot')}
      />
      <Entry
        title="Head to Head"
        emblem={<HeadToHeadEmblem />}
        line="Which has more listeners?"
        detail={best.h2h > 0 ? `Best streak ${best.h2h}` : undefined}
        onPress={() => router.push('/play-h2h')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl * 2, paddingBottom: Spacing.xl, gap: Spacing.sm, flexGrow: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  entryText: { flex: 1, gap: 2 },
  line: { color: Colors.textSecondary },
  detail: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 15, letterSpacing: 1, color: Colors.signal, textTransform: 'uppercase' },
});
