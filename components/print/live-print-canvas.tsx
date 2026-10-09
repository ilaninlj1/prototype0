import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { particleAt, particleHash, ringOf, type PrintRecipe } from '@/lib/print-recipe';

const TRAIL = 0.1; // seconds of motion each stroke shows

export type LivePrintProps = {
  recipe: PrintRecipe;
  size: number;
  clock: SharedValue<number>;
  /** 0 a loose cloud, 1 settled on the rings. */
  gather: SharedValue<number>;
  /** 0–1: blown outward and fading (a left drag). */
  scatter?: SharedValue<number>;
  /** 0–1: falling out of the card (a down drag). */
  fall?: SharedValue<number>;
};

/** The print in motion, on the UI thread. `clock` is the song's position in seconds; `gather` 0 flows, 1 settles onto the rings. Load it through live-print.tsx. */
export default function LiveCanvas({ recipe, size, clock, gather, scatter, fall }: LivePrintProps) {
  // Always three paths, so the hook count never changes when the recipe does.
  const ring0 = useDerivedValue(() => draw(recipe, 0, size, clock.get(), gather.get(), scatter?.get() ?? 0, fall?.get() ?? 0));
  const ring1 = useDerivedValue(() => draw(recipe, 1, size, clock.get(), gather.get(), scatter?.get() ?? 0, fall?.get() ?? 0));
  const ring2 = useDerivedValue(() => draw(recipe, 2, size, clock.get(), gather.get(), scatter?.get() ?? 0, fall?.get() ?? 0));
  const base = 0.85 * recipe.brightness + 0.15;
  const opacity = useDerivedValue(() => base * (1 - 0.75 * (scatter?.get() ?? 0)));
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
            opacity={opacity}
          />
        ) : null
      )}
    </Canvas>
  );
}

/** One particle where it is now, then pushed outward (scatter) or dropped (fall) by the drag. */
function place(r: PrintRecipe, i: number, t: number, gather: number, scatter: number, fall: number): [number, number] {
  'worklet';
  const [x, y] = particleAt(r, i, t, gather);
  const h = particleHash(i, r.seed);
  const k = 1 + scatter * (1.2 + 1.6 * h);
  return [0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k + fall * fall * (0.5 + 0.9 * h)];
}

function draw(r: PrintRecipe, ring: number, size: number, t: number, gather: number, scatter: number, fall: number) {
  'worklet';
  const p = Skia.PathBuilder.Make();
  if (!r.rings[ring]) return p.detach();
  const dot = Math.max(1, size / 170);
  for (let i = 0; i < r.particles; i++) {
    if (ringOf(r, i) !== ring) continue;
    const [x, y] = place(r, i, t, gather, scatter, fall);
    if (r.texture === 'grain') {
      p.addCircle(x * size, y * size, dot);
    } else {
      const [px, py] = place(r, i, t - (r.stroke === 'dash' ? TRAIL * 0.5 : TRAIL), gather, scatter, fall);
      p.moveTo(px * size, py * size);
      p.lineTo(x * size, y * size);
    }
  }
  return p.detach();
}
