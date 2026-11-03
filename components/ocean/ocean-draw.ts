// One frame of the ocean. Every function here runs on the UI thread and only composes numbers and recorded pictures.
// lib/ocean-draw-rules.test.ts checks that each function in this file is marked as a worklet: a missing mark crashes
// only on a phone, never on the web preview.

import { BlendMode, PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';

import { floorY, restPose, scatter, schoolOffset, swimPose } from '@/lib/ocean-motion';
import { SEA_BASE, seaY, type SeaState } from '@/lib/sea-beat';
import { seabedAt, type Rgb } from '@/lib/ocean-scene';

/** Skia's "intersect" clip. */
const CLIP_IN = 1;
const WORLD_W = 270;

export type StopRow = { top: Rgb; mid: Rgb; bot: Rgb; ray: number };
export type WeedData = { x: number; base: number; height: number; color: Float32Array; width: number; phase: number; leaves: boolean };
export type StageMember = {
  look: string;
  sprite: number;
  halo: number;
  seed: number;
  speed: number;
  band: number;
  x: number;
  scale: number;
  awake: boolean;
  /** How many swim together when wild, drawn as one. */
  flock: number;
  /** Your saves by one artist: the first one's index leads, or -1. */
  leader: number;
  schoolIndex: number;
  rare: boolean;
  trackId: number;
  restI: number;
  restN: number;
  big: boolean;
};
export type Stage = { col: number; row: number; picture: SkPicture; weeds: WeedData[]; members: StageMember[]; bottles: { sprite: SkPicture; seed: number; i: number; n: number }[] };

export type Frame = {
  width: number;
  height: number;
  dive: number;
  travel: number;
  surfaceY: number;
  t: number;
  sea: SeaState;
  posX: number;
  posY: number;
  touch: { x: number; y: number; r: number } | null;
  spotId: number;
  spotMix: number;
  night: number;
  warm: number;
  stops: StopRow[][];
  rest: StopRow;
  stages: Stage[];
  sprites: SkPicture[][];
  halos: SkPicture[];
};

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function colorOf(c: Rgb): Float32Array {
  'worklet';
  return Skia.Color(`rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`);
}

/** The water here: between the places either side of you, and toward Home's water as you near the surface. */
function waterHere(f: Frame): StopRow {
  'worklet';
  const x0 = Math.max(0, Math.min(3, Math.floor(f.posX)));
  const y0 = Math.max(0, Math.min(3, Math.floor(f.posY)));
  const x1 = Math.min(3, x0 + 1);
  const y1 = Math.min(3, y0 + 1);
  const fx = Math.max(0, Math.min(1, f.posX - x0));
  const fy = Math.max(0, Math.min(1, f.posY - y0));
  const a = f.stops[y0][x0];
  const b = f.stops[y0][x1];
  const c = f.stops[y1][x0];
  const d = f.stops[y1][x1];
  const near = Math.min(1, f.dive / 0.4);
  const m = near * near * (3 - 2 * near);
  const pick = (k: 'top' | 'mid' | 'bot'): Rgb => {
    'worklet';
    return mix3(f.rest[k], mix3(mix3(a[k], b[k], fx), mix3(c[k], d[k], fx), fy), m);
  };
  const rayHere = a.ray + (b.ray - a.ray) * fx + (c.ray - a.ray) * fy;
  return { top: pick('top'), mid: pick('mid'), bot: pick('bot'), ray: f.rest.ray + (rayHere - f.rest.ray) * m };
}

function drawWater(c: SkCanvas, f: Frame, here: StopRow, surface: number) {
  'worklet';
  const p = Skia.Paint();
  const y0 = surface - 12;
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: y0 }, { x: 0, y: y0 + f.height }, [colorOf(here.top), colorOf(here.mid), colorOf(here.bot)], [0, 0.45, 1], TileMode.Clamp));
  c.drawRect(Skia.XYWHRect(0, 0, f.width, f.height), p);
}

function drawLight(c: SkCanvas, f: Frame, here: StopRow, surface: number) {
  'worklet';
  const a = here.ray;
  if (a <= 0.01) return;
  const { width: w, t } = f;
  const k = w / WORLD_W;
  const tint = f.night > 0.5 ? 'rgba(190,212,255,1)' : f.warm > 0.4 ? 'rgba(255,226,190,1)' : 'rgba(255,255,240,1)';
  const clear = f.night > 0.5 ? 'rgba(190,212,255,0)' : f.warm > 0.4 ? 'rgba(255,226,190,0)' : 'rgba(255,255,240,0)';
  const len = 430 * k;
  const paint = Skia.Paint();
  paint.setBlendMode(BlendMode.Screen);
  paint.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: surface }, { x: 0, y: surface + len }, [Skia.Color(tint), Skia.Color(clear)], [0, 1], TileMode.Clamp));
  for (let i = 0; i < 6; i++) {
    const x0 = (w * (i + 0.3)) / 6 + Math.sin(t * 0.28 + i * 1.7) * 20 * k;
    const rw = (10 + ((i * 37) % 13)) * k;
    const slant = (-34 + ((i * 17) % 18)) * k;
    const rlen = (300 + ((i * 53) % 170)) * k;
    paint.setAlphaf(a * (0.32 + 0.22 * Math.sin(t * 0.6 + i * 2.1)));
    const ray = Skia.PathBuilder.Make();
    ray.moveTo(x0 - rw, surface);
    ray.lineTo(x0 + rw, surface);
    ray.lineTo(x0 + rw * 2.6 + slant, surface + rlen);
    ray.lineTo(x0 - rw * 2.2 + slant, surface + rlen);
    ray.close();
    c.drawPath(ray.build(), paint);
  }
  const glow = Skia.Paint();
  glow.setBlendMode(BlendMode.Screen);
  const c0 = Skia.Color(tint);
  c0[3] = Math.min(1, a * 1.15);
  const c1 = Skia.Color(tint);
  c1[3] = a * 0.32;
  const c2 = Skia.Color(clear);
  glow.setShader(Skia.Shader.MakeRadialGradient({ x: w * 0.64, y: surface }, 190 * k, [c0, c1, c2], [0, 0.32, 1], TileMode.Clamp));
  c.drawRect(Skia.XYWHRect(0, surface - 6, w, 210 * k), glow);

  // Glints and ripples, near the surface.
  const sparkle = Skia.PathBuilder.Make();
  const dots = Skia.PathBuilder.Make();
  for (let i = 0; i < 22; i++) {
    const phase = i * 2.39;
    const v = Math.pow(Math.max(0, Math.sin(t * (1 + (i % 7) * 0.26) + phase)), 5);
    if (v < 0.04) continue;
    const x = ((i * 0.381966) % 1) * w + Math.sin(t * 0.3 + phase) * 8;
    const y = surface + 4 + ((i * 0.618) % 1) * ((i * 0.618) % 1) * 62 * k;
    const l = (2.4 + (i % 5) * 0.8) * v * k;
    sparkle.moveTo(x - l, y);
    sparkle.lineTo(x + l, y);
    sparkle.moveTo(x, y - l);
    sparkle.lineTo(x, y + l);
    dots.addCircle(x, y, 0.9);
  }
  const star = Skia.Paint();
  star.setBlendMode(BlendMode.Screen);
  star.setStyle(PaintStyle.Stroke);
  star.setStrokeWidth(0.9);
  star.setStrokeCap(StrokeCap.Round);
  star.setColor(Skia.Color('white'));
  star.setAlphaf(Math.min(1, a * 2.1));
  c.drawPath(sparkle.build(), star);
  const dotPaint = Skia.Paint();
  dotPaint.setColor(Skia.Color('white'));
  dotPaint.setAlphaf(Math.min(1, a * 2.1));
  dotPaint.setBlendMode(BlendMode.Screen);
  c.drawPath(dots.build(), dotPaint);
  const ripple = Skia.Paint();
  ripple.setBlendMode(BlendMode.Screen);
  ripple.setStyle(PaintStyle.Stroke);
  ripple.setStrokeWidth(1.5);
  ripple.setColor(Skia.Color('white'));
  ripple.setAlphaf(a * 0.32);
  for (let j = 0; j < 7; j++) {
    const path = Skia.PathBuilder.Make();
    const y = surface + 10 * k + j * 9 * k;
    for (let x = -6; x <= w + 6; x += 9) {
      const yy = y + Math.sin(x * 0.05 + t * 0.8 + j * 2.1) * 4 + Math.sin(x * 0.13 - t * 0.5 + j) * 2;
      if (x === -6) path.moveTo(x, yy);
      else path.lineTo(x, yy);
    }
    c.drawPath(path.build(), ripple);
  }
}

function drawWeed(c: SkCanvas, w: WeedData, t: number, lift: number) {
  'worklet';
  const n = Math.max(4, Math.floor(w.height / 16));
  const path = Skia.PathBuilder.Make();
  path.moveTo(w.x, w.base);
  const stem = Skia.Paint();
  stem.setAntiAlias(true);
  stem.setStyle(PaintStyle.Stroke);
  stem.setStrokeCap(StrokeCap.Round);
  stem.setStrokeWidth(w.width);
  stem.setColor(w.color);
  const leaf = Skia.Paint();
  leaf.setAntiAlias(true);
  leaf.setColor(w.color);
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const px = w.x + Math.sin(t * 0.9 + w.phase + f * 3) * f * f * 15 * (w.height / 120 + 0.4) * lift;
    const py = w.base - w.height * f;
    path.lineTo(px, py);
    if (w.leaves && f >= 0.12) {
      const side = i % 2 ? 1 : -1;
      c.save();
      c.translate(px + side * 6, py);
      c.rotate(side * (0.5 + Math.sin(t + f * 4) * 0.15) * 57.3, 0, 0);
      c.drawOval(Skia.XYWHRect(-7, -2.8, 14, 5.6), leaf);
      c.restore();
    }
  }
  c.drawPath(path.build(), stem);
}

function drawStage(c: SkCanvas, f: Frame, stage: Stage, ox: number, oy: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const k = w / WORLD_W;
  const pulse = f.sea.pulse;
  c.save();
  c.translate(ox, oy);
  // The whole reef lifts a hair on the beat.
  c.save();
  c.translate(0, h);
  c.scale(1, 1 + pulse * 0.006);
  c.translate(0, -h);
  c.drawPicture(stage.picture);
  c.restore();
  const lift = 1 + pulse * 0.55;
  for (let i = 0; i < stage.weeds.length; i++) drawWeed(c, stage.weeds[i], t, lift);
  for (let i = 0; i < stage.bottles.length; i++) {
    const b = stage.bottles[i];
    const pose = restPose(b.seed, b.i, b.n, w, h - seabedAt(stage.row, 0.5) * h);
    const fx = pose.x / w;
    c.save();
    c.translate(pose.x, h - seabedAt(stage.row, fx < 0 ? 0 : fx > 1 ? 1 : fx) * h - 4);
    c.scale(k * 0.8, k * 0.8);
    c.drawPicture(b.sprite);
    c.restore();
  }

  const members = stage.members;
  const xs: number[] = [];
  const ys: number[] = [];
  const dirs: number[] = [];
  const tails: number[] = [];
  const tilts: number[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (!m.awake) {
      const xf = (m.restI + 0.5) / Math.max(1, m.restN);
      const floor = h - seabedAt(stage.row, xf) * h;
      const r = restPose(m.seed, m.restI, m.restN, w, floor);
      xs.push(r.x);
      ys.push(r.y + Math.sin(t * 0.4 + m.seed) * 1.2);
      dirs.push(m.seed % 2 === 0 ? 1 : -1);
      tails.push(0);
      tilts.push(0);
      continue;
    }
    const lead = m.leader >= 0 ? members[m.leader] : m;
    const pose = swimPose({ seed: lead.seed, speed: lead.speed, scale: lead.scale, band: lead.band, x: lead.x, look: m.look }, t, w, floorY(h) / 0.86);
    let x = pose.x;
    let y = pose.y;
    if (m.look === 'crab' || m.look === 'starfish') {
      const fx = Math.max(0, Math.min(1, x / w));
      y = h - seabedAt(stage.row, fx) * h - 3;
    }
    if (m.leader >= 0) {
      const o = schoolOffset(m.schoolIndex);
      x += o[0] * pose.dir * k;
      y += o[1] * k;
    }
    xs.push(x);
    ys.push(y);
    dirs.push(pose.dir);
    tails.push(Math.sin(t * (m.look === 'turtle' ? 2.2 : m.look === 'whale' ? 1.4 : m.look === 'jelly' ? 1.3 : 9) * (1 + pulse * 0.25) + m.seed));
    tilts.push(pose.tilt);
  }

  // Small fish scatter from a big one passing, and from your finger.
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (!m.awake || m.big || m.look === 'crab' || m.look === 'starfish') continue;
    let px = xs[i];
    let py = ys[i];
    for (let b = 0; b < members.length; b++) {
      if (!members[b].big || !members[b].awake) continue;
      const push = scatter(px, py, xs[b], ys[b], 70 * k);
      px += push[0];
      py += push[1];
    }
    if (f.touch) {
      const push = scatter(px, py, f.touch.x - ox, f.touch.y - oy, f.touch.r);
      px += push[0];
      py += push[1];
    }
    xs[i] = px;
    ys[i] = py;
  }

  const glowing = f.night > 0.4 || stage.row >= 2;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const frames = f.sprites[m.sprite];
    const frame = Math.max(0, Math.min(frames.length - 1, Math.floor(((tails[i] + 1) / 2) * frames.length)));
    let x = xs[i];
    let y = ys[i];
    let s = k * m.scale;
    const lit = f.spotId !== 0 && m.trackId === f.spotId;
    if (lit) {
      x += (w * 0.5 - x) * f.spotMix;
      y += (h * 0.42 - y) * f.spotMix;
      s *= 1 + 0.45 * f.spotMix;
    }
    const n = m.flock > 0 ? m.flock : 1;
    for (let j = 0; j < n; j++) {
      const o = j === 0 ? null : schoolOffset(j);
      c.save();
      c.translate(x + (o ? o[0] * dirs[i] * k : 0), y + (o ? o[1] * k + Math.sin(t * 1.5 + j) * 1.2 : 0));
      if (tilts[i]) c.rotate(tilts[i] * 57.3, 0, 0);
      c.scale(dirs[i] * s, s);
      if (m.halo >= 0 && (glowing || lit)) c.drawPicture(f.halos[m.halo]);
      c.drawPicture(frames[frame]);
      c.restore();
    }
    if (m.rare) {
      // A rare form shimmers: little stars that come and go around it.
      const star = Skia.Paint();
      star.setStyle(PaintStyle.Stroke);
      star.setStrokeWidth(0.9);
      star.setStrokeCap(StrokeCap.Round);
      star.setColor(Skia.Color('white'));
      const path = Skia.PathBuilder.Make();
      for (let j = 0; j < 3; j++) {
        const a = t * 0.8 + (j * 6.283) / 3 + m.seed;
        const v = Math.pow(Math.max(0, Math.sin(t * 2.1 + j * 2 + m.seed)), 3);
        if (v < 0.05) continue;
        const sx = x + Math.cos(a) * 17 * s;
        const sy = y + Math.sin(a) * 13 * s;
        const l = 3.4 * v * k;
        path.moveTo(sx - l, sy);
        path.lineTo(sx + l, sy);
        path.moveTo(sx, sy - l);
        path.lineTo(sx, sy + l);
      }
      c.drawPath(path.build(), star);
    }
  }
  c.restore();
}

function drawBubbles(c: SkCanvas, f: Frame, surface: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const rise = 1 + f.sea.pulse * 0.08;
  const ring = Skia.PathBuilder.Make();
  const shine = Skia.PathBuilder.Make();
  for (let i = 0; i < 22; i++) {
    const speed = 0.035 + ((i * 37) % 11) * 0.0055;
    const prog = (t * speed * rise + ((i * 0.618) % 1)) % 1;
    const y = h + 8 + (surface + 6 - (h + 8)) * prog;
    if (y > h + 6) continue;
    const x = ((i * 0.381966) % 1) * w + Math.sin(t * 1.4 + i * 1.3) * 5;
    const r = 0.9 + ((i * 13) % 9) * 0.31;
    ring.addCircle(x, y, r);
    shine.addCircle(x - r * 0.35, y - r * 0.35, r * 0.24);
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(0.9);
  p.setColor(Skia.Color('white'));
  p.setAlphaf(0.62);
  c.drawPath(ring.build(), p);
  const q = Skia.Paint();
  q.setAntiAlias(true);
  q.setColor(Skia.Color('white'));
  q.setAlphaf(0.8);
  c.drawPath(shine.build(), q);
}

export function drawOcean(c: SkCanvas, f: Frame) {
  'worklet';
  const { width: w, height: h } = f;
  const surface = f.surfaceY - f.dive * f.travel;
  const boxTop = surface - SEA_BASE;
  const here = waterHere(f);

  const wave = Skia.PathBuilder.Make();
  const crest = Skia.PathBuilder.Make();
  for (let x = -6; x <= w + 6; x += 6) {
    const y = boxTop + seaY(x, f.sea, w);
    if (x === -6) {
      wave.moveTo(x, y);
      crest.moveTo(x, y);
    } else {
      wave.lineTo(x, y);
      crest.lineTo(x, y);
    }
  }
  wave.lineTo(w + 6, h + 6);
  wave.lineTo(-6, h + 6);
  wave.close();

  c.save();
  c.clipPath(wave.build(), CLIP_IN, true);
  drawWater(c, f, here, surface);
  drawLight(c, f, here, surface);
  // The scene hangs from the surface, so Home and the ocean move as one.
  const sceneY = surface + (f.travel - f.surfaceY);
  for (let i = 0; i < f.stages.length; i++) {
    const s = f.stages[i];
    const dx = s.col - f.posX;
    const dy = s.row - f.posY;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) continue;
    drawStage(c, f, s, dx * w, dy * h + sceneY);
  }
  drawBubbles(c, f, surface);
  c.restore();

  if (f.dive < 1) {
    const edge = Skia.Paint();
    edge.setAntiAlias(true);
    edge.setStyle(PaintStyle.Stroke);
    edge.setStrokeWidth(1.6);
    edge.setColor(Skia.Color('white'));
    edge.setAlphaf(0.9);
    c.drawPath(crest.build(), edge);
  }
}
