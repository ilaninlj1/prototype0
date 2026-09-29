import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FlipInEasyY } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { crowdLabel, pickHeadline, shareText, type Drop, type DropVote, type SongResult } from '@/lib/daily-drop';
import { artworkUrl, describeListeners } from '@/lib/discovery';
import { loadCachedDrop, loadDropProgress } from '@/lib/discovery-storage';
import { fetchResults } from '@/lib/supabase';

export default function DropResultsScreen() {
  const router = useRouter();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [results, setResults] = useState<SongResult[] | null>(null);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([loadCachedDrop(), loadDropProgress()]);
      if (!d || p?.day !== d.day) return;
      setDrop(d);
      setVotes(p.votes);
      setResults(await fetchResults(d.day));
    })();
  }, []);

  if (!drop) return <ThemedView style={styles.container} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="caption">Blindspot Daily #{drop.number}</ThemedText>
      <ThemedText type="subtitle">{pickHeadline(drop, votes, results ?? [])}</ThemedText>

      {drop.songs.map((s, i) => {
        const r = results?.find((x) => x.position === i);
        const liked = votes.find((v) => v.position === i)?.liked;
        const share = r && r.voters > 0 ? r.likes / r.voters : 0;
        return (
          <Animated.View key={s.itunesTrackId} entering={FlipInEasyY.delay(i * 500).springify().damping(14)}>
            <ThemedView style={styles.row} backgroundColor={Colors.surface}>
              <Image source={{ uri: artworkUrl(s.artworkUrl, 200) }} style={styles.art} />
              <ThemedView style={styles.info} backgroundColor="transparent">
                {s.slot === 'famous' && <ThemedText type="caption" style={styles.famous}>The secret famous one</ThemedText>}
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
            </ThemedView>
          </Animated.View>
        );
      })}

      <TouchableOpacity onPress={() => Share.share({ message: shareText(drop, votes) }).catch(() => {})}>
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
  famous: { color: Colors.accent, fontWeight: '700' },
  count: { color: Colors.accent, fontWeight: '800', fontSize: 18 },
  bar: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: 6 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
});
