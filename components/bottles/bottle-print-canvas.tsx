import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { stillPaths, strokeFor } from '@/components/print/print-still-canvas';
import { bottleRings, type BottleRing } from '@/lib/bottle-print';
import type { Hop } from '@/lib/bottle-rows';
import { recipeFor } from '@/lib/print-recipe';
import { soundFor } from '@/lib/sound-index';

/** The song's still print in the middle (70% of the box), so the keepers' rings fit around it. */
const CORE = 0.7;
const DRAW_IN_MS = 700;

export type BottlePrintProps = { trackId: number; hops: Hop[]; size: number; drawLastRing?: boolean };

function BreathingRing({ ring, size, clock, end }: { ring: BottleRing; size: number; clock: SharedValue<number>; end?: SharedValue<number> }) {
  const c = size / 2;
  const path = useMemo(() => Skia.PathBuilder.Make().addCircle(c, c, ring.radius * size).detach(), [c, ring.radius, size]);
  const transform = useDerivedValue(() => [{ scale: 1 + ring.wobble * Math.sin((2 * Math.PI * clock.get()) / ring.beat) }]);
  const trim = useDerivedValue(() => end?.get() ?? 1);
  return (
    <Group transform={transform} origin={{ x: c, y: c }}>
      <Path path={path} color={ring.color} style="stroke" strokeWidth={Math.max(0.8, ring.weight * size * 0.03)} strokeCap="round" end={trim} opacity={0.9} />
    </Group>
  );
}

/** A bottle's print: the song, ringed by the songs its keepers love. Load it through bottle-print.tsx. */
export default function BottlePrintCanvas({ trackId, hops, size, drawLastRing = false }: BottlePrintProps) {
  const reduceMotion = useReducedMotion();
  const recipe = useMemo(() => recipeFor(trackId, soundFor(trackId), null), [trackId]);
  const core = useMemo(() => stillPaths(recipe, size * CORE, 'mini'), [recipe, size]);
  const rings = useMemo(() => bottleRings(hops), [hops]);
  const clock = useSharedValue(0);
  const drawn = useSharedValue(drawLastRing && !reduceMotion ? 0 : 1);

  useFrameCallback((f) => {
    if (!reduceMotion) clock.set(f.timeSinceFirstFrame / 1000);
  });
  useEffect(() => {
    if (drawLastRing && !reduceMotion) drawn.set(withTiming(1, { duration: DRAW_IN_MS, easing: Easing.out(Easing.cubic) }));
  }, [drawLastRing, reduceMotion, drawn]);

  const offset = (size * (1 - CORE)) / 2;
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Rect x={0} y={0} width={size} height={size} color={core.ground} />
      <Group transform={[{ translateX: offset }, { translateY: offset }]}>
        {core.rings.map(({ p, color }, i) => (
          <Path key={i} path={p} color={color} style="stroke" strokeWidth={strokeFor(size * CORE, 'mini')} strokeCap="round" opacity={0.85} />
        ))}
      </Group>
      {rings.map((ring, i) => (
        <BreathingRing key={i} ring={ring} size={size} clock={clock} end={i === rings.length - 1 && drawLastRing ? drawn : undefined} />
      ))}
    </Canvas>
  );
}
