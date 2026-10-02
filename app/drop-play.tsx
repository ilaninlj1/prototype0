import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardStack } from '@/components/discovery/card-stack';
import { computeCardSize, MAX_CARD_HEIGHT, MAX_CARD_WIDTH, type CardSize, type SwipeDirection } from '@/components/discovery/swipe-physics';
import { UndoButton } from '@/components/discovery/undo-button';
import { CreditLine } from '@/components/credits';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Ui } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
import { usePlayback } from '@/hooks/use-playback';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import { appendSwipeEntry, loadSwipeHistory, saveSwipeHistory } from '@/lib/discovery-storage';

/** Today's five blind cards, full screen. ✕ keeps progress; the 5th swipe goes to the guess. */
export default function DropPlayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const daily = useDailyDrop();
  const { player, status } = usePlayback();
  const [cardSize, setCardSize] = useState<CardSize>({ width: MAX_CARD_WIDTH, height: MAX_CARD_HEIGHT });
  const [likedFlash, setLikedFlash] = useState(false);
  const shownAtRef = useRef(0);
  const track = daily.cards[0];

  const previewUrl = track?.previewUrl;
  useEffect(() => {
    shownAtRef.current = Date.now();
    if (previewUrl) {
      player.replace(previewUrl);
      player.play();
    }
  }, [previewUrl, player]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  useEffect(() => {
    if (daily.drop && !daily.active) router.replace(daily.guess == null ? '/drop-guess' : '/drop-results');
  }, [daily.drop, daily.active, daily.guess, router]);

  async function handleSwipe(direction: SwipeDirection, t: DiscoveryTrack) {
    if (direction === 'down') return;
    const liked = direction === 'right';
    const entry: SwipeEntry = {
      trackId: t.id,
      trackName: t.trackName,
      artistId: t.artistId,
      artistName: t.artistName,
      genre: t.primaryGenreName,
      previewUrl: t.previewUrl,
      artworkUrl100: t.artworkUrl100,
      action: liked ? 'like' : 'skip',
      timestamp: Date.now(),
      artistListeners: t.artistListeners,
      listenMs: Math.round(status.currentTime * 1000),
      dwellMs: Date.now() - shownAtRef.current,
      source: 'drop',
    };
    await appendSwipeEntry(entry);
    if (liked) {
      setLikedFlash(true);
      setTimeout(() => setLikedFlash(false), 600);
    }
    await daily.vote(liked);
  }

  async function handleUndo() {
    daily.undo();
    const history = await loadSwipeHistory();
    const i = history.findLastIndex((e) => e.source === 'drop');
    if (i !== -1) await saveSwipeHistory(history.filter((_, j) => j !== i));
  }

  async function handleHold() {
    if (!status.isLoaded) return;
    if (status.playing) player.pause();
    else player.play();
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} style={styles.close} />
        </TouchableOpacity>
        <ThemedView style={styles.pill} backgroundColor="transparent">
          <ThemedText style={Ui.label}>
            Daily Drop · {Math.min(daily.played + 1, 5)}/5
          </ThemedText>
        </ThemedView>
        <UndoButton disabled={!daily.canUndo} onPress={handleUndo} />
      </View>

      <View style={styles.cardArea} onLayout={(e: LayoutChangeEvent) => setCardSize(computeCardSize(e.nativeEvent.layout))}>
        {track && (
          <CardStack
            queue={daily.cards}
            cardSize={cardSize}
            onSwipe={handleSwipe}
            onHold={handleHold}
            playing={status.playing}
            showPlayIcon={status.isLoaded && !status.playing}
            allowDown={false}
          />
        )}
        {likedFlash && (
          <ThemedView style={styles.flash} backgroundColor="transparent" pointerEvents="none">
            <ThemedText type="subtitle" style={styles.flashText}>Liked</ThemedText>
          </ThemedView>
        )}
      </View>
      <CreditLine />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { fontSize: 22, color: Colors.textSecondary, width: 60 },
  pill: { ...Ui.outlineButton, minHeight: 32 },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flash: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flashText: { color: Colors.positive, fontSize: 32, lineHeight: 36 },
});
