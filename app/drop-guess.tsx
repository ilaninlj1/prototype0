import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { GuessTile } from '@/components/play/guess-tile';
import { CreditLine } from '@/components/credits';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import type { Drop, DropVote } from '@/lib/daily-drop';
import { loadCachedDrop, loadDropProgress, saveDropProgress } from '@/lib/discovery-storage';
import { flushPendingBriefly } from '@/lib/drop-sync';

/** Between the 5th swipe and the results: guess which song has the most listeners, still blind. */
export default function DropGuessScreen() {
  const router = useRouter();
  const { player } = usePlayback();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([loadCachedDrop(), loadDropProgress()]);
      if (!d || p?.day !== d.day) return;
      if (p.guess != null) return router.replace('/drop-results');
      setDrop(d);
      setVotes(p.votes);
    })();
  }, [router]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function pick(i: number) {
    if (!drop) return;
    setPicked(i);
    player.replace(drop.songs[i].previewUrl);
    player.play();
  }

  async function lockIn() {
    if (!drop || picked == null || locking) return;
    setLocking(true);
    player.pause();
    const entry = { day: drop.day, votes, guess: picked };
    await saveDropProgress(entry);
    await flushPendingBriefly(entry);
    router.replace('/drop-results');
  }

  if (!drop) return <ThemedView style={styles.container} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="eyebrow">Blindspot Daily · No. {drop.number}</ThemedText>
      <ThemedText type="subtitle">Which one has the most listeners?</ThemedText>
      <ThemedText style={styles.dim}>One of these is secretly famous. Tap to hear it again, then lock in your guess.</ThemedText>

      <ThemedView style={styles.grid} backgroundColor="transparent">
        {drop.songs.map((_, i) => (
          <GuessTile
            key={i}
            label={String(i + 1)}
            sub={votes.find((v) => v.position === i)?.liked ? 'liked' : 'skipped'}
            selected={picked === i}
            onPress={() => pick(i)}
          />
        ))}
      </ThemedView>

      <TouchableOpacity onPress={lockIn} disabled={picked == null || locking} activeOpacity={0.8}>
        <ThemedView
          style={[styles.button, (picked == null || locking) && styles.disabled]}
          backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>
            {picked == null ? 'Pick one' : `Lock in #${picked + 1}`}
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <CreditLine lastfm={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, gap: Spacing.md, backgroundColor: Colors.background, flexGrow: 1, justifyContent: 'center' },
  dim: { color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginVertical: Spacing.lg },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
  disabled: { opacity: 0.4 },
});
