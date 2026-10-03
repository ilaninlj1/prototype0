import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { FindingCard } from '@/components/decoded/finding-card';
import { ShareCard } from '@/components/decoded/share-card';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTasteDecoded } from '@/hooks/use-taste-decoded';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import type { DecodedSong } from '@/lib/taste-decoded';

/** Taste Decoded: up to 3 findings, each with the songs behind it, a vote, and a card to share. */
export default function DecodedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [liked, setLiked] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadLikedTracks(), loadSwipeHistory()]).then(([l, h]) => {
        if (cancelled) return;
        setLiked(l);
        setHistory(h);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  const decoded = useTasteDecoded(liked, history);
  const { findings, ready, markSeen } = decoded;

  // Opening the page is what makes a finding no longer new.
  const shown = findings.map((f) => f.id).join('|');
  useEffect(() => {
    if (ready && shown) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per set of findings shown
  }, [ready, shown]);

  // Tap a cover to hear it; leaving the page stops it.
  const { player, status } = usePlayback();
  const [playingId, setPlayingId] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setPlayingId(null);
      };
    }, [player])
  );
  function play(song: DecodedSong) {
    if (playingId === song.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setPlayingId(song.id);
    if (!song.previewUrl) return;
    player.replace(song.previewUrl);
    player.play();
  }

  const cardRef = useRef<View>(null);
  const [note, setNote] = useState<string | null>(null);
  async function share() {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your taste' });
    } catch {
      setNote('Couldn’t open sharing. Try again.');
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={[Ui.textButton, styles.back]}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
        <ThemedText type="eyebrow">Blindspot · your taste</ThemedText>
        <ThemedText type="hero">Decoded</ThemedText>
        {ready && findings.length === 0 && <ThemedText style={styles.dim}>{decoded.prompt.text}</ThemedText>}
        {findings.map((f, i) => (
          <FindingCard
            key={f.id}
            index={i}
            finding={f}
            vote={decoded.votes[f.id]?.agree}
            playingId={status.playing ? playingId : null}
            onPlay={play}
            onVote={(agree) => decoded.vote(f, agree)}
          />
        ))}
        {findings[0] && (
          <>
            <ShareCard cardRef={cardRef} finding={findings[0]} />
            <PressableScale onPress={share} style={styles.cta}>
              <ThemedText style={styles.ctaText}>Share my taste</ThemedText>
            </PressableScale>
            {note && <ThemedText style={styles.dim}>{note}</ThemedText>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  back: { marginLeft: Spacing.sm },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  dim: { color: Colors.textSecondary },
  cta: {
    minHeight: 52,
    marginTop: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...Ui.label, color: Colors.accentText },
});
