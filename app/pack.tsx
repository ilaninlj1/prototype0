import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardStack } from '@/components/discovery/card-stack';
import { computeCardSize, MAX_CARD_HEIGHT, MAX_CARD_WIDTH, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { AppleMusicLink, SpotifyLink, CreditLine } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Fonts } from '@/constants/theme';
import { usePlayback, usePreviewWhileFocused } from '@/hooks/use-playback';
import { matchLine, orderByIds, packUrl, parsePack, shareBackText } from '@/lib/blind-pack';
import { artworkUrl, parseArtistLookupResponse, type DiscoveryTrack } from '@/lib/discovery';

/**
 * A friend's Blind Pack: 5 songs heard blind, then how much your taste
 * matches theirs. The only page the public website shows, so it uses iTunes
 * (song + preview + store link) and never Last.fm.
 */
export default function PackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ids?: string; from?: string; kind?: string; country?: string }>();
  // 'artist' = "hear 3 of their songs blind first" from search, not a friend's pack.
  const isArtist = params.kind === 'artist';
  // 'region' = "hear a country's chart blind" from World Charts.
  const isRegion = params.kind === 'region';
  const pack = useMemo(() => parsePack(params.ids, params.from), [params.ids, params.from]);
  const { player, status } = usePlayback();

  const [fetched, setFetched] = useState<DiscoveryTrack[] | null>(null);
  const tracks = pack.ids.length === 0 ? [] : fetched;
  const [started, setStarted] = useState(false);
  const [liked, setLiked] = useState<boolean[]>([]);
  const [cardSize, setCardSize] = useState<CardSize>({ width: MAX_CARD_WIDTH, height: MAX_CARD_HEIGHT });

  useEffect(() => {
    if (pack.ids.length === 0) return;
    fetch(`https://itunes.apple.com/lookup?id=${pack.ids.join(',')}&country=${params.country ?? 'US'}`)
      .then((r) => r.json())
      .then((json) => setFetched(orderByIds(parseArtistLookupResponse(json), pack.ids)))
      .catch(() => setFetched([]));
  }, [pack.ids, params.country]);

  const cards = tracks ? tracks.slice(liked.length) : [];
  const done = !!tracks && tracks.length > 0 && liked.length === tracks.length;
  const previewUrl = started && !done ? cards[0]?.previewUrl : undefined;

  usePreviewWhileFocused(previewUrl);

  function handleSwipe(direction: SwipeDirection) {
    if (direction === 'down') return;
    const next = [...liked, direction === 'right'];
    setLiked(next);
    if (tracks && next.length === tracks.length) player.pause();
  }

  const pad = { paddingTop: insets.top + Spacing.xl };

  if (tracks === null) {
    return (
      <ThemedView style={[styles.center, pad]}>
        <ThemedText style={styles.dim}>Loading the pack…</ThemedText>
      </ThemedView>
    );
  }

  if (tracks.length === 0) {
    return (
      <ThemedView style={[styles.center, pad]}>
        <ThemedText type="subtitle">This pack link doesn&apos;t work.</ThemedText>
        <ThemedText style={styles.dim}>Ask your friend to send it again.</ThemedText>
      </ThemedView>
    );
  }

  if (!started) {
    return (
      <ThemedView style={[styles.center, pad]}>
        <ThemedText type="title" style={styles.centerText}>
          {isRegion
            ? `${tracks.length} songs from ${pack.from}'s top 25`
            : isArtist
              ? `${tracks.length} songs by ${pack.from}`
              : `${pack.from} sent you ${tracks.length} songs`}
        </ThemedText>
        <ThemedText style={[styles.dim, styles.centerText]}>
          Listen blind — no names, no covers. Swipe right (or tap the right side) on what you like, left to skip.
        </ThemedText>
        {/* Browsers only allow sound after a tap, so starting is a tap. */}
        <TouchableOpacity onPress={() => setStarted(true)}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Start listening
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
        <CreditLine lastfm={false} />
      </ThemedView>
    );
  }

  if (!done) {
    return (
      <ThemedView style={[styles.fill, pad]}>
        <ThemedView style={styles.pill} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>
            {pack.from}&apos;s pack · {liked.length + 1}/{tracks.length}
          </ThemedText>
        </ThemedView>
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
        <CreditLine lastfm={false} />
      </ThemedView>
    );
  }

  const likedCount = liked.filter(Boolean).length;
  const link = packUrl(process.env.EXPO_PUBLIC_WEB_URL ?? '', pack.ids, pack.from);
  return (
    <ScrollView contentContainerStyle={[styles.scroll, pad]}>
      <ThemedText style={styles.big}>{Math.round((likedCount / tracks.length) * 100)}%</ThemedText>
      <ThemedText type="subtitle">
        {isRegion
          ? `You liked ${likedCount} of ${tracks.length} from ${pack.from}'s chart.`
          : isArtist
            ? `You liked ${likedCount} of ${tracks.length} by ${pack.from}.`
            : matchLine(pack.from, likedCount, tracks.length)}
      </ThemedText>
      {!isArtist && !isRegion && <ThemedText style={styles.dim}>These are all songs {pack.from} found and liked.</ThemedText>}
      {tracks.map((t, i) => (
        <ThemedView key={t.id} style={styles.row} backgroundColor={Colors.surface}>
          <Image source={{ uri: artworkUrl(t.artworkUrl100, 200) }} style={styles.art} />
          <View style={styles.info}>
            <ThemedText style={styles.rowTitle} numberOfLines={1}>
              {t.trackName}
            </ThemedText>
            <ThemedText numberOfLines={1} style={styles.dim}>
              {t.artistName} · {liked[i] ? 'you liked it' : 'you skipped it'}
            </ThemedText>
            <View style={styles.links}>
              <LikeButton track={t} size={18} />
              <AppleMusicLink trackId={t.id} url={t.trackViewUrl} />
              <SpotifyLink artist={t.artistName} title={t.trackName} />
            </View>
          </View>
        </ThemedView>
      ))}
      {isArtist || isRegion ? (
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Done
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => Share.share({ message: shareBackText(pack.from, likedCount, tracks.length, link) }).catch(() => {})}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Send your score back
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      )}
      <CreditLine lastfm={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.md },
  center: { flex: 1, backgroundColor: Colors.background, padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  scroll: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  dim: { color: Colors.textSecondary },
  pill: { alignSelf: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 56, lineHeight: 60, fontWeight: '800', color: Colors.signal, fontFamily: Fonts.display },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  art: { width: 64, height: 64, borderRadius: Radius.sm },
  info: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  links: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'center' },
  button: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.pill, alignItems: 'center' },
});
