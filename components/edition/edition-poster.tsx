import { drawAsImage, Group, matchFont, Path, Rect, Text } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { stillPaths, strokeFor } from '@/components/print/print-still-canvas';
import { Colors } from '@/constants/theme';
import type { Edition } from '@/lib/edition';

const W = 1080;
const H = 1350;
const M = 72;

/**
 * The Edition's share picture, drawn by Skia: its five prints in a row and the
 * songs under them. A still, never video with the preview audio (Apple's terms).
 * Import only after Skia can draw (components/print/load-skia.ts).
 */
export async function renderEditionPoster(edition: Edition): Promise<string | null> {
  const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
  const big = matchFont({ fontFamily: mono, fontSize: 34 });
  const small = matchFont({ fontFamily: mono, fontSize: 22 });
  const n = edition.songs.length;
  const size = (W - M * 2 - (n - 1) * 24) / n;
  const top = 420;
  const date = new Date(edition.createdAt).toDateString().toUpperCase();
  const image = await drawAsImage(
    <Group>
      <Rect x={0} y={0} width={W} height={H} color="#0d1426" />
      <Text x={M} y={200} text="BLINDSPOT" font={big} color={Colors.text} />
      <Text x={M} y={250} text={`EDITION No. ${edition.number} · ${date}`} font={small} color={Colors.textSecondary} />
      {edition.songs.map((s, i) => {
        const { rings } = stillPaths(s.recipe, size, 'mini', s.heard);
        return (
          <Group key={s.trackId} transform={[{ translateX: M + i * (size + 24) }, { translateY: top }]}>
            {rings.map((r, k) => (
              <Path key={k} path={r.p} color={r.color} style="stroke" strokeWidth={strokeFor(size, 'mini')} strokeCap="round" />
            ))}
          </Group>
        );
      })}
      {edition.songs.map((s, i) => (
        <Text key={s.trackId} x={M} y={top + size + 110 + i * 44} text={`${i + 1}  ${s.title} — ${s.artist}`.slice(0, 60)} font={small} color={Colors.text} />
      ))}
      <Text x={M} y={H - 90} text={`${n} FOUND BLIND`} font={small} color={Colors.textTertiary} />
    </Group>,
    { width: W, height: H }
  );
  return image ? image.encodeToBase64() : null;
}
