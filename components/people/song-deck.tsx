import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { SwipeDirection } from '@/components/discovery/swipe-physics';
import { Button } from '@/components/home/action-row';
import { ListenCard, type ListenCardHandle } from '@/components/home/listen-card';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { useCoverColors } from '@/hooks/use-cover-colors';
import { usePlayback, usePreviewWhileFocused } from '@/hooks/use-playback';
import { useSound } from '@/hooks/use-sound';
import { createActionLock } from '@/lib/action-lock';
import type { DeckCard } from '@/lib/people-api';
import { recipeFor } from '@/lib/print-recipe';

type Props = {
  deck: DeckCard[];
  deckLoading: boolean;
  verdict: (card: DeckCard, hearted: boolean, heardMs: number, shownAt: number) => Promise<void>;
  next: () => void;
};

export function SongDeck({ deck, deckLoading, verdict, next }: Props) {
  const router = useRouter();
  const card = deck[0];
  const track = card?.track;
  const nextTrack = deck[1]?.track;
  const { player, status } = usePlayback();
  const [listening, setListening] = useState(false);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const revealed = !!track && track.id === revealedId;
  const [heart, setHeart] = useState('');
  const [pass, setPass] = useState('');
  const [heard, setHeard] = useState(1);
  const [side, setSide] = useState(0);
  const shownAt = useRef(0);
  const cardRef = useRef<ListenCardHandle>(null);
  const [lock] = useState(createActionLock);
  const { record: sound } = useSound(track);
  const coverColors = useCoverColors(track?.artworkUrl100 ? [track.artworkUrl100] : []);
  const recipe = useMemo(
    () => track ? recipeFor(track.id, sound?.status === 'measured' ? sound.features : null,
      coverColors[track.artworkUrl100] ?? null) : null,
    [track, sound, coverColors]
  );

  useFocusEffect(useCallback(() => () => { setListening(false); }, []));
  usePreviewWhileFocused(listening ? track?.previewUrl : undefined, listening ? nextTrack?.previewUrl : undefined);

  useEffect(() => {
    shownAt.current = Date.now();
    lock.release();
  }, [track?.id, lock]);

  function takeLock() {
    if (!listening) {
      setListening(true);
      return false;
    }
    return lock.take();
  }

  function onTap() {
    if (!listening) setListening(true);
    else if (status.playing) player.pause();
    else player.play();
  }

  function onSwipe(direction: SwipeDirection) {
    if (!card) { lock.release(); return; }
    if (revealed) {
      setRevealedId(null);
      next();
      lock.release();
      return;
    }
    const heardMs = Math.max(0, status.currentTime * 1000);
    if (direction === 'right') {
      setHeard(status.duration > 0 ? Math.min(1, status.currentTime / (status.duration * 0.8)) : 0);
      setRevealedId(card.track.id);
      const others = Math.max(0, card.heartedBy - 1);
      setHeart(others > 0
        ? `${others} other ${others === 1 ? 'person' : 'people'} here hearted this.`
        : "You're the first to answer this one.");
      void verdict(card, true, heardMs, shownAt.current);
    } else {
      void verdict(card, false, heardMs, shownAt.current);
      setPass(card.heartedBy > 0
        ? `Passed. ${card.heartedBy} other ${card.heartedBy === 1 ? 'person' : 'people'} here hearted that one.`
        : 'Passed.');
      next();
      lock.release();
    }
  }

  function press(direction: SwipeDirection) {
    if (!cardRef.current || !takeLock()) return;
    cardRef.current.fling(direction, true);
  }

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSide(Math.max(0, Math.min(width - 2 * Spacing.lg, height, 340)));
  }

  if (!track || !recipe) {
    return (
      <View style={styles.empty}>
        {deckLoading ? <ActivityIndicator color={Colors.text} /> : (
          <>
            <ThemedText type="subtitle" style={styles.center}>You&apos;ve heard everything people here have hearted.</ThemedText>
            <ThemedText style={[styles.dim, styles.center]}>
              Heart songs on Home and they&apos;ll reach people here too.
            </ThemedText>
            <PressableScale onPress={() => router.navigate('/(tabs)')} style={styles.primary}>
              <ThemedText style={styles.primaryText}>Go to Home</ThemedText>
            </PressableScale>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.deck}>
      <View style={styles.cardArea} onLayout={onLayout}>
        {side > 0 && (
          <View style={{ width: side, height: side }}>
            <ListenCard
              key={track.id}
              ref={cardRef}
              track={track}
              size={{ width: side, height: side }}
              recipe={recipe}
              revealed={revealed}
              restless={null}
              heard={revealed ? heard : 1}
              takeLock={takeLock}
              onSwipe={onSwipe}
              onRevealSettled={lock.release}
              onTap={onTap}
              onSave={() => { if (!revealed) press('right'); }}
              dragWords={{ left: 'PASS', right: 'HEART', down: 'PASS' }}
            />
            {!listening && (
              <View pointerEvents="none" style={styles.tap}>
                <Ionicons name="play" size={32} color={Colors.accentText} />
                <ThemedText style={styles.tapText}>Tap to hear</ThemedText>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={styles.words}>
        {revealed ? (
          <>
            <ThemedText type="subtitle" numberOfLines={1} style={styles.center}>{track.trackName}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.dim, styles.center]}>{track.artistName}</ThemedText>
            <ThemedText style={[styles.note, styles.center]}>{heart}</ThemedText>
          </>
        ) : (
          <>
            <ThemedText type="subtitle">Just listen.</ThemedText>
            {!!pass && <ThemedText style={[styles.note, styles.center]}>{pass}</ThemedText>}
          </>
        )}
      </View>
      <View style={styles.buttons}>
        {revealed ? (
          <Button label="Next" a11y="Next song" icon="arrow-forward" primary disabled={false} onPress={() => press('right')} />
        ) : (
          <>
            <Button label="Pass" a11y="Pass on this song" icon="close" disabled={false} onPress={() => press('left')} />
            <Button label="Heart" a11y="Heart this song" icon="heart" primary disabled={false} onPress={() => press('right')} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.md },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  tapText: { fontFamily: Fonts.sansSemiBold, color: Colors.accentText },
  words: { height: 104, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  center: { textAlign: 'center' },
  dim: { color: Colors.textSecondary },
  note: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: Spacing.xxl },
  empty: { flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  primary: { ...Ui.outlineButton, backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryText: { ...Ui.label, color: Colors.accentText },
});
