import { Canvas, Circle, DashPathEffect, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { Colors } from '@/constants/theme';
import { PIECE, piecePositions, type Piece } from '@/lib/piece';
import { stillPaths, strokeFor } from './print-still-canvas';

export type PieceCanvasProps = { piece: Piece; width: number };

/** The piece's Skia elements at a given width: the line through the marks, then each mark. Shared by the strip, the art screen and the poster export. */
export function PieceDrawing({ piece, width }: PieceCanvasProps) {
  const scale = width / PIECE.width;
  const placed = useMemo(() => piecePositions(piece.marks), [piece.marks]);
  const line = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    if (placed.length === 0) {
      b.moveTo(24 * scale, 120 * scale);
      b.lineTo((PIECE.width - 24) * scale, 120 * scale);
      return b.detach();
    }
    b.moveTo(placed[0].x * scale, placed[0].y * scale);
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1];
      const c = placed[i];
      const mid = ((a.x + c.x) / 2) * scale;
      b.cubicTo(mid, a.y * scale, mid, c.y * scale, c.x * scale, c.y * scale);
    }
    return b.detach();
  }, [placed, scale]);
  const prints = useMemo(
    () =>
      piece.marks.map((m, i) => (m.kind === 'reveal' ? stillPaths(m.recipe, placed[i].size * scale, 'mini') : null)),
    [piece.marks, placed, scale]
  );

  return (
    <Group>
      <Path path={line} color={Colors.text} opacity={0.25} style="stroke" strokeWidth={1} />
      {placed.length === 0 && (
        // The first slot, waiting.
        <Circle cx={143 * scale} cy={120 * scale} r={42 * scale} color={Colors.textTertiary} style="stroke" strokeWidth={1}>
          <DashPathEffect intervals={[3, 4]} />
        </Circle>
      )}
      {piece.marks.map((m, i) => {
        const p = placed[i];
        const s = p.size * scale;
        const x = p.x * scale;
        const y = p.y * scale;
        const print = prints[i];
        return (
          <Group key={m.trackId}>
            {print ? (
              <Group transform={[{ translateX: x - s / 2 }, { translateY: y - s / 2 }]}>
                {print.rings.map((r, k) => (
                  <Path key={k} path={r.p} color={r.color} style="stroke" strokeWidth={strokeFor(s, 'mini')} strokeCap="round" opacity={0.9} />
                ))}
              </Group>
            ) : (
              <Circle cx={x} cy={y} r={Math.max(2, s * 0.18)} color={Colors.textTertiary} style="stroke" strokeWidth={1} />
            )}
            {m.saved && <Circle cx={x} cy={y} r={s * 0.55} color={Colors.signal} style="stroke" strokeWidth={1.5} />}
          </Group>
        );
      })}
    </Group>
  );
}

/** The piece as its own canvas. Load it through piece-view.tsx. */
export default function PieceCanvas({ piece, width }: PieceCanvasProps) {
  return (
    <Canvas style={{ width, height: (width * PIECE.height) / PIECE.width }} pointerEvents="none">
      <PieceDrawing piece={piece} width={width} />
    </Canvas>
  );
}
