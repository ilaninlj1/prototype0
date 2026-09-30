import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { ArtPiece } from '@/components/art/art-piece';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useArt } from '@/hooks/use-art';
import { ART, type ArtCanvas } from '@/lib/collage';

/** Your piece: the one in progress, or a finished one (?piece=N) to save or share. */
export default function ArtScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ piece?: string }>();
  const { canvas, pieces } = useArt();
  const [pieceNumber, setPieceNumber] = useState(params.piece ? Number(params.piece) : null);
  const [note, setNote] = useState('');
  const posterRef = useRef<View>(null);

  const finished = pieces.find((p) => p.number === pieceNumber) ?? null;
  const shown: ArtCanvas = finished ?? canvas;
  const revealed = shown.marks.filter((m) => m.kind === 'bold').length;

  async function capture() {
    return captureRef(posterRef, { format: 'png', quality: 1, result: 'tmpfile' });
  }

  async function share() {
    try {
      const uri = await capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Blindspot piece' });
    } catch {
      setNote('Couldn’t open sharing. Try again.');
    }
  }

  async function save() {
    try {
      const uri = await capture();
      const { granted } = await requestPermissionsAsync(true);
      if (!granted) return setNote('Photos access is off. Use Share → Save Image instead.');
      await Asset.create(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNote('Saved to Photos.');
    } catch {
      setNote('Couldn’t save here. Use Share → Save Image instead.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ThemedText type="eyebrow">Your collage · No. {shown.number}</ThemedText>
      <ThemedText type="title">{finished ? 'It’s done.' : `${shown.marks.length} of ${ART.slots}`}</ThemedText>
      <ThemedText style={styles.dim}>
        {finished
          ? 'Fifty songs, one piece nobody else has. A new canvas has already started on Home.'
          : `${ART.slots - shown.marks.length} more swipes and this one's finished. Then you can save it or share it.`}
      </ThemedText>

      <View ref={posterRef} collapsable={false} style={styles.poster}>
        <ArtPiece canvas={shown} style={styles.piece} />
        <View style={styles.caption}>
          <ThemedText style={styles.captionText}>
            BLINDSPOT · NO. {shown.number} · {shown.marks.length} SONGS · {revealed} REVEALED · {shown.marks.length - revealed} SKIPPED
          </ThemedText>
          {finished?.finishedAt && <ThemedText style={styles.captionText}>{new Date(finished.finishedAt).toDateString().toUpperCase()}</ThemedText>}
        </View>
      </View>

      {finished && (
        <View style={styles.actions}>
          <PressableScale onPress={share} style={styles.primary}>
            <Ionicons name="share-outline" size={18} color={Colors.accentText} />
            <ThemedText style={styles.primaryText}>Share</ThemedText>
          </PressableScale>
          <PressableScale onPress={save} style={styles.secondary}>
            <Ionicons name="download-outline" size={18} color={Colors.text} />
            <ThemedText style={styles.secondaryText}>Save to Photos</ThemedText>
          </PressableScale>
        </View>
      )}
      {!!note && <ThemedText style={styles.note}>{note}</ThemedText>}

      <ThemedText type="eyebrow" style={styles.section}>
        How to read it
      </ThemedText>
      <ThemedText style={styles.dim}>
        Every tile is one song’s cover. Sharp ones you revealed, blurred ones you skipped, and a red dot means you saved it. Each new song
        splits the biggest tile, so your first songs stay the biggest.
      </ThemedText>

      {pieces.length > 0 && (
        <>
          <ThemedText type="eyebrow" style={styles.section}>
            Finished pieces
          </ThemedText>
          {[...pieces].reverse().map((p) => (
            <Pressable key={p.number} onPress={() => setPieceNumber(p.number)} style={styles.past}>
              <ArtPiece canvas={p} style={styles.pastPiece} />
              <ThemedText style={styles.captionText}>NO. {p.number}</ThemedText>
            </Pressable>
          ))}
          {finished && (
            <Pressable onPress={() => setPieceNumber(null)} style={styles.past}>
              <ThemedText style={styles.link}>See the one in progress</ThemedText>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  dim: { color: Colors.textSecondary },
  poster: { backgroundColor: Colors.background, paddingVertical: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
  piece: { borderRadius: Radius.lg, width: '100%' },
  caption: { gap: 2 },
  captionText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textTertiary },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  primary: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  primaryText: { fontFamily: 'Figtree_700Bold', color: Colors.accentText },
  secondary: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingVertical: Spacing.md },
  secondaryText: { fontFamily: 'Figtree_700Bold', color: Colors.text },
  note: { color: Colors.textSecondary, marginTop: Spacing.sm },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  past: { gap: 4, marginBottom: Spacing.md },
  pastPiece: { borderRadius: Radius.md, width: '100%' },
  link: { textDecorationLine: 'underline', color: Colors.text },
});
