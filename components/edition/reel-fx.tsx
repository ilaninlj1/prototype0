import { Group, RadialGradient, Rect, Turbulence, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { TOTAL, type Wipe } from '@/lib/edition';
import { prog, quintIn, quintOut } from '@/lib/reel-ease';

// The reel's finishing layers, laid over every scene: the wipe at each cut,
// the vignette, film grain and the orange progress line. Skia (lazy-loaded).

export const OR = '#E8461E';
export const BK = '#0A0A0A';
export const WH = '#F4F1EC';
export const CREAM = '#F2EEE8';

type Size = { width: number; height: number };

/** A panel that sweeps across each cut, as in the reel: in from one edge, out the other, quint-eased. */
export function Wipes({ wipes, clock, width, height }: Size & { wipes: Wipe[]; clock: SharedValue<number> }) {
  return (
    <>
      {wipes.map((w, i) => (
        <OneWipe key={i} wipe={w} clock={clock} width={width} height={height} />
      ))}
    </>
  );
}

function OneWipe({ wipe, clock, width, height }: Size & { wipe: Wipe; clock: SharedValue<number> }) {
  const box = useDerivedValue(() => {
    const k = prog(clock.get(), wipe.t - 0.24, wipe.t + 0.24);
    if (k <= 0 || k >= 1) return { x: 0, y: 0, w: 0, h: 0 };
    if (k < 0.5) {
      const e = quintIn(k * 2);
      return wipe.dir === 'x' ? { x: 0, y: 0, w: width * e, h: height } : { x: 0, y: height * (1 - e), w: width, h: height * e };
    }
    const e = quintOut(k * 2 - 1);
    return wipe.dir === 'x' ? { x: width * e, y: 0, w: width * (1 - e), h: height } : { x: 0, y: 0, w: width, h: height * (1 - e) };
  });
  const x = useDerivedValue(() => box.get().x);
  const y = useDerivedValue(() => box.get().y);
  const w = useDerivedValue(() => box.get().w);
  const h = useDerivedValue(() => box.get().h);
  return <Rect x={x} y={y} width={w} height={h} color={wipe.color === 'orange' ? OR : CREAM} />;
}

/** Darker edges, transparent middle. */
export function Vignette({ width, height }: Size) {
  const r = Math.max(width, height) * 0.75;
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <RadialGradient c={vec(width / 2, height / 2)} r={r} colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} positions={[0, 0.55, 1]} />
    </Rect>
  );
}

/** Film grain: fine noise at 7%, jumping a little every frame like the reel's. */
export function Grain({ width, height, clock }: Size & { clock: SharedValue<number> }) {
  const jump = useDerivedValue(() => {
    const f = Math.floor(clock.get() * 24);
    const h = Math.sin(f * 12.9898) * 43758.5453;
    const u = h - Math.floor(h);
    const v = (h * 7.13) % 1;
    return [{ translateX: -width * 0.1 + u * width * 0.2 }, { translateY: -height * 0.1 + Math.abs(v) * height * 0.2 }];
  });
  return (
    <Group transform={jump} opacity={0.07} blendMode="overlay">
      <Rect x={-width * 0.2} y={-height * 0.2} width={width * 1.4} height={height * 1.4}>
        <Turbulence freqX={0.85} freqY={0.85} octaves={1} seed={7} />
      </Rect>
    </Group>
  );
}

/** The 2px orange line along the bottom: how far through the reel. */
export function Progress({ width, height, clock }: Size & { clock: SharedValue<number> }) {
  const w = useDerivedValue(() => (clock.get() / TOTAL) * width);
  return <Rect x={0} y={height - 2} width={w} height={2} color={OR} />;
}
