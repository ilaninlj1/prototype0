import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { cardBounds, densityOf, newCard, stepMarbles, STRIDE, trackCard } from '@/lib/marbles';
import { ringOf, type PrintRecipe } from '@/lib/print-recipe';

const HIT = 0.6; // print widths a second: a marble hitting an edge this hard ticks the phone
const HIT_GAP = 80; // ms between ticks

export type MarblePrintProps = {
  recipe: PrintRecipe;
  /** The print square's side, px, and where it sits in the card. */
  side: number;
  card: { width: number; height: number };
  left: number;
  top: number;
  clock: SharedValue<number>;
  playing: SharedValue<boolean>;
  /** 0 a loose cloud, 1 settled on the rings. */
  gather: SharedValue<number>;
  /** 0–1: blown outward and fading (a left drag). */
  scatter: SharedValue<number>;
  /** 0–1: falling out of the card (a down drag). */
  fall: SharedValue<number>;
  /** The card's drag offset, px. */
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  /** Revealed: nothing comes loose and loose ones head home. */
  locked: SharedValue<boolean>;
  /** Flying off: no ticks. */
  quiet: SharedValue<boolean>;
  /** Goes up by one on each save, for the pop. */
  pop: SharedValue<number>;
  /** A marble hit an edge (print widths a second). */
  onHit: (strength: number) => void;
};

/** The print as marbles, drawn across the whole card so they can reach its edges. Load it through marble-print.tsx. */
export default function MarbleCanvas({ recipe, side, card, left, top, clock, playing, gather, scatter, fall, tx, ty, locked, quiet, pop, onHit }: MarblePrintProps) {
  const state = useSharedValue<number[]>([]);
  const motion = useSharedValue<number[]>(newCard());
  const popped = useSharedValue(0); // the card's pop count starts at 0 too
  const lastHit = useSharedValue(0);
  const density = densityOf(recipe);
  const dot = Math.max(1, side / 170);
  const bounds = cardBounds(card.width, card.height, side, left, top, dot);

  useFrameCallback((f) => {
    if (side <= 0) return;
    const dt = (f.timeSincePreviousFrame ?? 16) / 1000;
    const c = motion.get();
    trackCard(c, tx.get() / side, ty.get() / side, dt);
    const kick = pop.get() !== popped.get() ? 1 : 0;
    if (kick) popped.set(pop.get());
    const env = {
      t: clock.get(),
      dt,
      playing: playing.get(),
      gather: gather.get(),
      scatter: scatter.get(),
      fall: fall.get(),
      card: c,
      density,
      bounds,
      locked: locked.get(),
      kick,
    };
    const { hit, moved } = stepMarbles(state.get(), recipe, env);
    // The state changes in place; only a frame that moved something is drawn again.
    if (moved) state.modify(undefined, true);
    if (hit > HIT && !quiet.get() && !env.locked && f.timestamp - lastHit.get() > HIT_GAP) {
      lastHit.set(f.timestamp);
      runOnJS(onHit)(hit);
    }
  });

  // Always three paths, so the hook count never changes when the recipe does.
  const ring0 = useDerivedValue(() => drawRing(state.get(), recipe, 0, side, left, top, dot));
  const ring1 = useDerivedValue(() => drawRing(state.get(), recipe, 1, side, left, top, dot));
  const ring2 = useDerivedValue(() => drawRing(state.get(), recipe, 2, side, left, top, dot));
  const base = 0.85 * recipe.brightness + 0.15;
  const opacity = useDerivedValue(() => base * (1 - 0.75 * scatter.get()));
  const grain = recipe.texture === 'grain';
  const stroke = Math.max(0.8, side / 200);
  return (
    <Canvas style={{ width: card.width, height: card.height }} pointerEvents="none">
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

/** One ring's particles where the physics left them: dots, or strokes from each one's trail start. */
function drawRing(s: number[], r: PrintRecipe, ring: number, side: number, left: number, top: number, dot: number) {
  'worklet';
  const p = Skia.PathBuilder.Make();
  if (!r.rings[ring] || s.length < r.particles * STRIDE) return p.detach();
  for (let i = 0; i < r.particles; i++) {
    if (ringOf(r, i) !== ring) continue;
    const o = i * STRIDE;
    const x = left + s[o + 6] * side;
    const y = top + s[o + 7] * side;
    if (r.texture === 'grain') {
      p.addCircle(x, y, dot);
    } else {
      p.moveTo(left + s[o + 8] * side, top + s[o + 9] * side);
      p.lineTo(x, y);
    }
  }
  return p.detach();
}
