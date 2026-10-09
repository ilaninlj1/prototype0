import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { particleAt, ringOf, type PrintRecipe } from '@/lib/print-recipe';

const TRAIL = 0.1; // seconds of motion each stroke shows

export type LivePrintProps = { recipe: PrintRecipe; size: number; clock: SharedValue<number>; gather: SharedValue<number> };

/** The print in motion, on the UI thread. `clock` is the song's position in seconds; `gather` 0 flows, 1 settles onto the rings. Load it through live-print.tsx. */
export default function LiveCanvas({ recipe, size, clock, gather }: LivePrintProps) {
  // Always three paths, so the hook count never changes when the recipe does.
  const ring0 = useDerivedValue(() => draw(recipe, 0, size, clock.value, gather.value));
  const ring1 = useDerivedValue(() => draw(recipe, 1, size, clock.value, gather.value));
  const ring2 = useDerivedValue(() => draw(recipe, 2, size, clock.value, gather.value));
  const grain = recipe.texture === 'grain';
  const stroke = Math.max(0.8, size / 200);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      {[ring0, ring1, ring2].map((p, i) =>
        recipe.rings[i] ? (
          <Path
            key={i}
            path={p}
            color={recipe.rings[i].color}
            style={grain ? 'fill' : 'stroke'}
            strokeWidth={stroke}
            strokeCap="round"
            opacity={0.85 * recipe.brightness + 0.15}
          />
        ) : null
      )}
    </Canvas>
  );
}

function draw(r: PrintRecipe, ring: number, size: number, t: number, gather: number) {
  'worklet';
  const p = Skia.PathBuilder.Make();
  if (!r.rings[ring]) return p.detach();
  const dot = Math.max(1, size / 170);
  for (let i = 0; i < r.particles; i++) {
    if (ringOf(r, i) !== ring) continue;
    const [x, y] = particleAt(r, i, t, gather);
    if (r.texture === 'grain') {
      p.addCircle(x * size, y * size, dot);
    } else {
      const [px, py] = particleAt(r, i, t - (r.stroke === 'dash' ? TRAIL * 0.5 : TRAIL), gather);
      p.moveTo(px * size, py * size);
      p.lineTo(x * size, y * size);
    }
  }
  return p.detach();
}
