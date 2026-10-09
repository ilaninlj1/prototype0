import { Pressable, type GestureResponderEvent } from 'react-native';

import { PIECE, piecePositions, type Piece, type PieceMark } from '@/lib/piece';
import { lazySkia } from './lazy-skia';
import type { PieceCanvasProps } from './piece-canvas';

const PieceCanvas = lazySkia<PieceCanvasProps>(() => import('./piece-canvas'));

/** Your piece: the line of prints. With `onPressMark`, tapping near a print picks it. */
export function PieceView({ piece, width, onPressMark }: { piece: Piece; width: number; onPressMark?: (mark: PieceMark) => void }) {
  const height = (width * PIECE.height) / PIECE.width;
  if (!onPressMark) return <PieceCanvas piece={piece} width={width} />;

  function pick(e: GestureResponderEvent) {
    const scale = width / PIECE.width;
    const x = e.nativeEvent.locationX / scale;
    const y = e.nativeEvent.locationY / scale;
    const placed = piecePositions(piece.marks);
    let best = -1;
    let bestD = Infinity;
    placed.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD && d <= Math.max(p.size, 40)) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) onPressMark!(piece.marks[best]);
  }

  return (
    <Pressable onPress={pick} style={{ width, height }} accessibilityLabel={`Your piece, ${piece.marks.length} prints`}>
      <PieceCanvas piece={piece} width={width} />
    </Pressable>
  );
}
