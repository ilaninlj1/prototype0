import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FlipInEasyY } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import {
  crowdLabel,
  guessLine,
  pickHeadline,
  shareText,
  type Drop,
  type DropVote,
  type GuessResult,
  type SongResult,
} from '@/lib/daily-drop';
import { artworkUrl, describeListeners } from '@/lib/discovery';
import { loadCachedDrop, loadDropProgress } from '@/lib/discovery-storage';
import { fetchGuessResults, fetchResults } from '@/lib/supabase';

export default function DropResultsScreen() {
  const router = useRouter();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [results, setResults] = useState<SongResult[] | null>(null);
  const [guess, setGuess] = useState<number | undefined>(undefined);
  const [guessResults, setGuessResults] = useState<GuessResult[]>([]);
  const [playingAt, setPlayingAt] = useState<number | null>(null);
  const { player } = usePlayback();

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([loadCachedDrop(), loadDropProgress()]);
      if (!d || p?.day !== d.day) return;
      if (p.guess == null) return router.replace('/drop-guess');
      setDrop(d);
      setVotes(p.votes);
      setGuess(p.guess);
      const [r, g] = await Promise.all([fetchResults(d.day), fetchGuessResults(d.day)]);
      setResults(r);
      setGuessResults(g ?? []);
    })();
  }, [router]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function togglePlay(i: number) {
    if (!drop) return;
    if (playingAt === i) {
      player.pause();
      setPlayingAt(null);
      return;
    }
    player.replace(drop.songs[i].previewUrl);
    player.play();
    setPlayingAt(i);
  }

  if (!drop) return <ThemedView style={styles.container} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="caption">Blindspot Daily #{drop.number}</ThemedText>
      <ThemedText type="subtitle">{pickHeadline(drop, votes, results ?? [])}</ThemedText>
      {guess != null && <ThemedText style={styles.guess}>{guessLine(drop, guess, guessResults)}</ThemedText>}

      {drop.songs.map((s, i) => {
        const r = results?.find((x) => x.position === i);
        const liked = votes.find((v) => v.position === i)?.liked;
        const share = r && r.voters > 0 ? r.likes / r.voters : 0;
        return (
          <Animated.View key={s.itunesTrackId} entering={FlipInEasyY.delay(i * 500).springify().damping(14)}>
            <TouchableOpacity onPress={() => togglePlay(i)} activeOpacity={0.8}>
            <ThemedView style={styles.row} backgroundColor={Colors.surface}>
              <Image source={{ uri: artworkUrl(s.artworkUrl, 200) }} style={styles.art} />
              <ThemedView style={styles.info} backgroundColor="transparent">
                {s.slot === 'famous' && <ThemedText type="caption" style={styles.famous}>The secret famous one</ThemedText>}
                {guess === i && <ThemedText type="caption" style={styles.famous}>🎯 Your guess</ThemedText>}
                <ThemedText type="defaultSemiBold" numberOfLines={1}>{s.title}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.dim}>{s.artist}</ThemedText>
                <ThemedText style={styles.count}>{describeListeners(s.listeners).count} listeners</ThemedText>
                <ThemedView style={styles.bar} backgroundColor={Colors.surfaceElevated}>
                  <ThemedView style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} backgroundColor={Colors.accent} />
                </ThemedView>
                <ThemedText type="caption">
                  {liked ? '♥ You liked it' : '✕ You skipped it'} · {results ? crowdLabel(r) : "Results when you're back online"}
                </ThemedText>
              </ThemedView>
              <ThemedText style={styles.play}>{playingAt === i ? '⏸' : '▶'}</ThemedText>
            </ThemedView>
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      <TouchableOpacity onPress={() => Share.share({ message: shareText(drop, votes, guess) }).catch(() => {})}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">Share</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedView style={styles.button} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>Keep swiping</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, gap: Spacing.md, backgroundColor: Colors.background, flexGrow: 1 },
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  art: { width: 72, height: 72, borderRadius: Radius.sm },
  info: { flex: 1, gap: 2 },
  dim: { color: Colors.textSecondary },
  guess: { fontSize: 17, fontWeight: '700', color: Colors.accent },
  play: { alignSelf: 'center', color: Colors.textSecondary, fontSize: 18 },
  famous: { color: Colors.accent, fontWeight: '700' },
  count: { color: Colors.accent, fontWeight: '800', fontSize: 18 },
  bar: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: 6 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
});
