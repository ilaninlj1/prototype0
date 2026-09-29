import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import {
  crowdLabel,
  guessLine,
  pickHeadline,
  rankByListeners,
  rankLabel,
  shareText,
  type Drop,
  type DropVote,
  type GuessResult,
  type SongResult,
} from '@/lib/daily-drop';
import { artworkUrl, describeListeners } from '@/lib/discovery';
import { loadCachedDrop, loadDropProgress } from '@/lib/discovery-storage';
import { fetchGuessResults, fetchResults } from '@/lib/supabase';

/** The drop's five songs as full cards, swiped from fewest to most listeners. */
export default function DropResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [results, setResults] = useState<SongResult[] | null>(null);
  const [guess, setGuess] = useState<number | undefined>(undefined);
  const [guessResults, setGuessResults] = useState<GuessResult[]>([]);
  const [page, setPage] = useState(0);
  const { player, status } = usePlayback();

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

  const ranked = drop ? rankByListeners(drop) : [];

  // The card in view plays its song, like the feed.
  const currentUrl = ranked[page]?.song.previewUrl;
  useEffect(() => {
    if (!currentUrl) return;
    player.replace(currentUrl);
    player.play();
  }, [currentUrl, player]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  if (!drop) return <ThemedView style={styles.fill} />;

  const cardWidth = width - Spacing.lg * 2;

  return (
    <ThemedView style={[styles.fill, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.md }]}>
      <View style={styles.head}>
        <ThemedText type="caption">Blindspot Daily #{drop.number}</ThemedText>
        <ThemedText type="subtitle">{pickHeadline(drop, votes, results ?? [])}</ThemedText>
        {guess != null && <ThemedText style={styles.guess}>{guessLine(drop, guess, guessResults)}</ThemedText>}
      </View>

      <FlatList
        data={ranked}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(r) => String(r.song.itunesTrackId)}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
        renderItem={({ item: { song, position, rank } }) => {
          const r = results?.find((x) => x.position === position);
          const liked = votes.find((v) => v.position === position)?.liked;
          const share = r && r.voters > 0 ? r.likes / r.voters : 0;
          const verdict = describeListeners(song.listeners);
          return (
            <View style={[styles.page, { width }]}>
              <Pressable style={styles.pressFill} onLongPress={() => (status.playing ? player.pause() : player.play())} delayLongPress={400}>
              <ThemedView style={[styles.card, { width: cardWidth }]} backgroundColor={Colors.surface}>
                <ScrollView contentContainerStyle={styles.cardBody}>
                  <ThemedText style={styles.rank}>{rankLabel(rank)}</ThemedText>
                  <Image source={{ uri: artworkUrl(song.artworkUrl, 600) }} style={styles.art} />
                  <ThemedText type="subtitle" numberOfLines={1}>
                    {song.title}
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={styles.dim}>
                    {song.artist}
                  </ThemedText>
                  <ThemedText style={styles.count}>{verdict.count} listeners</ThemedText>
                  <ThemedText style={styles.dim}>{verdict.verdict}</ThemedText>
                  <View style={styles.tags}>
                    {song.slot === 'famous' && <ThemedText style={styles.tag}>The secret famous one</ThemedText>}
                    {guess === position && <ThemedText style={styles.tag}>🎯 Your guess</ThemedText>}
                  </View>
                  <ThemedText>{liked ? '♥ You liked it' : '✕ You skipped it'}</ThemedText>
                  <ThemedView style={styles.bar} backgroundColor={Colors.surfaceElevated}>
                    <ThemedView style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} backgroundColor={Colors.accent} />
                  </ThemedView>
                  <ThemedText type="caption">{results ? crowdLabel(r) : "Results when you're back online"}</ThemedText>
                </ScrollView>
              </ThemedView>
              </Pressable>
            </View>
          );
        }}
      />

      <View style={styles.ladder}>
        <View style={styles.dots}>
          {ranked.map((_, i) => (
            <ThemedView key={i} style={styles.dot} backgroundColor={i <= page ? Colors.accent : Colors.surfaceElevated} />
          ))}
        </View>
        <ThemedText type="caption">Fewest ← → Most listeners</ThemedText>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => Share.share({ message: shareText(drop, votes, guess) }).catch(() => {})}>
          <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
            <ThemedText type="label">Share</ThemedText>
          </ThemedView>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => router.back()}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Done
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },
  head: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  guess: { fontSize: 17, fontWeight: '700', color: Colors.accent },
  pager: { flexGrow: 1, marginVertical: Spacing.md },
  page: { alignItems: 'center' },
  pressFill: { flex: 1 },
  card: { flex: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  cardBody: { padding: Spacing.lg, gap: Spacing.xs },
  rank: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: Colors.accent },
  art: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, marginVertical: Spacing.sm },
  dim: { color: Colors.textSecondary },
  count: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: Colors.accent, marginTop: Spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.xs },
  tag: { color: Colors.accent, fontWeight: '700' },
  bar: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: 6 },
  ladder: { alignItems: 'center', gap: Spacing.xs },
  dots: { flexDirection: 'row', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: Radius.pill },
  actions: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  action: { flex: 1 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
});
