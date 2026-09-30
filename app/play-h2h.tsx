import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { GuessTile } from '@/components/play/guess-tile';
import { CreditLine } from '@/components/credits';
import { HeadToHeadEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useGamePool } from '@/hooks/use-game-pool';
import { usePlayback } from '@/hooks/use-playback';
import { songToTrack } from '@/lib/blind-test';
import { saveBestStreak } from '@/lib/discovery-storage';
import { challenger, type PoolSong } from '@/lib/game-pool';

export default function HeadToHeadScreen() {
  const router = useRouter();
  const pool = useGamePool();
  const { player } = usePlayback();
  const [used] = useState(() => new Set<string>());
  const [pair, setPair] = useState<[PoolSong, PoolSong]>(() => start());
  const [streak, setStreak] = useState(0);
  const [guess, setGuess] = useState<0 | 1 | null>(null);
  const [best, setBest] = useState<number | null>(null);

  function start(): [PoolSong, PoolSong] {
    used.clear();
    const a = pool[Math.floor(Math.random() * pool.length)];
    used.add(a.artist);
    const b = challenger(pool, a, 0, used)!;
    used.add(b.artist);
    return [a, b];
  }

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function hear(i: 0 | 1) {
    if (guess != null) return;
    player.replace(pair[i].previewUrl);
    player.play();
  }

  async function choose(i: 0 | 1) {
    player.pause();
    setGuess(i);
    const winner = pair[0].listeners >= pair[1].listeners ? 0 : 1;
    if (i !== winner) setBest(await saveBestStreak('h2h', streak));
  }

  function next() {
    const winner = pair[0].listeners >= pair[1].listeners ? 0 : 1;
    if (guess !== winner) {
      setStreak(0);
      setPair(start());
    } else {
      const s = streak + 1;
      const champ = pair[winner];
      const c = challenger(pool, champ, s, used);
      if (!c) {
        setStreak(0);
        setPair(start());
      } else {
        used.add(c.artist);
        setStreak(s);
        setPair([champ, c]);
      }
    }
    setGuess(null);
    setBest(null);
  }

  const revealed = guess != null;
  const winner = pair[0].listeners >= pair[1].listeners ? 0 : 1;
  const right = revealed && guess === winner;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedView style={styles.top} backgroundColor="transparent">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} style={styles.close} />
        </TouchableOpacity>
        <ThemedText type="label">Streak {streak}</ThemedText>
      </ThemedView>
      <HeadToHeadEmblem size={64} />
      <ThemedText type="eyebrow">Head to Head · endless</ThemedText>
      <ThemedText type="title">Which has more listeners?</ThemedText>
      <ThemedText style={styles.dim}>Tap A or B to hear it. Last.fm listeners (Sept 2026).</ThemedText>
      <ThemedView style={styles.grid} backgroundColor="transparent">
        {pair.map((s, i) => (
          <GuessTile
            key={s.artist}
            label={i === 0 ? 'A' : 'B'}
            sub="tap to hear"
            selected={guess === i}
            revealed={revealed}
            correct={i === winner}
            song={s}
            likeTrack={songToTrack(s)}
            onPress={() => hear(i as 0 | 1)}
          />
        ))}
      </ThemedView>
      {revealed ? (
        <>
          <ThemedText type="subtitle" style={{ color: right ? Colors.positive : Colors.destructive }}>
            {right ? 'Right — the winner stays' : `Game over · streak ${streak}${best != null ? ` · best ${best}` : ''}`}
          </ThemedText>
          <TouchableOpacity onPress={next}>
            <ThemedView style={styles.button} backgroundColor={Colors.accent}>
              <ThemedText type="label" style={{ color: Colors.accentText }}>{right ? 'Next' : 'Play again'}</ThemedText>
            </ThemedView>
          </TouchableOpacity>
        </>
      ) : (
        <ThemedView style={styles.choices} backgroundColor="transparent">
          {(['A', 'B'] as const).map((l, i) => (
            <TouchableOpacity key={l} style={styles.choice} onPress={() => choose(i as 0 | 1)}>
              <ThemedView style={styles.button} backgroundColor={Colors.accent}>
                <ThemedText type="label" style={{ color: Colors.accentText }}>{l} has more</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>
      )}
      <CreditLine />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, paddingTop: Spacing.xxl * 2, gap: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { fontSize: 22, color: Colors.textSecondary },
  dim: { color: Colors.textSecondary },
  grid: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.md },
  choices: { flexDirection: 'row', gap: Spacing.md },
  choice: { flex: 1 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
});
