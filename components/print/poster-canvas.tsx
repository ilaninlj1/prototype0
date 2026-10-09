import { drawAsImage, Group, matchFont, Rect, Text } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { PIECE, type Piece } from '@/lib/piece';
import { PieceDrawing } from './piece-canvas';

const W = 1080;
const H = 1350;
const MARGIN = 72;

/**
 * The share picture, drawn straight by Skia (react-native-view-shot can't
 * reliably capture a Skia canvas on Android): the piece and two mono lines,
 * no buttons or navigation. Returns a base64 PNG, or null if drawing failed.
 * Import it only after Skia can draw (see load-skia.ts).
 */
export async function renderPoster(piece: Piece): Promise<string | null> {
  const font = matchFont({ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 26 });
  const small = matchFont({ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 20 });
  const width = W - MARGIN * 2;
  const pieceHeight = (width * PIECE.height) / PIECE.width;
  const top = (H - pieceHeight) / 2;
  const revealed = piece.marks.filter((m) => m.kind === 'reveal').length;
  const date = new Date(piece.finishedAt ?? Date.now()).toDateString().toUpperCase();
  const image = await drawAsImage(
    <Group>
      <Rect x={0} y={0} width={W} height={H} color={Colors.background} />
      <Text x={MARGIN} y={top - 64} text={`BLINDSPOT · PIECE No. ${piece.number}`} font={font} color={Colors.text} />
      <Group transform={[{ translateX: MARGIN }, { translateY: top }]}>
        <PieceDrawing piece={piece} width={width} />
      </Group>
      <Text x={MARGIN} y={top + pieceHeight + 72} text={`${revealed} FOUND BLIND · ${piece.marks.length - revealed} SKIPPED`} font={small} color={Colors.textSecondary} />
      <Text x={MARGIN} y={top + pieceHeight + 108} text={date} font={small} color={Colors.textTertiary} />
    </Group>,
    { width: W, height: H }
  );
  return image ? image.encodeToBase64() : null;
}
