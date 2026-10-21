import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PieceView } from '@/components/print/piece-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { PIECE, piecePositions, type Piece, type PieceMark } from '@/lib/piece';
import { recipeFor } from '@/lib/print-recipe';

export type StripRect = { x: number; y: number; width: number };

/**
 * Where the next mark will sit on screen, once it's added: the layout spreads
 * the marks across the width, so the slot is worked out with the newcomer in place.
 */
export function slotCenter(piece: Piece, rect: StripRect): { x: number; y: number; size: number } {
  const last = piece.marks.at(-1);
  const placeholder: PieceMark = {
    trackId: -1,
    kind: 'reveal',
    saved: false,
    branch: (last?.branch ?? 0) + (piece.pendingFork ? 1 : 0),
    recipe: recipeFor(0, null, null),
  };
  const marks = piece.marks.length >= PIECE.slots ? [placeholder] : [...piece.marks, placeholder];
  const p = piecePositions(marks).at(-1)!;
  const scale = rect.width / PIECE.width;
  return { x: rect.x + p.x * scale, y: rect.y + p.y * scale, size: p.size * scale };
}

/** Your piece under the card: one line of prints that grows with every swipe. Same height empty or full, so nothing shifts. */
export function PieceStrip({ piece, onPress, onLayoutStrip }: { piece: Piece; onPress: () => void; onLayoutStrip: (rect: StripRect) => void }) {
  const [width, setWidth] = useState(0);
  const ref = useRef<View>(null);
  const n = piece.marks.length;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Your piece, ${n} of ${PIECE.slots} prints`}>
      <View
        ref={ref}
        style={[styles.piece, width > 0 && { height: (width * PIECE.height) / PIECE.width }]}
        onLayout={(e) => {
          setWidth(e.nativeEvent.layout.width);
          ref.current?.measureInWindow((x, y, w) => onLayoutStrip({ x, y, width: w }));
        }}>
        {width > 0 && <PieceView piece={piece} width={width} />}
      </View>
      <View style={styles.caption}>
        <ThemedText style={styles.label}>{n > 0 ? `${n} of ${PIECE.slots} prints · Tap to see your piece` : 'Your first swipe starts your piece'}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  piece: { alignSelf: 'stretch' },
  caption: { paddingTop: Spacing.xs },
  label: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
});
