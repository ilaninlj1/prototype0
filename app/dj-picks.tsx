import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleMusicLink, CreditLine, SpotifyLink } from '@/components/credits';
import { CardStack } from '@/components/discovery/card-stack';
import { RevealCard } from '@/components/discovery/reveal-card';
import { computeCardSize, MAX_CARD_HEIGHT, MAX_CARD_WIDTH, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { usePlayback, usePreviewWhileFocused } from '@/hooks/use-playback';
import { artworkUrl } from '@/lib/discovery';
import { loadDjPicks, type DjCard } from '@/lib/dj-picks-api';
import { fetchArtistListeners } from '@/lib/pool';

const KEXP_PLAYLIST = 'https://www.kexp.org/playlist/';

/** DJ Picks: five songs real KEXP DJs played in the last day, heard blind; the reveal shows who played it and why. */
export default function DjPicksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { player, status } = usePlayback();
  const [cards, setCards] = useState<DjCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [listeners, setListeners] = useState<number | null | undefined>(undefined);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const revealIdRef = useRef<number | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>({ width: MAX_CARD_WIDTH, height: MAX_CARD_HEIGHT });

  useEffect(() => {
    loadDjPicks(5).then(setCards);
  }, []);

  const current = cards?.[index];
  const done = !!cards && cards.length > 0 && index >= cards.length;
  usePreviewWhileFocused(done ? undefined : current?.track.previewUrl);

  function handleSwipe(direction: SwipeDirection) {
    if (!current || direction === 'down') return;
    if (direction === 'left') return setIndex((i) => i + 1);
    const id = current.track.id;
    setRevealedIds((s) => new Set(s).add(id));
    setRevealed(true);
    setListeners(undefined);
    revealIdRef.current = id;
    fetchArtistListeners(current.track.artistName).then((n) => revealIdRef.current === id && setListeners(n));
  }

  function next() {
    revealIdRef.current = null;
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  const pad = { paddingTop: insets.top + Spacing.lg };

  if (!cards || cards.length === 0) {
    return (
      <ThemedView style={[styles.center, pad]}>
        <ThemedText type="subtitle" style={styles.centerText}>
          {cards ? 'Couldn’t reach KEXP just now.' : 'Asking the DJs what they played…'}
        </ThemedText>
        {cards && <ThemedText style={[styles.dim, styles.centerText]}>Try again in a minute.</ThemedText>}
        {cards && (
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedView style={styles.button} backgroundColor={Colors.accent}>
              <ThemedText type="label" style={{ color: Colors.accentText }}>
                Back
              </ThemedText>
            </ThemedView>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  }

  if (done) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, pad, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <ThemedText type="eyebrow">DJ Picks · KEXP 90.3 FM Seattle</ThemedText>
        <ThemedText type="title">You wanted to know {revealedIds.size} of {cards.length}.</ThemedText>
        <ThemedText style={styles.dim}>Every one of these was picked by a person, on the air, in the last day.</ThemedText>
        {cards.map((c) => (
          <ThemedView key={c.track.id} style={styles.row} backgroundColor={Colors.surface}>
            <Image source={{ uri: artworkUrl(c.track.artworkUrl100, 200) }} style={styles.art} />
            <View style={styles.info}>
              <ThemedText style={styles.rowTitle} numberOfLines={1}>
                {c.track.trackName}
              </ThemedText>
              <ThemedText numberOfLines={1} style={styles.dim}>
                {c.track.artistName} · {revealedIds.has(c.track.id) ? 'you revealed it' : 'you skipped it'}
              </ThemedText>
              <ThemedText style={styles.line}>{c.line}</ThemedText>
              {!!c.pick.note && (
                <ThemedText style={styles.noteSmall}>
                  “{c.pick.note}”
                </ThemedText>
              )}
              <View style={styles.links}>
                <LikeButton track={c.track} size={18} />
                <AppleMusicLink trackId={c.track.id} url={c.track.trackViewUrl} height={26} />
                <SpotifyLink artist={c.track.artistName} title={c.track.trackName} />
              </View>
            </View>
          </ThemedView>
        ))}
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedView style={styles.button} backgroundColor={Colors.accent}>
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Done
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
        <KexpCredit />
        <CreditLine />
      </ScrollView>
    );
  }

  return (
    <ThemedView style={[styles.container, pad]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} />
        </TouchableOpacity>
        <ThemedView style={styles.pill} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>
            DJ Picks · {index + 1}/{cards.length}
          </ThemedText>
        </ThemedView>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.cardArea} onLayout={(e: LayoutChangeEvent) => setCardSize(computeCardSize(e.nativeEvent.layout))}>
        {revealed && current ? (
          <RevealCard
            key={current.track.id}
            track={{ ...current.track, artistListeners: listeners ?? undefined }}
            listeners={listeners}
            size={cardSize}
            onDone={next}
            extra={<DjNote card={current} />}
          />
        ) : (
          <CardStack
            queue={cards.slice(index).map((c) => c.track)}
            cardSize={cardSize}
            onSwipe={handleSwipe}
            onHold={() => (status.playing ? player.pause() : player.play())}
            playing={status.playing}
            showPlayIcon={status.isLoaded && !status.playing}
            allowDown={false}
          />
        )}
      </View>
      <KexpCredit />
    </ThemedView>
  );
}

/** Who played it, their note, and whether the artist is from Seattle. */
function DjNote({ card }: { card: DjCard }) {
  return (
    <View style={styles.dj}>
      <ThemedText style={styles.line}>
        {card.line}
        {card.pick.isLocal ? ' · Seattle local' : ''}
      </ThemedText>
      {!!card.pick.note && (
        <ThemedText style={styles.note}>
          “{card.pick.note}”
        </ThemedText>
      )}
    </View>
  );
}

function KexpCredit() {
  return (
    <Pressable onPress={() => Linking.openURL(KEXP_PLAYLIST)} hitSlop={6}>
      <ThemedText type="caption" style={styles.credit}>
        Songs played on KEXP 90.3 FM Seattle · kexp.org
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.md },
  center: { flex: 1, backgroundColor: Colors.background, padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 26 },
  pill: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { color: Colors.textSecondary },
  dj: { gap: 2, marginTop: Spacing.xs },
  line: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, color: Colors.textSecondary },
  note: { fontFamily: Fonts.sans, fontStyle: 'italic', fontSize: 13, lineHeight: 18, color: Colors.text },
  noteSmall: { fontFamily: Fonts.sans, fontStyle: 'italic', fontSize: 13, lineHeight: 18, color: Colors.text },
  credit: { textAlign: 'center', color: Colors.textTertiary },
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  art: { width: 64, height: 64, borderRadius: Radius.sm },
  info: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 16, lineHeight: 20 },
  links: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'center', marginTop: 4 },
  button: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.pill, alignItems: 'center' },
});
