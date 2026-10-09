import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { loadSkia } from '@/components/print/load-skia';
import { PieceView } from '@/components/print/piece-view';
import { PrintStill } from '@/components/print/print-still';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { useArt } from '@/hooks/use-art';
import { useEditions } from '@/hooks/use-editions';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl } from '@/lib/discovery';
import { PIECE, type Piece, type PieceMark } from '@/lib/piece';

/** Your piece: the one in progress, or a finished one (?piece=N) to save or share. Tap a print to see its song. */
export default function ArtScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ piece?: string }>();
  const { piece, finished: pieces } = useArt();
  const { editions } = useEditions();
  const { playPreview } = usePlayback();
  const [pieceNumber, setPieceNumber] = useState(params.piece ? Number(params.piece) : null);
  const [inspect, setInspect] = useState<PieceMark | null>(null);
  const [note, setNote] = useState('');

  const finished = pieces.find((p) => p.number === pieceNumber) ?? null;
  const shown: Piece = finished ?? piece;
  const revealed = shown.marks.filter((m) => m.kind === 'reveal');
  const width = Math.min(screenWidth, 640) - Spacing.lg * 2;

  async function capture(): Promise<string> {
    await loadSkia();
    const { renderPoster } = await import('@/components/print/poster-canvas');
    const base64 = await renderPoster(shown);
    if (!base64) throw new Error('nothing drawn');
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, `blindspot-piece-${shown.number}.png`);
    file.write(base64, { encoding: 'base64' });
    return file.uri;
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
      // Loaded here, not at the top: the module doesn't exist on web, and a top-level import crashed the
      // local web dev server, where every route loads at startup. (The production export was unaffected.)
      const { Asset, requestPermissionsAsync } = await import('expo-media-library');
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
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ThemedText type="eyebrow">Your piece · No. {shown.number}</ThemedText>
      <ThemedText type="title">{finished ? 'It’s done.' : `${shown.marks.length} of ${PIECE.slots}`}</ThemedText>
      <ThemedText style={styles.dim}>
        {finished
          ? 'Fifty songs, one piece nobody else has. A new one has already started on Home.'
          : `${PIECE.slots - shown.marks.length} more swipes and this one's finished. Then you can save it or share it.`}
      </ThemedText>

      <View style={styles.poster}>
        <PieceView piece={shown} width={width} onPressMark={setInspect} />
        <ThemedText style={styles.captionText}>
          BLINDSPOT · NO. {shown.number} · {revealed.length} FOUND BLIND · {shown.marks.length - revealed.length} SKIPPED
        </ThemedText>
      </View>

      {inspect && <Inspect mark={inspect} onPlay={(url) => playPreview(url)} onClose={() => setInspect(null)} />}

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
        Every print is one song’s sound: the rings sit where its key falls, the color follows major or minor, the lines get busier the more
        energy it has. Grey rings are songs you skipped, still blind. A red ring means you saved it. The line forks each time you jumped
        to a new genre.
      </ThemedText>

      {revealed.length > 0 && (
        <>
          <ThemedText type="eyebrow" style={styles.section}>
            In this piece
          </ThemedText>
          {revealed.map((m) => (
            <Pressable key={m.trackId} onPress={() => setInspect(m)} style={styles.row} accessibilityRole="button">
              <ThemedText numberOfLines={1} style={styles.rowText}>
                {m.song ? `${m.song.title} · ${m.song.artist}` : 'Older print — song details weren’t kept'}
              </ThemedText>
            </Pressable>
          ))}
        </>
      )}

      {editions.length > 0 && (
        <>
          <ThemedText type="eyebrow" style={styles.section}>
            Editions
          </ThemedText>
          {[...editions].reverse().map((e) => (
            <Pressable
              key={e.number}
              onPress={() => router.push({ pathname: '/edition', params: { n: String(e.number) } })}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Play edition ${e.number}`}>
              <ThemedText numberOfLines={1} style={styles.rowText}>
                ▸ No. {e.number} · {e.songs.map((s) => s.artist).join(', ')}
              </ThemedText>
            </Pressable>
          ))}
        </>
      )}

      {pieces.length > 0 && (
        <>
          <ThemedText type="eyebrow" style={styles.section}>
            Finished pieces
          </ThemedText>
          {[...pieces].reverse().map((p) => (
            <Pressable key={p.number} onPress={() => setPieceNumber(p.number)} style={styles.past}>
              <PieceView piece={p} width={width} />
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

/** One print, opened: the song if you revealed it, "still blind" if you skipped it. */
function Inspect({ mark, onPlay, onClose }: { mark: PieceMark; onPlay: (url: string) => void; onClose: () => void }) {
  const song = mark.song;
  return (
    <View style={styles.inspect}>
      <PrintStill recipe={mark.recipe} size={96} />
      <View style={styles.inspectText}>
        {mark.kind === 'skip' ? (
          <ThemedText style={styles.dim}>Skipped — still blind.</ThemedText>
        ) : song ? (
          <>
            <View style={styles.inspectHead}>
              {!!song.artwork && <Image source={{ uri: artworkUrl(song.artwork, 100) }} style={styles.thumb} />}
              <View style={styles.inspectNames}>
                <ThemedText numberOfLines={1}>{song.title}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.dim}>
                  {song.artist}
                </ThemedText>
              </View>
            </View>
            {!!song.previewUrl && (
              <Pressable style={[Ui.outlineButton, styles.play]} onPress={() => onPlay(song.previewUrl!)} accessibilityLabel={`Play ${song.title}`}>
                <Ionicons name="play" size={16} color={Colors.text} />
                <ThemedText style={Ui.label}>Play</ThemedText>
              </Pressable>
            )}
          </>
        ) : (
          <ThemedText style={styles.dim}>Older print — song details weren’t kept.</ThemedText>
        )}
        {!!mark.recipe.label && <ThemedText style={styles.captionText}>{mark.recipe.label}</ThemedText>}
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
        <Ionicons name="close" size={20} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  dim: { color: Colors.textSecondary },
  poster: { paddingVertical: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
  captionText: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textTertiary },
  inspect: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.md,
  },
  inspectText: { flex: 1, gap: Spacing.xs },
  inspectHead: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  inspectNames: { flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: Radius.sm },
  play: { flexDirection: 'row', gap: Spacing.xs, alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  primary: { ...Ui.outlineButton, flex: 1, backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryText: { ...Ui.label, color: Colors.accentText },
  secondary: { ...Ui.outlineButton, flex: 1 },
  secondaryText: Ui.label,
  note: { color: Colors.textSecondary, marginTop: Spacing.sm },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  row: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: Colors.rule },
  rowText: { color: Colors.text },
  past: { gap: 4, marginBottom: Spacing.md },
  link: { textDecorationLine: 'underline', color: Colors.text },
});
