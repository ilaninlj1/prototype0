import { BlurMask, Canvas, Circle, Group, Path, Points, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { DarkColors } from '@/constants/theme';
import { ARC_STEPS, pulseAt, shows, turn, type SeaArc, type V3 } from '@/lib/sea-globe';

export type Globe = { cx: number; cy: number; r: number };

export type SeaCanvasProps = {
  width: number;
  height: number;
  globe: Globe;
  /** Land dots on the unit sphere (assets/sea-dots.json). */
  dots: V3[];
  arcs: SeaArc[];
  /** Each arc's light: the song's color. */
  colors: string[];
  /** Each arc's pulse offset in ms, so they don't all leave at once. */
  offsets: number[];
  yaw: SharedValue<number>;
  pitch: SharedValue<number>;
  /** ms, for the pulses; frozen with reduced motion. */
  clock: SharedValue<number>;
  /** The tapped arc, or -1. The others dim. */
  selected: SharedValue<number>;
  pulses: boolean;
};

const GLOBE = '#182a4f';
const LAND = DarkColors.text;

/** One bottle: its arches of light, its stops, and the pulse running along them. */
function Arc({ arc, i, color, offset, globe, yaw, pitch, clock, selected, pulses }: { arc: SeaArc; i: number; color: string; offset: number } & Omit<SeaCanvasProps, 'width' | 'height' | 'dots' | 'arcs' | 'colors' | 'offsets'>) {
  const { cx, cy, r } = globe;
  const segments = arc.segments;
  const stops = arc.stops;
  const line = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    const y = yaw.get();
    const p = pitch.get();
    for (const seg of segments) {
      let pen = false;
      for (const v of seg) {
        const t = turn(v, y, p);
        if (!shows(t)) {
          pen = false;
          continue;
        }
        const sx = cx + r * t[0];
        const sy = cy - r * t[1];
        if (pen) b.lineTo(sx, sy);
        else b.moveTo(sx, sy);
        pen = true;
      }
    }
    return b.detach();
  });
  const dots = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make();
    stops.forEach((v, k) => {
      const t = turn(v, yaw.get(), pitch.get());
      if (t[2] > 0) b.addCircle(cx + r * t[0], cy - r * t[1], k === 0 ? 3.2 : 2.4);
    });
    return b.detach();
  });
  const head = useDerivedValue(() => {
    const at = pulses ? pulseAt(segments.length, clock.get(), offset) : null;
    if (!at) return { x: -20, y: -20, on: 0 };
    const seg = segments[at.hop];
    const t = turn(seg[Math.min(ARC_STEPS, Math.round(at.along * ARC_STEPS))], yaw.get(), pitch.get());
    if (!shows(t)) return { x: -20, y: -20, on: 0 };
    return { x: cx + r * t[0], y: cy - r * t[1], on: Math.sin(Math.PI * Math.min(1, at.along * 1.05)) * 0.6 + 0.4 };
  });
  const headX = useDerivedValue(() => head.get().x);
  const headY = useDerivedValue(() => head.get().y);
  const headOn = useDerivedValue(() => head.get().on);
  const dim = useDerivedValue(() => (selected.get() < 0 || selected.get() === i ? 1 : 0.18));

  return (
    <Group opacity={dim}>
      <Path path={line} color={color} style="stroke" strokeWidth={6} strokeCap="round" opacity={0.16} />
      <Path path={line} color={color} style="stroke" strokeWidth={1.6} strokeCap="round" opacity={0.9} />
      <Path path={dots} color={LAND} />
      <Circle cx={headX} cy={headY} r={7} color={color} opacity={headOn}>
        <BlurMask blur={5} style="normal" />
      </Circle>
      <Circle cx={headX} cy={headY} r={2.6} color={LAND} opacity={headOn} />
    </Group>
  );
}

/** The Sea: a dotted globe, your bottles as arcs of light over it. Load it through components/sea/sea-globe.tsx. */
export default function SeaCanvas(props: SeaCanvasProps) {
  const { width, height, globe, dots, arcs, colors, offsets, yaw, pitch } = props;
  const { cx, cy, r } = globe;
  // The land facing you, brighter toward the middle and fainter toward the edge.
  const land = useDerivedValue(() => {
    const near: { x: number; y: number }[] = [];
    const edge: { x: number; y: number }[] = [];
    const y = yaw.get();
    const p = pitch.get();
    for (const v of dots) {
      const t = turn(v, y, p);
      if (t[2] <= 0) continue;
      (t[2] > 0.35 ? near : edge).push(vec(cx + r * t[0], cy - r * t[1]));
    }
    return { near, edge };
  });
  const near = useDerivedValue(() => land.get().near);
  const edge = useDerivedValue(() => land.get().edge);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Circle cx={cx} cy={cy} r={r + 10} color={LAND} opacity={0.05}>
        <BlurMask blur={18} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color={GLOBE} />
      <Circle cx={cx} cy={cy} r={r} color={LAND} style="stroke" strokeWidth={1} opacity={0.14} />
      <Points points={edge} mode="points" color={LAND} strokeWidth={1.8} strokeCap="round" opacity={0.22} />
      <Points points={near} mode="points" color={LAND} strokeWidth={2.2} strokeCap="round" opacity={0.42} />
      {arcs.map((arc, i) => (
        <Arc
          key={arc.bottleId}
          arc={arc}
          i={i}
          color={colors[i]}
          offset={offsets[i]}
          globe={globe}
          yaw={yaw}
          pitch={pitch}
          clock={props.clock}
          selected={props.selected}
          pulses={props.pulses}
        />
      ))}
    </Canvas>
  );
}
