import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardStack } from '@/components/discovery/card-stack';
import { computeCardSize, MAX_CARD_HEIGHT, MAX_CARD_WIDTH, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { AppleMusicLink, CreditLine, LastfmLink } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useGamePool } from '@/hooks/use-game-pool';
import { usePlayback } from '@/hooks/use-playback';
import {
  pickTestSongs,
  scoreTest,
  songToTrack,
  testComparison,
  testHeadline,
  testShareText,
  testVerdict,
  type TestItem,
} from '@/lib/blind-test';
import { artworkUrl, describeListeners } from '@/lib/discovery';
import { appendLikedTrack, saveBlindTest } from '@/lib/discovery-storage';

const MAX_NEVER = 3;

/** Pick genres you'd never listen to, hear 10 blind songs (half from them), see the gap. */
export default function BlindTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pool = useGamePool();
  const { player, status } = usePlayback();
  const genres = useMemo(() => [...new Set(pool.map((s) => s.genre))].sort(), [pool]);

  const [never, setNever] = useState<string[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [liked, setLiked] = useState<boolean[]>([]);
  const [cardSize, setCardSize] = useState<CardSize>({ width: MAX_CARD_WIDTH, height: MAX_CARD_HEIGHT });
  const [playingAt, setPlayingAt] = useState<number | null>(null);

  const phase = items.length === 0 ? 'pick' : liked.length < items.length ? 'play' : 'result';
  const cards = useMemo(() => items.slice(liked.length).map((x) => songToTrack(x.song)), [items, liked.length]);
  const previewUrl = phase === 'play' ? cards[0]?.previewUrl : undefined;

  useEffect(() => {
    if (!previewUrl) return;
    player.replace(previewUrl);
    player.play();
  }, [previewUrl, player]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function toggleGenre(g: string) {
    setNever((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : cur.length < MAX_NEVER ? [...cur, g] : cur));
  }

  function start() {
    setLiked([]);
    setItems(pickTestSongs(pool, never));
  }

  async function handleSwipe(direction: SwipeDirection) {
    if (direction === 'down') return;
    const like = direction === 'right';
    const i = liked.length;
    const next = [...liked, like];
    setLiked(next);
    if (like) await appendLikedTrack({ ...songToTrack(items[i].song), likedAt: Date.now() });
    if (next.length === items.length) {
      player.pause();
      const score = scoreTest(items, next);
      await saveBlindTest({ never, ...score, at: Date.now() });
    }
  }

  function togglePlay(i: number) {
    if (playingAt === i) {
      player.pause();
      setPlayingAt(null);
      return;
    }
    player.replace(items[i].song.previewUrl);
    player.play();
    setPlayingAt(i);
  }

  function retake() {
    player.pause();
    setPlayingAt(null);
    setItems([]);
    setLiked([]);
  }

  const close = (
    <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
      <Ionicons name="close" size={26} color={Colors.textSecondary} style={styles.close} />
    </TouchableOpacity>
  );

  if (phase === 'pick') {
    return (
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + Spacing.lg }]}>
        {close}
        <ThemedText type="subtitle">Which genres would you never listen to?</ThemedText>
        <ThemedText style={styles.dim}>Pick up to {MAX_NEVER}. Then you&apos;ll hear 10 songs blind.</ThemedText>
        <View style={styles.chips}>
          {genres.map((g) => {
            const on = never.includes(g);
            return (
              <TouchableOpacity key={g} onPress={() => toggleGenre(g)} activeOpacity={0.7}>
                <ThemedView style={styles.chip} backgroundColor={on ? Colors.accent : Colors.surfaceElevated}>
                  <ThemedText type="label" style={{ color: on ? Colors.accentText : Colors.textSecondary }}>
                    {g}
                  </ThemedText>
                </ThemedView>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity onPress={start} disabled={never.length === 0}>
          <ThemedView style={[styles.button, never.length === 0 && styles.disabled]} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              {never.length === 0 ? 'Pick at least one' : 'Start'}
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase === 'play') {
    return (
      <ThemedView style={[styles.fill, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.header}>
          {close}
          <ThemedView style={styles.pill} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Blind Spot Test · {liked.length + 1}/{items.length}
            </ThemedText>
          </ThemedView>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.cardArea} onLayout={(e: LayoutChangeEvent) => setCardSize(computeCardSize(e.nativeEvent.layout))}>
          <CardStack
            queue={cards}
            cardSize={cardSize}
            onSwipe={handleSwipe}
            onHold={() => (status.playing ? player.pause() : player.play())}
            playing={status.playing}
            showPlayIcon={status.isLoaded && !status.playing}
            allowDown={false}
          />
        </View>
        <CreditLine />
      </ThemedView>
    );
  }

  const { neverLiked, otherLiked } = scoreTest(items, liked);
  return (
    <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + Spacing.lg }]}>
      {close}
      <ThemedView style={styles.result} backgroundColor={Colors.surface}>
        <ThemedText style={styles.big}>{neverLiked}/5</ThemedText>
        <ThemedText type="subtitle">{testHeadline(never, neverLiked)}</ThemedText>
        <ThemedText style={styles.dim}>{testComparison(otherLiked)}</ThemedText>
        <ThemedText style={styles.verdict}>{testVerdict(neverLiked, otherLiked)}</ThemedText>
      </ThemedView>

      {items.map((x, i) => (
        <TouchableOpacity key={x.song.artist} onPress={() => togglePlay(i)} activeOpacity={0.8}>
          <ThemedView style={styles.row} backgroundColor={Colors.surface}>
            <Image source={{ uri: artworkUrl(x.song.artworkUrl, 200) }} style={styles.art} />
            <View style={styles.info}>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {x.song.title}
              </ThemedText>
              <ThemedText numberOfLines={1} style={styles.dim}>
                {x.song.artist} · {x.song.genre}
                {x.isNever ? ' · your never' : ''}
              </ThemedText>
              <ThemedText type="caption">
                {liked[i] ? 'Liked' : 'Skipped'} · {describeListeners(x.song.listeners).count} listeners
              </ThemedText>
              <View style={styles.links}>
                <LikeButton track={songToTrack(x.song)} size={18} />
                <AppleMusicLink trackId={x.song.itunesTrackId} />
                <LastfmLink artist={x.song.artist} />
              </View>
            </View>
            <Ionicons name={playingAt === i ? 'pause' : 'play'} size={20} color={Colors.textSecondary} />
          </ThemedView>
        </TouchableOpacity>
      ))}

      <CreditLine />
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => Share.share({ message: testShareText(never, neverLiked) }).catch(() => {})}>
          <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
            <ThemedText type="label">Share</ThemedText>
          </ThemedView>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={retake}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Retake
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.md },
  pad: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  close: { fontSize: 22, color: Colors.textSecondary, width: 60 },
  dim: { color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.md },
  chip: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.pill },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 60 },
  pill: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  result: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.xs },
  big: { fontSize: 56, lineHeight: 60, fontWeight: '800', color: Colors.accent },
  verdict: { fontSize: 18, fontWeight: '700', marginTop: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  art: { width: 56, height: 56, borderRadius: Radius.sm },
  info: { flex: 1, gap: 2 },
  links: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  action: { flex: 1 },
});
