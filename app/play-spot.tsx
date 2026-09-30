import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { GuessTile } from '@/components/play/guess-tile';
import { CreditLine } from '@/components/credits';
import { SpotTheStarEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useGamePool } from '@/hooks/use-game-pool';
import { usePlayback } from '@/hooks/use-playback';
import { songToTrack } from '@/lib/blind-test';
import { saveBestStreak } from '@/lib/discovery-storage';
import { spotRound, type PoolSong } from '@/lib/game-pool';

const STAR = 1_000_000;

export default function SpotTheStarScreen() {
  const router = useRouter();
  const pool = useGamePool();
  const { player } = usePlayback();
  const [used] = useState(() => new Set<string>());
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [round, setRound] = useState<PoolSong[]>(() => deal(0));
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  function deal(s: number): PoolSong[] {
    const r = spotRound(pool, s, used);
    r.forEach((x) => used.add(x.artist));
    return r;
  }

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function pick(i: number) {
    if (revealed) return;
    setPicked(i);
    player.replace(round[i].previewUrl);
    player.play();
  }

  async function lockIn() {
    if (picked == null) return;
    player.pause();
    setRevealed(true);
    if (round[picked].listeners < STAR) setBest(await saveBestStreak('spot', streak));
  }

  function next() {
    const right = picked != null && round[picked].listeners >= STAR;
    const s = right ? streak + 1 : 0;
    if (!right) used.clear();
    setStreak(s);
    setBest(null);
    setRound(deal(s));
    setPicked(null);
    setRevealed(false);
  }

  const right = revealed && picked != null && round[picked].listeners >= STAR;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedView style={styles.top} backgroundColor="transparent">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} style={styles.close} />
        </TouchableOpacity>
        <ThemedText type="label">Streak {streak}</ThemedText>
      </ThemedView>
      <SpotTheStarEmblem size={64} />
      <ThemedText type="subtitle">Which one has 1M+ listeners?</ThemedText>
      <ThemedText style={styles.dim}>Tap a tile to hear it. Last.fm listeners (Sept 2026).</ThemedText>
      <ThemedView style={styles.grid} backgroundColor="transparent">
        {round.map((s, i) => (
          <GuessTile
            key={s.artist}
            label={String(i + 1)}
            selected={picked === i}
            revealed={revealed}
            correct={s.listeners >= STAR}
            song={s}
            likeTrack={songToTrack(s)}
            onPress={() => pick(i)}
          />
        ))}
      </ThemedView>
      {revealed && (
        <ThemedText type="subtitle" style={{ color: right ? Colors.positive : Colors.destructive }}>
          {right ? 'Nice — keep going' : `Game over · streak ${streak}${best != null ? ` · best ${best}` : ''}`}
        </ThemedText>
      )}
      <TouchableOpacity onPress={revealed ? next : lockIn} disabled={!revealed && picked == null}>
        <ThemedView style={[styles.button, !revealed && picked == null && styles.disabled]} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>
            {revealed ? (right ? 'Next' : 'Play again') : picked == null ? 'Pick one' : `Lock in #${picked + 1}`}
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <CreditLine />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, paddingTop: Spacing.xxl * 2, gap: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { fontSize: 22, color: Colors.textSecondary },
  dim: { color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginVertical: Spacing.md },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
  disabled: { opacity: 0.4 },
});
