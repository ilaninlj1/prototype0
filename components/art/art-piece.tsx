import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { ART, collageRects, type ArtCanvas, type Mark } from '@/lib/collage';

const pct = (v: number, of: number) => `${(v / of) * 100}%` as const;

/** One song's tile: its cover, sharp if you revealed it, blurred and dim if you skipped it. */
function Tile({ mark, rect }: { mark: Mark; rect: { x: number; y: number; w: number; h: number } }) {
  const ghost = mark.kind === 'ghost';
  return (
    <View style={[styles.tile, { left: pct(rect.x, ART.width), top: pct(rect.y, ART.height), width: pct(rect.w, ART.width), height: pct(rect.h, ART.height) }]}>
      <Image
        source={{ uri: artworkUrl(mark.artwork, ghost ? 100 : 300) }}
        style={[styles.cover, ghost && styles.ghost]}
        blurRadius={ghost ? 10 : 0}
        contentFit="cover"
        transition={200}
      />
      {mark.saved && <View style={styles.dot} />}
    </View>
  );
}

/**
 * The collage: every swiped song is a tile of its real cover. Each new song
 * splits the biggest tile (lib/collage.ts), so one swipe already fills it.
 * The newest tile fades in.
 */
export function ArtPiece({ canvas, style }: { canvas: ArtCanvas; style?: StyleProp<ViewStyle> }) {
  const rects = collageRects(canvas.marks.length);
  const last = canvas.marks.length - 1;
  return (
    <View style={[styles.piece, style]}>
      {canvas.marks.map((m, i) =>
        i === last ? (
          <Animated.View key={m.trackId} entering={FadeIn.duration(500)} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Tile mark={m} rect={rects[i]} />
          </Animated.View>
        ) : (
          <Tile key={m.trackId} mark={m} rect={rects[i]} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { aspectRatio: ART.width / ART.height, overflow: 'hidden' },
  tile: { position: 'absolute', padding: 1 },
  cover: { flex: 1, borderRadius: 3 },
  ghost: { opacity: 0.45 },
  dot: { position: 'absolute', right: 4, top: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.signal },
});
