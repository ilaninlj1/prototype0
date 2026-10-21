import { BlurMask, Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { DarkColors } from '@/constants/theme';
import { glowRadius, type Light } from '@/lib/dark-map';
import type { MapPoint } from '@/lib/sound-map';

import { MAP_DIM, MAP_PAD } from './map-geometry';

export type DarkMapCanvasProps = {
  width: number;
  height: number;
  dots: MapPoint[];
  lights: Light[];
  zoom: SharedValue<number>;
  panX: SharedValue<number>;
  panY: SharedValue<number>;
  /** 0 → 1 as the lights that are new since the last look come in. */
  bloom: SharedValue<number>;
};

/** The Dark Map: a dim dot for every song, a soft glow and a cream dot for each heard one, red for saves. Load it through dark-map.tsx. */
export default function DarkMapCanvas({ width, height, dots, lights, zoom, panX, panY, bloom }: DarkMapCanvasProps) {
  const layers = useMemo(() => {
    const sx = (p: MapPoint) => MAP_PAD + p.x * (width - 2 * MAP_PAD);
    const sy = (p: MapPoint) => MAP_PAD + p.y * (height - 2 * MAP_PAD);
    const circles = (list: MapPoint[], radius: (i: number) => number) => {
      const b = Skia.PathBuilder.Make();
      list.forEach((p, i) => b.addCircle(sx(p), sy(p), radius(i)));
      return b.detach();
    };
    const old = lights.filter((l) => !l.fresh);
    const fresh = lights.filter((l) => l.fresh);
    const glow = (list: Light[]) => circles(list, (i) => glowRadius(list[i].b) * (width - 2 * MAP_PAD));
    return {
      dim: circles(dots, () => 1.2),
      glowOld: glow(old),
      glowNew: glow(fresh),
      litOld: circles(old.filter((l) => !l.saved), () => 1.8),
      savedOld: circles(old.filter((l) => l.saved), () => 2.5),
      litNew: circles(fresh.filter((l) => !l.saved), () => 1.8),
      savedNew: circles(fresh.filter((l) => l.saved), () => 2.5),
      freshAt: fresh.map((l) => [sx(l), sy(l)]),
    };
  }, [dots, lights, width, height]);

  const transform = useDerivedValue(() => [
    { translateX: width / 2 + panX.get() },
    { translateY: height / 2 + panY.get() },
    { scale: zoom.get() },
    { translateX: -width / 2 },
    { translateY: -height / 2 },
  ]);
  const freshAt = layers.freshAt;
  // A ring opens around each new light as it blooms.
  const rings = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    const r = 3 + 14 * bloom.get();
    for (const [x, y] of freshAt) b.addCircle(x, y, r);
    return b.detach();
  });
  const ringOpacity = useDerivedValue(() => 0.8 * (1 - bloom.get()));
  const newGlowOpacity = useDerivedValue(() => 0.16 * bloom.get());
  const newOpacity = useDerivedValue(() => bloom.get());

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group transform={transform}>
        <Path path={layers.glowOld} color={DarkColors.text} opacity={0.16}>
          <BlurMask blur={6} style="normal" />
        </Path>
        <Path path={layers.glowNew} color={DarkColors.text} opacity={newGlowOpacity}>
          <BlurMask blur={6} style="normal" />
        </Path>
        <Path path={layers.dim} color={MAP_DIM} opacity={0.6} />
        <Path path={layers.litOld} color={DarkColors.text} />
        <Path path={layers.savedOld} color={DarkColors.signal} />
        <Group opacity={newOpacity}>
          <Path path={layers.litNew} color={DarkColors.text} />
          <Path path={layers.savedNew} color={DarkColors.signal} />
        </Group>
        <Path path={rings} color={DarkColors.text} style="stroke" strokeWidth={1} opacity={ringOpacity} />
      </Group>
    </Canvas>
  );
}
