// The coral garden, drawn with Skia. Everything still is recorded once as a picture (the water, the floor, the coral
// itself); a frame only moves those pictures and the finger's glow, so it stays cheap on a slow phone.

import { BlendMode, Canvas, Circle, Group, Line, PaintStyle, Picture, Skia, StrokeCap, TileMode, createPicture, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { mixHex } from '@/components/ocean/ocean-art';
import type { GardenBranch, GardenLayout, GardenNode, Point } from '@/lib/coral-types';
import { SAND, waterStops } from '@/lib/ocean-scene';
import type { Bloom } from './coral-rules';

export type CoralCanvasProps = {
  width: number;
  height: number;
  layout: GardenLayout;
  /** Where the finger sits on its branch, and how lit the glow is (0 to 1). Shared values, so a drag never re-renders. */
  glowX: SharedValue<number>;
  glowY: SharedValue<number>;
  glowOn: SharedValue<number>;
  blend: SharedValue<number>;
  sway: SharedValue<number>;
  growth: SharedValue<number>;
  blooms: Record<string, Bloom>;
  /** The song playing alone, ringed. */
  activeNode: number | null;
  reduceMotion: boolean;
  /** A song being pulled like a rubber band: where it is anchored, and where the finger has it (0 to 1 lit). */
  pullFrom: { x: number; y: number; color: string } | null;
  pullX: SharedValue<number>;
  pullY: SharedValue<number>;
  pullOn: SharedValue<number>;
  /** Small buds on the branches, marking where each song comes in. */
  buds: { x: number; y: number; color: string }[];
};

const TAU = Math.PI * 2;
const ABYSS = '#04203a';
const FALLBACK = '#e8a33d';
/** How far the coral leans each way, in radians of shear around the floor. */
const SWAY = 0.012;

const rng = (seed: number) => {
  let s = Math.max(1, Math.floor(Math.abs(seed)) % 2147483647);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const safeHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : FALLBACK);

function fill(color: string, alpha = 1): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setAlphaf(alpha);
  return p;
}
function line(color: string, width: number, alpha = 1): SkPaint {
  const p = fill(color, alpha);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeCap(StrokeCap.Round);
  return p;
}
function glowPaint(color: string, radius: number, alpha: number): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setBlendMode(BlendMode.Screen);
  const c0 = Skia.Color(color);
  c0[3] = alpha;
  const c1 = Skia.Color(color);
  c1[3] = 0;
  p.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, radius, [c0, c1], [0, 1], TileMode.Clamp));
  return p;
}
function stroke(c: SkCanvas, pts: Point[], from: number, to: number, paint: SkPaint, dx = 0, dy = 0) {
  if (to - from < 1) return;
  const b = Skia.PathBuilder.Make();
  b.moveTo(pts[from].x + dx, pts[from].y + dy);
  for (let i = from + 1; i <= to; i++) b.lineTo(pts[i].x + dx, pts[i].y + dy);
  c.drawPath(b.build(), paint);
}

/** The top of the sand under x. One gentle shape, so stems always have something to stand on. */
function floorY(x: number, width: number, height: number): number {
  const f = x / Math.max(1, width);
  return height - (Math.max(26, height * 0.06) + 6 * Math.sin(f * TAU * 1.5) + 3 * Math.sin(f * TAU * 4 + 1));
}

/** The Ocean's reef water, a few levels down so pale coral and white words both read on it. */
function water() {
  const day = { night: 0, warm: 0 };
  const high = waterStops('reef', 'deepcuts', day);
  const low = waterStops('reef', 'gems', day);
  return { top: mixHex(high.top, low.top, 0.5), mid: low.mid, bot: low.bot };
}

function recordWater(width: number, height: number) {
  return createPicture(
    (c) => {
      const w = water();
      const bg = Skia.Paint();
      bg.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: height }, [Skia.Color(w.top), Skia.Color(w.mid), Skia.Color(w.bot)], [0, 0.5, 1], TileMode.Clamp));
      c.drawRect(Skia.XYWHRect(0, 0, width, height), bg);
      // Light falling in from above.
      const ray = Skia.Paint();
      ray.setAntiAlias(true);
      const lit = Skia.Color('#ffffff');
      lit[3] = 0.1;
      const dark = Skia.Color('#ffffff');
      dark[3] = 0;
      ray.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: height * 0.75 }, [lit, dark], [0, 1], TileMode.Clamp));
      const r = rng(41);
      for (let i = 0; i < 5; i++) {
        const x = width * (0.08 + i * 0.2 + r() * 0.08);
        const half = width * (0.03 + r() * 0.04);
        const lean = width * 0.22;
        const b = Skia.PathBuilder.Make();
        b.moveTo(x - half, 0);
        b.lineTo(x + half, 0);
        b.lineTo(x + half * 2.4 - lean, height * 0.75);
        b.lineTo(x - half * 2.4 - lean, height * 0.75);
        b.close();
        c.drawPath(b.build(), ray);
      }
      // The sand.
      const sand = Skia.Paint();
      sand.setAntiAlias(true);
      const top = floorY(0, width, height) - 12;
      sand.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: top }, { x: 0, y: height }, [Skia.Color(mixHex(SAND.reef[0], ABYSS, 0.5)), Skia.Color(mixHex(SAND.reef[1], ABYSS, 0.68))], [0, 1], TileMode.Clamp));
      const b = Skia.PathBuilder.Make();
      b.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) b.lineTo(x, floorY(x, width, height));
      b.lineTo(width, floorY(width, width, height));
      b.lineTo(width, height);
      b.close();
      c.drawPath(b.build(), sand);
      const grain = fill(mixHex(SAND.reef[0], ABYSS, 0.3), 0.35);
      for (let i = 0; i < 46; i++) {
        const x = r() * width;
        const y = floorY(x, width, height) + 4 + r() * (height - floorY(x, width, height) - 6);
        c.drawCircle(x, y, 0.6 + r() * 1.1, grain);
      }
    },
    { width, height }
  );
}

function twig(c: SkCanvas, x: number, y: number, len: number, ang: number, w: number, paint: () => SkPaint, r: () => number, depth: number) {
  if (depth <= 0 || len < 4) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  const b = Skia.PathBuilder.Make();
  b.moveTo(x, y);
  b.quadTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x2, y2);
  const p = paint();
  p.setStrokeWidth(w);
  c.drawPath(b.build(), p);
  const n = depth > 2 ? 3 : 2;
  for (let i = 0; i < n; i++) twig(c, x2, y2, len * (0.62 + r() * 0.14), ang + (i - (n - 1) / 2) * (0.55 + r() * 0.25), w * 0.72, paint, r, depth - 1);
}

/** Pale coral far behind yours, sunk into the water's color, so the garden never stands in empty water. */
function recordFar(width: number, height: number) {
  return createPicture(
    (c) => {
      const tone = mixHex(water().mid, '#dbe7e8', 0.2);
      const r = rng(73);
      for (let i = 0; i < 6; i++) {
        const x = width * (0.06 + i * 0.18 + r() * 0.06);
        const size = 0.7 + r() * 0.9;
        const alpha = 0.3 + r() * 0.25;
        twig(c, x, floorY(x, width, height) + 4, 26 * size, -Math.PI / 2 + (r() - 0.5) * 0.4, 4.5 * size, () => line(tone, 1, alpha), r, 4);
      }
    },
    { width, height }
  );
}

function recordBubbles(width: number, height: number) {
  return createPicture(
    (c) => {
      const r = rng(11);
      const rim = line('#ffffff', 1, 0.3);
      const shine = fill('#ffffff', 0.1);
      for (let i = 0; i < 16; i++) {
        const x = r() * width;
        const y = r() * height;
        const rad = 1.2 + r() * 2.6;
        c.drawCircle(x, y, rad, shine);
        c.drawCircle(x, y, rad, rim);
      }
    },
    { width, height }
  );
}

function drawBranch(c: SkCanvas, br: GardenBranch, colA: string, colB: string, k: number, bloom: Bloom) {
  const pts = br.points;
  const n = pts.length;
  if (n < 2) return;
  if (bloom === 'clash') {
    colA = mixHex(colA, '#a4b8bb', 0.65);
    colB = mixHex(colB, '#a4b8bb', 0.65);
  }
  const cut = br.type === 'cut';
  const mid = Math.floor((n - 1) / 2);
  // A cut branch is two halves with a gap between them.
  const gapFrom = cut && n >= 8 ? mid - 1 : -1;
  const gapTo = cut && n >= 8 ? mid + 2 : -1;
  const colorAt = (f: number) => (cut ? (f < 0.5 ? colA : colB) : mixHex(colA, colB, Math.max(0, Math.min(1, f))));
  const W = 10 * k;
  const r = rng(n * 131 + Math.round(pts[0].x * 7 + pts[n - 1].y * 13));
  const phase = r() * TAU;

  // A dark edge under the limb, so it stands off the water.
  const edge = line(mixHex(colorAt(0.5), ABYSS, 0.62), W + 4.5, 0.6);
  if (gapFrom < 0) stroke(c, pts, 0, n - 1, edge);
  else {
    stroke(c, pts, 0, gapFrom, edge);
    stroke(c, pts, gapTo, n - 1, edge);
    c.drawLine(pts[gapFrom].x, pts[gapFrom].y, pts[gapTo].x, pts[gapTo].y, line('#ffffff', 1.6, 0.5));
  }

  // Little side growths with a pale tip, alternating sides.
  for (let i = 2; i < n - 2; i += 2) {
    if (gapFrom >= 0 && i >= gapFrom && i <= gapTo) continue;
    const dx = pts[i + 1].x - pts[i - 1].x;
    const dy = pts[i + 1].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    const side = (i / 2) % 2 ? 1 : -1;
    const reach = W * (0.95 + r() * 0.7);
    const lean = (r() - 0.5) * 0.6;
    const nx = (-dy / len) * side + (dx / len) * lean;
    const ny = (dx / len) * side + (dy / len) * lean;
    const col = colorAt(i / (n - 1));
    const tx = pts[i].x + nx * reach;
    const ty = pts[i].y + ny * reach;
    c.drawLine(pts[i].x, pts[i].y, tx, ty, line(col, W * 0.42));
    c.drawCircle(tx, ty, W * 0.3, fill(mixHex(col, '#ffffff', 0.2)));
    if (bloom === 'bloom') {
      c.save();
      c.translate(tx, ty);
      c.drawCircle(0, 0, W, glowPaint(col, W, 0.65));
      c.drawCircle(0, 0, W * 0.42, fill(mixHex(col, '#ffffff', 0.75)));
      c.drawCircle(-W * 0.12, -W * 0.12, W * 0.15, fill('#ffffff', 0.9));
      c.restore();
    }
  }

  // The limb itself, a short piece at a time so its color can run from one song's to the other's.
  for (let i = 0; i < n - 1; i++) {
    if (gapFrom >= 0 && i >= gapFrom && i < gapTo) continue;
    const w = W * (1 + 0.16 * Math.sin(i * 1.3 + phase));
    c.drawLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, line(colorAt((i + 0.5) / (n - 1)), w));
  }
  const shine = line('#ffffff', 1.8, 0.22);
  if (gapFrom < 0) stroke(c, pts, 0, n - 1, shine, -W * 0.22, -W * 0.22);
  else {
    stroke(c, pts, 0, gapFrom, shine, -W * 0.22, -W * 0.22);
    stroke(c, pts, gapTo, n - 1, shine, -W * 0.22, -W * 0.22);
    // The two cut faces.
    for (const [i, col] of [[gapFrom, colA], [gapTo, colB]] as const) {
      c.drawCircle(pts[i].x, pts[i].y, W * 0.62, fill(mixHex(col, '#ffffff', 0.55)));
      c.drawCircle(pts[i].x, pts[i].y, W * 0.62, line(mixHex(col, ABYSS, 0.5), 1.4));
    }
  }
}

function drawPolyp(c: SkCanvas, node: GardenNode) {
  const color = safeHex(node.color);
  const r = Math.max(6, node.r);
  c.save();
  c.translate(node.x, node.y);
  c.drawCircle(0, 0, r * 2.6, glowPaint(color, r * 2.6, 0.38));
  const pale = mixHex(color, '#ffffff', 0.45);
  const arms = 11;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + node.trackId * 0.37;
    c.drawLine(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22, line(color, r * 0.3));
    c.drawCircle(Math.cos(a) * r * 1.26, Math.sin(a) * r * 1.26, r * 0.2, fill(pale));
  }
  const body = Skia.Paint();
  body.setAntiAlias(true);
  body.setShader(Skia.Shader.MakeRadialGradient({ x: -r * 0.25, y: -r * 0.3 }, r * 1.15, [Skia.Color(pale), Skia.Color(color), Skia.Color(mixHex(color, ABYSS, 0.35))], [0, 0.6, 1], TileMode.Clamp));
  c.drawCircle(0, 0, r, body);
  c.drawCircle(0, 0, r, line(mixHex(color, ABYSS, 0.5), 1.2, 0.7));
  c.drawCircle(0, 0, r * 0.24, fill(mixHex(color, ABYSS, 0.6), 0.75));
  c.restore();
}

function recordCoral(layout: GardenLayout, width: number, height: number, blooms: Record<string, Bloom>) {
  return createPicture(
    (c) => {
      const k = Math.max(0.8, Math.min(1.35, width / 390));
      const byId = new Map(layout.nodes.map((n) => [n.trackId, n]));
      // A song with nothing below it stands on the floor by its own stem.
      const held = new Set<number>();
      for (const b of layout.branches) {
        const a = byId.get(b.a);
        const z = byId.get(b.b);
        if (!a || !z) continue;
        held.add(a.y < z.y ? a.trackId : z.trackId);
      }
      for (const n of layout.nodes) {
        if (held.has(n.trackId)) continue;
        const fy = floorY(n.x, width, height) + 3;
        const tone = mixHex(safeHex(n.color), ABYSS, 0.4);
        if (fy - n.y > 2) {
          c.drawLine(n.x, n.y, n.x, fy, line(mixHex(tone, ABYSS, 0.5), 15 * k + 4, 0.6));
          c.drawLine(n.x, n.y, n.x, fy, line(tone, 15 * k));
        }
        c.drawOval(Skia.XYWHRect(n.x - 22 * k, fy - 7 * k, 44 * k, 14 * k), fill(tone));
      }
      for (const b of layout.branches) {
        drawBranch(c, b, safeHex(byId.get(b.a)?.color ?? FALLBACK), safeHex(byId.get(b.b)?.color ?? FALLBACK), k, blooms[b.linkId] ?? 'normal');
      }
      for (const n of layout.nodes) drawPolyp(c, n);
    },
    { width, height }
  );
}

function recordGlow() {
  const R = 54;
  return createPicture(
    (c) => {
      c.drawCircle(0, 0, R, glowPaint('#ffffff', R, 0.8));
      c.drawCircle(0, 0, 5.5, fill('#ffffff', 0.95));
    },
    Skia.XYWHRect(-R, -R, R * 2, R * 2)
  );
}

/** Water, floor, the coral grown from your links, and a light where the finger is. */
export default function CoralCanvas({ width, height, layout, glowX, glowY, glowOn, blend, sway, growth, blooms, activeNode, reduceMotion, pullFrom, pullX, pullY, pullOn, buds }: CoralCanvasProps) {
  const still = useMemo(() => recordWater(width, height), [width, height]);
  const far = useMemo(() => recordFar(width, height), [width, height]);
  const bubbles = useMemo(() => recordBubbles(width, height), [width, height]);
  const coral = useMemo(() => recordCoral(layout, width, height, blooms), [layout, width, height, blooms]);
  const glow = useMemo(() => recordGlow(), []);

  // The sway leans back and forth; the bubbles climb and come round again.
  const rise = useSharedValue(0);
  const previousCount = useRef(0);
  const count = layout.branches.length;
  useEffect(() => {
    if (!reduceMotion && count > previousCount.current) {
      growth.set(0.84);
      growth.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    } else growth.set(1);
    previousCount.current = count;
    return () => cancelAnimation(growth);
  }, [count, reduceMotion, growth]);
  useEffect(() => {
    if (reduceMotion) {
      sway.set(0);
      rise.set(0);
      return;
    }
    sway.set(-1);
    sway.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
    rise.set(0);
    rise.set(withRepeat(withTiming(1, { duration: 38000, easing: Easing.linear }), -1, false));
    return () => {
      cancelAnimation(sway);
      cancelAnimation(rise);
    };
  }, [reduceMotion, sway, rise]);

  // The coral leans around the floor, so its roots stay put and its tips move most.
  const floor = height - Math.max(26, height * 0.06);
  const lean = useDerivedValue(() => {
    'worklet';
    return [{ translateY: floor }, { skewX: SWAY * sway.get() }, { scaleY: growth.get() }, { translateY: -floor }];
  });
  const farLean = useDerivedValue(() => {
    'worklet';
    return [{ translateY: floor }, { skewX: -SWAY * 1.6 * sway.get() }, { translateY: -floor }];
  });
  const up = useDerivedValue(() => { 'worklet'; return [{ translateY: -rise.get() * height }]; });
  const upNext = useDerivedValue(() => { 'worklet'; return [{ translateY: height - rise.get() * height }]; });
  const glowAt = useDerivedValue(() => {
    'worklet';
    return [{ translateX: glowX.get() }, { translateY: glowY.get() }];
  });
  const ripple = useDerivedValue(() => {
    'worklet';
    return 12 + 28 * 4 * blend.get() * (1 - blend.get());
  });

  const pullEnd = useDerivedValue(() => {
    'worklet';
    return { x: pullX.get(), y: pullY.get() };
  });

  const active = activeNode === null ? undefined : layout.nodes.find((n) => n.trackId === activeNode);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={still} />
      <Group transform={farLean}>
        <Picture picture={far} />
      </Group>
      <Group transform={up}>
        <Picture picture={bubbles} />
      </Group>
      <Group transform={upNext}>
        <Picture picture={bubbles} />
      </Group>
      <Group transform={lean}>
        <Picture picture={coral} />
        {buds.map((bud, i) => (
          <Group key={i}>
            <Circle cx={bud.x} cy={bud.y} r={6} color={safeHex(bud.color)} />
            <Circle cx={bud.x} cy={bud.y} r={3} color="#ffffff" opacity={0.95} />
          </Group>
        ))}
        {active && <Circle cx={active.x} cy={active.y} r={Math.max(6, active.r) * 1.75} style="stroke" strokeWidth={2} color="#ffffff" opacity={0.9} />}
      </Group>
      {pullFrom && (
        <Group opacity={pullOn}>
          <Line p1={{ x: pullFrom.x, y: pullFrom.y }} p2={pullEnd} color={safeHex(pullFrom.color)} strokeWidth={7} strokeCap="round" />
          <Line p1={{ x: pullFrom.x, y: pullFrom.y }} p2={pullEnd} color="#ffffff" strokeWidth={2} strokeCap="round" opacity={0.7} />
          <Circle cx={pullX} cy={pullY} r={15} color={safeHex(pullFrom.color)} />
          <Circle cx={pullX} cy={pullY} r={15} style="stroke" strokeWidth={2} color="#ffffff" opacity={0.9} />
        </Group>
      )}
      <Group transform={glowAt} opacity={glowOn}>
        <Picture picture={glow} opacity={0.45} />
        <Circle cx={0} cy={0} r={ripple} style="stroke" strokeWidth={9} color="#e5ffff" opacity={0.08} />
        <Circle cx={0} cy={0} r={ripple} style="stroke" strokeWidth={4} color="#e5ffff" opacity={0.18} />
        <Circle cx={0} cy={0} r={ripple} style="stroke" strokeWidth={1.3} color="#ffffff" opacity={0.8} />
      </Group>
    </Canvas>
  );
}
