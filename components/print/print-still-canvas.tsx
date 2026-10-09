import { Canvas, Path, Rect, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { settledPrint, type PrintRecipe } from '@/lib/print-recipe';

/** The settled print as one Skia path per ring, in a size × size box. Shared by PrintStill, PieceView and the poster export. */
export function stillPaths(recipe: PrintRecipe, size: number, detail: 'full' | 'mini') {
  const still = settledPrint(recipe, detail);
  return {
    ground: still.ground,
    rings: still.rings.map((ring) => {
      const b = Skia.PathBuilder.Make();
      for (const line of ring.lines) {
        b.moveTo(line[0] * size, line[1] * size);
        for (let k = 2; k < line.length; k += 2) b.lineTo(line[k] * size, line[k + 1] * size);
      }
      return { p: b.detach(), color: ring.color };
    }),
  };
}

export const strokeFor = (size: number, detail: 'full' | 'mini') => Math.max(0.6, size / (detail === 'mini' ? 90 : 220));

export type PrintStillProps = { recipe: PrintRecipe; size: number; detail?: 'full' | 'mini'; ground?: boolean };

/** A song's settled print: the same picture every time for the same recipe. Load it through print-still.tsx. */
export default function StillCanvas({ recipe, size, detail = 'full', ground = true }: PrintStillProps) {
  const { ground: groundColor, rings } = useMemo(() => stillPaths(recipe, size, detail), [recipe, size, detail]);
  const width = strokeFor(size, detail);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      {ground && <Rect x={0} y={0} width={size} height={size} color={groundColor} />}
      {rings.map(({ p, color }, i) => (
        <Path key={i} path={p} color={color} style="stroke" strokeWidth={width} strokeCap="round" opacity={recipe.texture === 'grain' ? 0.7 : 0.9} />
      ))}
    </Canvas>
  );
}
