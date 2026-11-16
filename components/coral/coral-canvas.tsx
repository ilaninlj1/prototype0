// The shore where your coral grows, drawn with Skia. Everything still is recorded once as a picture (the water, the floor, the coral
// itself); a frame only moves those pictures and the finger's glow, so it stays cheap on a slow phone.

import { BlendMode, Canvas, Circle, ClipOp, Group, Line, PaintStyle, Picture, Skia, StrokeCap, TileMode, createPicture, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { mixHex } from '@/components/ocean/ocean-art';
import { SHORE_WATERLINE, shoreSand } from '@/lib/coral';
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

/** The top of the sand under x: the shore's slope, with a little ripple so it isn't a ruled line. */
function floorY(x: number, width: number, height: number): number {
  const f = x / Math.max(1, width);
  return shoreSand(x, width, height) - 6 * Math.sin(f * TAU * 1.5) - 3 * Math.sin(f * TAU * 4 + 1);
}

/** The Ocean's reef water: bright under the surface, a few levels down by the floor so pale coral and white words both read. */
function water() {
  const day = { night: 0, warm: 0 };
  const high = waterStops('reef', 'popular', day);
  const low = waterStops('reef', 'gems', day);
  return { top: mixHex(high.mid, high.top, 0.35), mid: mixHex(waterStops('reef', 'deepcuts', day).mid, low.mid, 0.5), bot: low.bot };
}

/** The stream's course down the beach, t from 0 at the bluff to 1 at the sea. Shared by the drawing and the moving glints. */
export function streamPoint(t: number, width: number, height: number): Point {
  'worklet';
  const line0 = SHORE_WATERLINE * height;
  const x = width * (0.385 + 0.05 * t + 0.022 * Math.sin(t * 6.2831853 * 1.25));
  return { x, y: line0 - height * 0.098 * (1 - t) };
}

function shape(points: [number, number][]) {
  const b = Skia.PathBuilder.Make();
  points.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y)));
  b.close();
  return b.build();
}
function smoothLine(points: [number, number][]) {
  const b = Skia.PathBuilder.Make();
  b.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    b.quadTo(points[i][0], points[i][1], mx, my);
  }
  const last = points[points.length - 1];
  b.lineTo(last[0], last[1]);
  return b;
}
function vertical(y0: number, y1: number, colors: string[], stops?: number[]): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: y0 }, { x: 0, y: y1 }, colors.map((c) => Skia.Color(c)), stops ?? null, TileMode.Clamp));
  return p;
}

/** The cove above the water: a sandstone bluff with palms, a small beach with a stream crossing it, and tide-pool rocks. */
function drawCove(c: SkCanvas, width: number, height: number, r: () => number) {
  const W = width;
  const H = height;
  const y0 = SHORE_WATERLINE * H;
  const up = (f: number) => y0 - f * H;
  c.drawRect(Skia.XYWHRect(0, 0, W, y0), vertical(0, y0, ['#4a9be8', '#9fd0f5', '#e4f3fc'], [0, 0.6, 1]));
  // A far headland, pale with distance.
  c.drawPath(smoothLine([[W * 0.46, y0], [W * 0.56, up(0.022)], [W * 0.7, up(0.04)], [W * 0.84, up(0.034)], [W, up(0.055)], [W, y0]]).close().build(), fill('#b4cfe2'));
  c.drawPath(smoothLine([[W * 0.7, up(0.04)], [W * 0.84, up(0.034)], [W, up(0.055)], [W, up(0.045)], [W * 0.84, up(0.026)], [W * 0.7, up(0.03)]]).close().build(), fill('#9dbf9a', 0.7));

  // The bluff: layered sandstone, lighter on top, with the cove's notch where the stream comes down.
  const top: [number, number][] = [[-4, up(0.158)], [W * 0.1, up(0.166)], [W * 0.22, up(0.156)], [W * 0.31, up(0.132)], [W * 0.37, up(0.1)], [W * 0.41, up(0.094)], [W * 0.46, up(0.11)], [W * 0.53, up(0.098)], [W * 0.59, up(0.06)], [W * 0.64, up(0.02)], [W * 0.67, y0]];
  const bluff = smoothLine(top).lineTo(-4, y0).close().build();
  c.drawPath(bluff, vertical(up(0.17), y0, ['#ecd3a4', '#d9b682', '#bd9462'], [0, 0.55, 1]));
  c.save();
  c.clipPath(bluff, ClipOp.Intersect, true);
  for (let k = 1; k <= 5; k++) {
    const drop = H * 0.024 * k + r() * 3;
    const band = smoothLine(top.map(([x, y], i) => [x, y + drop + 2.5 * Math.sin(i * 1.7 + k)] as [number, number])).build();
    c.drawPath(band, line(k % 2 ? '#b98d5b' : '#f3deb4', k % 2 ? 2.2 : 1.4, k % 2 ? 0.55 : 0.6));
  }
  // Shade under the overhangs and a few weathered cracks.
  c.drawRect(Skia.XYWHRect(0, y0 - H * 0.02, W * 0.7, H * 0.02), vertical(y0 - H * 0.02, y0, ['#9a744800', '#8a643c88']));
  for (let i = 0; i < 9; i++) {
    const x = W * (0.02 + r() * 0.6);
    const y = up(0.03 + r() * 0.09);
    c.drawLine(x, y, x + (r() - 0.5) * 5, y + 8 + r() * 12, line('#a67c4e', 1.2, 0.5));
  }
  c.restore();
  // Green along the top: ice plant spilling over, and palms.
  c.drawPath(smoothLine(top.slice(0, 9)).build(), line('#7fb069', 7));
  c.drawPath(smoothLine(top.slice(0, 9).map(([x, y]) => [x, y - 3] as [number, number])).build(), line('#a5cf86', 2.4, 0.9));
  for (let i = 0; i < 16; i++) {
    const f = r() * 0.5;
    const at = Math.min(7, Math.floor(f / 0.07));
    const x = W * f;
    const y = top[at][1] + (top[at + 1][1] - top[at][1]) * 0.5 + 3 + r() * 5;
    c.drawCircle(x, y, 2 + r() * 2.5, fill(i % 3 ? '#6f9f5b' : '#d98fb0', i % 3 ? 0.9 : 0.85));
  }
  for (const [fx, tall, lean] of [[0.07, 0.07, 5], [0.16, 0.056, -4], [0.27, 0.064, 6]] as const) {
    const bx = W * fx;
    const by = up(0.16) + 2;
    const tx = bx + lean;
    const ty = by - H * tall;
    const trunk = Skia.PathBuilder.Make();
    trunk.moveTo(bx, by);
    trunk.quadTo(bx + lean * 0.2, by - H * tall * 0.6, tx, ty);
    c.drawPath(trunk.build(), line('#8b6c4c', 3));
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + 0.2;
      const len = 11 + (i % 2) * 4;
      const frond = Skia.PathBuilder.Make();
      frond.moveTo(tx, ty);
      frond.quadTo(tx + Math.cos(ang) * len * 0.7, ty + Math.sin(ang) * len * 0.5 - 4, tx + Math.cos(ang) * len, ty + Math.sin(ang) * len * 0.7 + 3);
      c.drawPath(frond.build(), line(i % 2 ? '#4f9a5c' : '#3c8551', 2.4));
    }
  }

  // The beach in the cove, and the stream that crosses it.
  const beach = Skia.PathBuilder.Make();
  beach.moveTo(W * 0.15, y0 + 2);
  beach.quadTo(W * 0.27, up(0.03), W * 0.4, up(0.05));
  beach.quadTo(W * 0.55, up(0.04), W * 0.66, y0 + 2);
  beach.close();
  c.drawPath(beach.build(), vertical(up(0.05), y0, ['#fbefd0', '#f1dcae']));
  const stream = Skia.PathBuilder.Make();
  for (let i = 0; i <= 16; i++) {
    const p = streamPoint(i / 16, W, H);
    if (i === 0) stream.moveTo(p.x, p.y);
    else stream.lineTo(p.x, p.y);
  }
  const course = stream.build();
  c.drawPath(course, line('#e3cc9c', 9, 0.9));
  c.drawPath(course, line('#7fcfe6', 5.5));
  c.drawPath(course, line('#c9f1fa', 1.6, 0.9));
  for (let i = 0; i < 9; i++) c.drawCircle(W * (0.2 + r() * 0.42), up(0.006 + r() * 0.03), 1 + r() * 1.2, fill(i % 2 ? '#d9c08e' : '#ffffff', 0.8));

  // Tide-pool rocks running out from the beach, pools holding the sky, and a sea lion asleep on one.
  const rocks: [number, number, number][] = [[0.63, 30, 0.004], [0.73, 44, 0.012], [0.86, 38, 0.006], [0.965, 30, 0.014]];
  for (const [fx, rw, lift] of rocks) {
    const x = W * fx;
    const y = up(lift);
    c.drawOval(Skia.XYWHRect(x - rw, y - rw * 0.36, rw * 2, rw * 0.9), fill('#5f5045'));
    c.drawOval(Skia.XYWHRect(x - rw * 0.94, y - rw * 0.4, rw * 1.88, rw * 0.62), fill('#84705e'));
    c.drawOval(Skia.XYWHRect(x - rw * 0.8, y - rw * 0.4, rw * 1.3, rw * 0.3), fill('#a08b76', 0.7));
    const pw = rw * 0.42;
    c.drawOval(Skia.XYWHRect(x - pw + rw * 0.18, y - rw * 0.27, pw * 2, pw * 0.62), fill('#3f6f7c'));
    c.drawOval(Skia.XYWHRect(x - pw + rw * 0.18, y - rw * 0.29, pw * 2, pw * 0.56), fill('#7fd6e4'));
    c.drawOval(Skia.XYWHRect(x - pw * 0.5 + rw * 0.18, y - rw * 0.26, pw * 0.7, pw * 0.16), fill('#ffffff', 0.7));
  }
  const sx = W * 0.71;
  const sy = up(0.012) - 44 * 0.36;
  c.drawOval(Skia.XYWHRect(sx - 15, sy - 6, 30, 10), fill('#4b3a2e'));
  c.drawCircle(sx + 14, sy - 6, 4.6, fill('#4b3a2e'));
  c.drawLine(sx + 8, sy - 2, sx + 14, sy - 6, line('#4b3a2e', 6));
  c.drawLine(sx - 14, sy - 1, sx - 20, sy - 4, line('#4b3a2e', 3));
  c.drawCircle(sx + 15.5, sy - 7, 0.8, fill('#ffffff', 0.9));
  // Gulls.
  for (const [gx, gy, gs] of [[0.52, 0.2, 5], [0.6, 0.235, 4], [0.84, 0.16, 5]] as const) {
    const x = W * gx;
    const y = up(gy);
    const wing = Skia.PathBuilder.Make();
    wing.moveTo(x - gs, y);
    wing.quadTo(x - gs * 0.5, y - gs * 0.7, x, y);
    wing.quadTo(x + gs * 0.5, y - gs * 0.7, x + gs, y);
    c.drawPath(wing.build(), line('#ffffff', 1.4, 0.95));
  }
}

/** The shore, still: the cove above, the water under it, light falling in, and the sea floor rising toward the land. */
function recordWater(width: number, height: number) {
  return createPicture(
    (c) => {
      const w = water();
      const line0 = SHORE_WATERLINE * height;
      const r = rng(41);
      c.drawRect(Skia.XYWHRect(0, line0, width, height - line0), vertical(line0, height, [w.top, w.mid, w.bot], [0, 0.5, 1]));
      // Light falling in from the surface.
      const ray = Skia.Paint();
      ray.setAntiAlias(true);
      const lit = Skia.Color('#ffffff');
      lit[3] = 0.1;
      const dark = Skia.Color('#ffffff');
      dark[3] = 0;
      ray.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: line0 }, { x: 0, y: height * 0.85 }, [lit, dark], [0, 1], TileMode.Clamp));
      for (let i = 0; i < 5; i++) {
        const x = width * (0.16 + i * 0.2 + r() * 0.08);
        const half = width * (0.03 + r() * 0.04);
        const lean = width * 0.2;
        c.drawPath(shape([[x - half, line0], [x + half, line0], [x + half * 2.4 - lean, height * 0.85], [x - half * 2.4 - lean, height * 0.85]]), ray);
      }
      // The rock the bluff stands on, going down into the water at the left edge.
      const foot = Skia.PathBuilder.Make();
      foot.moveTo(-4, line0);
      foot.lineTo(width * 0.2, line0);
      foot.quadTo(width * 0.13, line0 + height * 0.1, width * 0.1, line0 + height * 0.26);
      foot.quadTo(width * 0.12, line0 + height * 0.45, width * 0.04, height);
      foot.lineTo(-4, height);
      foot.close();
      const rock = foot.build();
      c.drawPath(rock, vertical(line0, height, [mixHex('#b08a60', w.top, 0.35), mixHex('#6d5a48', w.mid, 0.45), mixHex('#4a4038', w.bot, 0.6)], [0, 0.4, 1]));
      c.save();
      c.clipPath(rock, ClipOp.Intersect, true);
      for (let i = 0; i < 7; i++) {
        const y = line0 + height * (0.04 + i * 0.09);
        c.drawLine(0, y + r() * 6, width * 0.2, y + 8 + r() * 10, line('#ffffff', 1.2, 0.1));
      }
      c.restore();

      // The sand.
      const crest = floorY(0, width, height) - 10;
      const b = Skia.PathBuilder.Make();
      b.moveTo(0, height);
      for (let x = 0; x <= width; x += 6) b.lineTo(x, floorY(x, width, height));
      b.lineTo(width, floorY(width, width, height));
      b.lineTo(width, height);
      b.close();
      c.drawPath(b.build(), vertical(crest, height, [mixHex(SAND.reef[0], w.mid, 0.3), mixHex(SAND.reef[0], ABYSS, 0.42), mixHex(SAND.reef[1], ABYSS, 0.66)], [0, 0.4, 1]));
      for (let k = 0; k < 4; k++) {
        const ripple = Skia.PathBuilder.Make();
        for (let x = 0; x <= width; x += 10) {
          const y = floorY(x, width, height) + 10 + k * 13 + 2 * Math.sin(x * 0.06 + k);
          if (x === 0) ripple.moveTo(x, y);
          else ripple.lineTo(x, y);
        }
        c.drawPath(ripple.build(), line('#ffffff', 1, 0.07));
      }
      for (let i = 0; i < 5; i++) {
        const x = width * (0.2 + i * 0.17 + r() * 0.06);
        const y = floorY(x, width, height);
        const rw = 10 + r() * 13;
        c.drawOval(Skia.XYWHRect(x - rw, y - rw * 0.42, rw * 2, rw * 0.95), fill(mixHex('#6d7c88', ABYSS, 0.45)));
        c.drawOval(Skia.XYWHRect(x - rw * 0.7, y - rw * 0.4, rw * 0.9, rw * 0.3), fill('#ffffff', 0.1));
      }

      drawCove(c, width, height, r);
      // The surface, and foam where it meets the beach and the rocks.
      const surf = Skia.PathBuilder.Make();
      for (let x = 0; x <= width + 8; x += 8) {
        const y = line0 + 1.6 * Math.sin((x / width) * TAU * 3);
        if (x === 0) surf.moveTo(x, y);
        else surf.lineTo(x, y);
      }
      c.drawPath(surf.build(), line('#ffffff', 2.4, 0.8));
      c.drawLine(width * 0.17, line0 + 1, width * 0.66, line0 + 1, line('#ffffff', 4.5, 0.7));
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

/** Pale coral and sea grass on the slope behind yours, so the shore never stands in empty water. */
function recordFar(width: number, height: number) {
  return createPicture(
    (c) => {
      const tone = mixHex(water().mid, '#dbe7e8', 0.2);
      const r = rng(73);
      for (let i = 0; i < 6; i++) {
        const x = width * (0.16 + i * 0.15 + r() * 0.05);
        const size = 0.7 + r() * 0.9;
        const alpha = 0.3 + r() * 0.25;
        twig(c, x, floorY(x, width, height) + 4, 26 * size, -Math.PI / 2 + (r() - 0.5) * 0.4, 4.5 * size, () => line(tone, 1, alpha), r, 4);
      }
      // Sea grass, thickest where the water is shallow.
      const line0 = SHORE_WATERLINE * height;
      for (let i = 0; i < 26; i++) {
        const x = width * (0.1 + r() * 0.88);
        const y = floorY(x, width, height) + 3;
        if (y < line0 + 14) continue;
        const tall = Math.min(y - line0 - 8, 12 + r() * 26);
        const green = mixHex(r() < 0.5 ? '#3fae7c' : '#2f9a6a', water().bot, Math.min(0.6, (y - line0) / height));
        for (let k = 0; k < 3; k++) {
          const lean = (k - 1) * 5 + (r() - 0.5) * 6;
          const blade = Skia.PathBuilder.Make();
          blade.moveTo(x + (k - 1) * 2.5, y);
          blade.quadTo(x + lean * 0.3, y - tall * 0.6, x + lean, y - tall * (0.75 + r() * 0.25));
          c.drawPath(blade.build(), line(green, 2.4, 0.9));
        }
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
  c.drawCircle(0, 0, r * 1.9, glowPaint(color, r * 1.9, 0.16));
  const pale = mixHex(color, '#ffffff', 0.5);
  const arms = 11;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + node.trackId * 0.37;
    c.drawLine(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, line(color, r * 0.3));
    c.drawCircle(Math.cos(a) * r * 1.24, Math.sin(a) * r * 1.24, r * 0.19, fill(pale));
  }
  // Flat, like the Ocean's own creatures: one color, a paler ring, a pale heart.
  c.drawCircle(0, 0, r, fill(color));
  c.drawCircle(0, 0, r * 0.72, line(pale, 1.6, 0.55));
  c.drawCircle(0, 0, r * 0.26, fill(pale, 0.95));
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

/** One glint riding the stream down the beach. */
function Glint({ flow, offset, width, height }: { flow: SharedValue<number>; offset: number; width: number; height: number }) {
  const at = useDerivedValue(() => {
    'worklet';
    const t = (flow.get() + offset) % 1;
    const p = streamPoint(t, width, height);
    return [{ translateX: p.x }, { translateY: p.y }];
  });
  return (
    <Group transform={at}>
      <Circle cx={0} cy={0} r={1.5} color="#ffffff" opacity={0.95} />
    </Group>
  );
}

/** The shore, the coral grown on it from your links, and a light where the finger is. */
export default function CoralCanvas({ width, height, layout, glowX, glowY, glowOn, blend, sway, growth, blooms, activeNode, reduceMotion, pullFrom, pullX, pullY, pullOn, buds }: CoralCanvasProps) {
  const still = useMemo(() => recordWater(width, height), [width, height]);
  const far = useMemo(() => recordFar(width, height), [width, height]);
  const bubbles = useMemo(() => recordBubbles(width, height), [width, height]);
  const coral = useMemo(() => recordCoral(layout, width, height, blooms), [layout, width, height, blooms]);
  const glow = useMemo(() => recordGlow(), []);

  // The sway leans back and forth; the bubbles climb and come round again.
  const rise = useSharedValue(0);
  const flow = useSharedValue(0);
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
    flow.set(0);
    flow.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false));
    return () => {
      cancelAnimation(sway);
      cancelAnimation(rise);
      cancelAnimation(flow);
    };
  }, [reduceMotion, sway, rise, flow]);

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

  const underwater = useMemo(() => Skia.XYWHRect(0, SHORE_WATERLINE * height + 4, width, height), [width, height]);
  const active = activeNode === null ? undefined : layout.nodes.find((n) => n.trackId === activeNode);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={still} />
      {!reduceMotion && [0, 0.2, 0.4, 0.6, 0.8].map((offset) => <Glint key={offset} flow={flow} offset={offset} width={width} height={height} />)}
      <Group transform={farLean}>
        <Picture picture={far} />
      </Group>
      <Group clip={underwater}>
        <Group transform={up}>
          <Picture picture={bubbles} />
        </Group>
        <Group transform={upNext}>
          <Picture picture={bubbles} />
        </Group>
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
