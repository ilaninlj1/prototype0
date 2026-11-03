// One frame of the ocean. Every function here runs on the UI thread and only composes numbers and recorded pictures.
// lib/ocean-draw-rules.test.ts checks that each function in this file is marked as a worklet: a missing mark crashes
// only on a phone, never on the web preview.
//
// The ocean is one world, not pages: the water's color blends, the sea floor runs on unbroken under every biome, and
// specks drift past at different speeds so you feel yourself travel. Biomes dissolve into each other in layers: faint far
// shapes barely move, then what stands in the biome, then what swims in it, then big soft shapes close by, fastest.

import { BlendMode, PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas, type SkPicture, type SkShader } from '@shopify/react-native-skia';

import { blink, scatter, separation, stagePoses, tempoMatches, type StagedMover } from '@/lib/ocean-motion';
import { floorLift, seabedAt, type Rgb } from '@/lib/ocean-scene';
import { SEA_BASE, seaY, type SeaState } from '@/lib/sea-beat';

/** Skia's "intersect" clip. */
const CLIP_IN = 1;
const WORLD_W = 270;

export type StopRow = { top: Rgb; mid: Rgb; bot: Rgb; ray: number };
export type WeedData = { x: number; top: number; base: number; width: number; phase: number; tall: boolean; amp: number; shader: SkShader; front: boolean };
export type AnemoneData = { x: number; y: number; size: number; color: Float32Array };
export type RaftData = { sprite: SkPicture; x: number; y: number; speed: number; phase: number };
export type TendrilData = { x: number; length: number; phase: number; bead: Float32Array; lantern: Float32Array | null };
export type VentData = { x: number; y: number };
export type StageMember = StagedMover & { frames: SkPicture[]; faint: SkPicture; bright: SkPicture; scale: number; rare: boolean; trackId: number; tempo: number; songKey: number; big: boolean; z: number };
export type Stage = {
  col: number;
  row: number;
  picture: SkPicture;
  near: SkPicture | null;
  weeds: WeedData[];
  anemones: AnemoneData[];
  rafts: RaftData[];
  ribbons: boolean;
  tendrils: TendrilData[];
  vents: VentData[];
  members: StageMember[];
  /** Indexes into members, far ones first, so nearer creatures draw in front. */
  order: number[];
  bottles: { sprite: SkPicture; x: number; y: number }[];
};

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
  touchPower: number;
  spotId: number;
  spotMix: number;
  song: { tempo: number; key: number } | null;
  night: number;
  warm: number;
  stops: StopRow[][];
  rest: StopRow;
  stages: Stage[];
  floorTop: Rgb[];
  floorBot: Rgb[];
  rises: number[];
  floorDetail: SkPicture;
  far: (SkPicture | null)[];
};

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function colorOf(c: Rgb): Float32Array {
  'worklet';
  return Skia.Color(`rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`);
}

function wrap(v: number, span: number): number {
  'worklet';
  return ((v % span) + span) % span;
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
  const rayTop = a.ray + (b.ray - a.ray) * fx;
  const rayLow = c.ray + (d.ray - c.ray) * fx;
  const rayHere = rayTop + (rayLow - rayTop) * fy;
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
  const paint = Skia.Paint();
  paint.setBlendMode(BlendMode.Screen);
  // The sun's shafts slide a little as you swim sideways: they're far off, so slower than what's near you.
  const slide = f.posX * w * 0.3;
  for (let i = 0; i < 6; i++) {
    const x0 = wrap((w * 1.2 * (i + 0.3)) / 6 + Math.sin(t * 0.28 + i * 1.7) * 20 * k - slide, w * 1.2) - w * 0.1;
    const rw = (10 + ((i * 37) % 13)) * k;
    const lean = (-34 + ((i * 17) % 18)) * k;
    const rlen = (300 + ((i * 53) % 170)) * k;
    // Each ray fades out along its own length, so none ends in a hard edge.
    paint.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: surface }, { x: 0, y: surface + rlen }, [Skia.Color(tint), Skia.Color(clear)], [0, 1], TileMode.Clamp));
    paint.setAlphaf(a * (0.32 + 0.22 * Math.sin(t * 0.6 + i * 2.1)));
    const ray = Skia.PathBuilder.Make();
    ray.moveTo(x0 - rw, surface);
    ray.lineTo(x0 + rw, surface);
    ray.lineTo(x0 + rw * 2.6 + lean, surface + rlen);
    ray.lineTo(x0 - rw * 2.2 + lean, surface + rlen);
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
    const b = Skia.PathBuilder.Make();
    const y = surface + 10 * k + j * 9 * k;
    for (let x = -6; x <= w + 6; x += 9) {
      const yy = y + Math.sin(x * 0.05 + t * 0.8 + j * 2.1) * 4 + Math.sin(x * 0.13 - t * 0.5 + j) * 2;
      if (x === -6) b.moveTo(x, yy);
      else b.lineTo(x, yy);
    }
    c.drawPath(b.build(), ripple);
  }
}

/** The sand: only at the very bottom, and one shape under every biome, so swimming across it has no seam. */
function drawFloor(c: SkCanvas, f: Frame, sceneY: number) {
  'worklet';
  const { width: w, height: h } = f;
  const dy = (3 - f.posY) * h + sceneY;
  if (dy >= h) return;
  const k = w / WORLD_W;
  const x0 = Math.max(0, Math.min(3, Math.floor(f.posX)));
  const x1 = Math.min(3, x0 + 1);
  const fx = Math.max(0, Math.min(1, f.posX - x0));
  const rise = (f.rises[x0] + (f.rises[x1] - f.rises[x0]) * fx) * 28 * k;
  const scroll = f.posX * w;
  // The floor runs like a coast, dropping away from the reef to Midnight's trench.
  const lift = floorLift(f.posX) * h;
  const b = Skia.PathBuilder.Make();
  for (let sx = -6; sx <= w + 6; sx += 6) {
    const raw = seabedAt((sx + scroll) / w) * h + lift;
    const y = h - (raw < 0.03 * h ? 0.03 * h : raw) - rise + dy;
    if (sx === -6) b.moveTo(sx, y);
    else b.lineTo(sx, y);
  }
  b.lineTo(w + 6, h + dy + 40);
  b.lineTo(-6, h + dy + 40);
  b.close();
  const shape = b.build();
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: dy + h * 0.72 }, { x: 0, y: dy + h }, [colorOf(mix3(f.floorTop[x0], f.floorTop[x1], fx)), colorOf(mix3(f.floorBot[x0], f.floorBot[x1], fx))], [0, 1], TileMode.Clamp));
  c.drawPath(shape, p);
  c.save();
  c.clipPath(shape, CLIP_IN, true);
  c.translate(-wrap(scroll, w), dy - lift);
  c.drawPicture(f.floorDetail);
  c.translate(w, 0);
  c.drawPicture(f.floorDetail);
  c.restore();
}

function drawWeed(c: SkCanvas, weed: WeedData, paint: ReturnType<typeof Skia.Paint>, leaf: ReturnType<typeof Skia.Paint>, f: Frame, row: number, lift: number) {
  'worklet';
  const { height: h, t } = f;
  const step = h / 40;
  paint.setStrokeWidth(weed.width);
  paint.setShader(weed.shader);
  leaf.setShader(weed.shader);
  const b = Skia.PathBuilder.Make();
  // Sampled at fixed depths, so a stem's stretches meet exactly from one place to the next.
  const first = Math.ceil(weed.top / step);
  const last = Math.floor(weed.base / step);
  let started = false;
  for (let i = last; i >= first; i--) {
    const y = i * step;
    const reach = weed.tall ? 1 : Math.pow(1 - (y - weed.top) / Math.max(1, weed.base - weed.top), 2);
    const x = weed.x + Math.sin(t * 0.9 + weed.phase + (row + y / h) * 3.1) * weed.amp * reach * lift;
    if (!started) {
      b.moveTo(x, y);
      started = true;
    } else b.lineTo(x, y);
    if (weed.tall && (row * 40 + i) % 2 === 0) {
      const side = (row * 40 + i) % 4 === 0 ? 1 : -1;
      c.save();
      c.translate(x + side * 6, y);
      c.rotate(side * (0.5 + Math.sin(t + y * 0.01) * 0.15) * 57.3, 0, 0);
      // Leaves vary along the stem, rather than repeating one size.
      const size = 0.75 + 0.35 * Math.sin(y * 0.031 + weed.phase);
      c.drawOval(Skia.XYWHRect(-7 * size, -2.8 * size, 14 * size, 5.6 * size), leaf);
      c.restore();
    }
  }
  if (started) c.drawPath(b.build(), paint);
}

function drawCreatures(c: SkCanvas, f: Frame, stage: Stage, ox: number, oy: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const k = w / WORLD_W;
  const pulse = f.sea.pulse;
  const members = stage.members;
  const poses = stagePoses(members, stage.col, stage.row, t, w, h);

  // Small ones get out of the way of a big one passing. Near your finger some scatter and the curious come closer.
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (!m.awake || m.big) continue;
    for (let b = 0; b < members.length; b++) {
      if (!members[b].big || !members[b].awake) continue;
      const push = scatter(poses[i].x, poses[i].y, poses[b].x, poses[b].y, 70 * k);
      poses[i].x += push[0];
      poses[i].y += push[1];
    }
    if (f.touch && f.touchPower > 0.01) {
      const push = scatter(poses[i].x, poses[i].y, f.touch.x - ox, f.touch.y - oy, f.touch.r);
      const pull = m.seed % 3 === 0 ? -0.6 : 1;
      poses[i].x += push[0] * pull * f.touchPower;
      poses[i].y += push[1] * pull * f.touchPower;
    }
  }

  // Nothing sits on top of anything else: anyone too close nudges apart.
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (members[j].leader === i || members[i].leader === j || (members[i].leader >= 0 && members[i].leader === members[j].leader)) continue;
      const reach = 21 * k * (members[i].scale + members[j].scale) * 0.5;
      const push = separation(poses[i].x, poses[i].y, poses[j].x, poses[j].y, reach);
      if (push[0] === 0 && push[1] === 0) continue;
      poses[i].x += push[0];
      poses[i].y += push[1];
      poses[j].x -= push[0];
      poses[j].y -= push[1];
    }
  }

  const deep = f.night > 0.4 || stage.row >= 2;
  for (let n = 0; n < stage.order.length; n++) {
    const i = stage.order[n];
    const m = members[i];
    const pose = poses[i];
    const dancing = !!f.song && m.awake && tempoMatches(m.tempo, f.song.tempo);
    const inKey = !!f.song && m.songKey >= 0 && m.songKey === f.song.key;
    const tail = dancing ? pulse * 2 - 1 : pose.tail;
    const frame = Math.max(0, Math.min(m.frames.length - 1, Math.floor(((tail + 1) / 2) * m.frames.length)));
    let x = pose.x;
    let y = pose.y - (dancing ? pulse * 6 * k : 0);
    // Far ones a little smaller, near ones a little larger.
    let s = k * m.scale * pose.puff * (dancing ? 1 + 0.07 * pulse : 1) * (0.88 + m.z * 0.12);
    const lit = f.spotId !== 0 && m.trackId === f.spotId;
    // In Midnight they flash to find each other.
    const flashing = stage.col === 3 && m.awake && blink(m.leader >= 0 ? members[m.leader].seed : m.seed, t) > 0.2;
    if (lit) {
      x += (w * 0.5 - x) * f.spotMix;
      y += (h * 0.42 - y) * f.spotMix;
      s *= 1 + 0.45 * f.spotMix;
    }
    const face = Math.abs(pose.face) < 0.03 ? 0.03 : pose.face;
    c.save();
    c.translate(x, y);
    const turn = pose.tilt + pose.spin;
    if (turn !== 0) c.rotate(turn * 57.3, 0, 0);
    // A bright glow always means something: its key, its big move, a flash, the song it's playing. Faint is just the deep.
    const bright = lit || inKey || flashing || pose.flash > 0.2;
    if (bright || deep) {
      c.save();
      c.scale(s, s);
      c.drawPicture(bright ? m.bright : m.faint);
      c.restore();
    }
    c.scale(face * s, s);
    c.drawPicture(m.frames[frame]);
    c.restore();
    if (m.rare) {
      // A rare form shimmers: little stars that come and go around it.
      const star = Skia.Paint();
      star.setStyle(PaintStyle.Stroke);
      star.setStrokeWidth(0.9);
      star.setStrokeCap(StrokeCap.Round);
      star.setColor(Skia.Color('white'));
      const b = Skia.PathBuilder.Make();
      for (let j = 0; j < 3; j++) {
        const a = t * 0.8 + (j * 6.283) / 3 + m.seed;
        const v = Math.pow(Math.max(0, Math.sin(t * 2.1 + j * 2 + m.seed)), 3);
        if (v < 0.05) continue;
        const sx = x + Math.cos(a) * 17 * s;
        const sy = y + Math.sin(a) * 13 * s;
        const l = 3.4 * v * k;
        b.moveTo(sx - l, sy);
        b.lineTo(sx + l, sy);
        b.moveTo(sx, sy - l);
        b.lineTo(sx, sy + l);
      }
      c.drawPath(b.build(), star);
    }
  }
}

function drawAnemone(c: SkCanvas, a: AnemoneData, t: number, lift: number) {
  'worklet';
  const b = Skia.PathBuilder.Make();
  for (let i = 0; i < 13; i++) {
    const spread = -2.5 + (i * 1.9) / 12 - 0.6;
    const sway = Math.sin(t * 1.2 + i * 0.7) * 0.22 * lift;
    const tipX = a.x + Math.cos(spread + sway) * a.size;
    const tipY = a.y + Math.sin(spread + sway) * a.size;
    b.moveTo(a.x, a.y);
    b.quadTo(a.x + Math.cos(spread) * a.size * 0.55, a.y + Math.sin(spread) * a.size * 0.55, tipX, tipY);
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeCap(StrokeCap.Round);
  p.setStrokeWidth(a.size * 0.15);
  p.setColor(a.color);
  c.drawPath(b.build(), p);
}

/** Open blue's currents: long slow ribbons of lighter water flowing across. */
function drawRibbons(c: SkCanvas, f: Frame) {
  'worklet';
  const { width: w, height: h, t } = f;
  const k = w / WORLD_W;
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeCap(StrokeCap.Round);
  p.setColor(Skia.Color('white'));
  for (let i = 0; i < 4; i++) {
    const base = ((i + 0.6) / 4.4) * h;
    const b = Skia.PathBuilder.Make();
    for (let x = -20; x <= w + 20; x += 18) {
      const y = base + Math.sin(x * 0.012 + t * 0.42 + i * 1.7) * 26 * k + Math.sin(x * 0.03 - t * 0.27 + i) * 9 * k;
      if (x === -20) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    const line = b.build();
    p.setStrokeWidth(13 * k);
    p.setAlphaf(0.045);
    c.drawPath(line, p);
    p.setStrokeWidth(3 * k);
    p.setAlphaf(0.09);
    c.drawPath(line, p);
  }
}

/** Midnight's tendrils: strings of cold light hanging out of the dark, some carrying your songs as lanterns. */
function drawTendril(c: SkCanvas, d: TendrilData, f: Frame) {
  'worklet';
  const { width: w, t } = f;
  const k = w / WORLD_W;
  const line = Skia.PathBuilder.Make();
  const beads = Skia.PathBuilder.Make();
  let endX = d.x;
  let endY = 0;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const g = i / steps;
    const y = g * d.length;
    const x = d.x + Math.sin(t * 0.5 + d.phase + g * 2.6) * 11 * k * g;
    if (i === 0) line.moveTo(x, y);
    else line.lineTo(x, y);
    if (i % 2 === 0 && i > 2) beads.addCircle(x, y, 1.1 * k);
    endX = x;
    endY = y;
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(0.9 * k);
  p.setColor(d.bead);
  p.setAlphaf(0.28);
  c.drawPath(line.build(), p);
  const q = Skia.Paint();
  q.setAntiAlias(true);
  q.setColor(d.bead);
  q.setAlphaf(0.75);
  c.drawPath(beads.build(), q);
  if (d.lantern) {
    const glow = 0.75 + 0.25 * Math.sin(t * 1.4 + d.phase);
    const r = Skia.Paint();
    r.setAntiAlias(true);
    r.setColor(d.lantern);
    r.setAlphaf(0.2 * glow);
    c.drawCircle(endX, endY, 11 * k, r);
    r.setAlphaf(glow);
    c.drawCircle(endX, endY, 3.6 * k, r);
  }
}

/** Smoke rising from a vent on the trench floor. */
function drawSmoke(c: SkCanvas, v: VentData, f: Frame) {
  'worklet';
  const { width: w, t } = f;
  const k = w / WORLD_W;
  const p = Skia.Paint();
  p.setAntiAlias(true);
  const solid = Skia.Color('rgba(150,172,188,0.34)');
  const clear = Skia.Color('rgba(150,172,188,0)');
  for (let i = 0; i < 8; i++) {
    const g = wrap(t * 0.14 + i / 8 + v.x * 0.01, 1);
    const x = v.x + Math.sin(g * 6 + i + t * 0.4) * 11 * k * g;
    const y = v.y - g * 150 * k;
    const r = (7 + g * 26) * k;
    // Each puff fades out from its middle, so it reads as smoke and not as a ball.
    p.setShader(Skia.Shader.MakeRadialGradient({ x, y }, r, [solid, clear], [0, 1], TileMode.Clamp));
    p.setAlphaf(1 - g);
    c.drawCircle(x, y, r, p);
  }
}

function drawStage(c: SkCanvas, f: Frame, stage: Stage, dx: number, oy: number, fade: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const k = w / WORLD_W;
  const pulse = f.sea.pulse;
  const layered = fade < 0.995;
  if (layered) {
    const layer = Skia.Paint();
    layer.setAlphaf(fade);
    c.saveLayer(layer);
  }
  // What stands in the biome only drifts a little, what swims in it further: that's what gives it depth.
  const ox = dx * w * 0.55;
  c.save();
  c.translate(dx * w * 0.24, oy);
  if (stage.ribbons) drawRibbons(c, f);
  c.save();
  // The reef breathes on the beat.
  const breath = 1 + pulse * 0.004;
  c.scale(breath, breath);
  c.drawPicture(stage.picture);
  c.restore();
  for (let i = 0; i < stage.tendrils.length; i++) drawTendril(c, stage.tendrils[i], f);
  for (let i = 0; i < stage.vents.length; i++) drawSmoke(c, stage.vents[i], f);
  const lift = 1 + pulse * 0.55;
  for (let i = 0; i < stage.anemones.length; i++) drawAnemone(c, stage.anemones[i], t, lift);
  c.restore();

  c.save();
  c.translate(ox, oy);
  const stem = Skia.Paint();
  stem.setAntiAlias(true);
  stem.setStyle(PaintStyle.Stroke);
  stem.setStrokeCap(StrokeCap.Round);
  const leaf = Skia.Paint();
  leaf.setAntiAlias(true);
  for (let i = 0; i < stage.weeds.length; i++) if (!stage.weeds[i].front) drawWeed(c, stage.weeds[i], stem, leaf, f, stage.row, lift);
  for (let i = 0; i < stage.rafts.length; i++) {
    const r = stage.rafts[i];
    const span = w * 1.3;
    const x = wrap(r.x * span + t * r.speed, span) - w * 0.15;
    c.save();
    c.translate(x, r.y + Math.sin(t * 0.5 + r.phase) * 5 * k);
    c.drawPicture(r.sprite);
    c.restore();
  }
  for (let i = 0; i < stage.bottles.length; i++) {
    const b = stage.bottles[i];
    c.save();
    // Bottles float: they bob and rock a little.
    c.translate(b.x, b.y + Math.sin(t * 0.7 + i * 1.7) * 3 * k);
    c.rotate(Math.sin(t * 0.5 + i) * 7, 0, 0);
    c.scale(k * 0.55, k * 0.55);
    c.drawPicture(b.sprite);
    c.restore();
  }
  if (stage.members.length) drawCreatures(c, f, stage, ox, oy);
  // The kelp in front: creatures pass behind it.
  for (let i = 0; i < stage.weeds.length; i++) if (stage.weeds[i].front) drawWeed(c, stage.weeds[i], stem, leaf, f, stage.row, lift);
  c.restore();

  // Big soft shapes right by you, sweeping past fastest of all.
  if (stage.near) {
    c.save();
    c.translate(dx * w * 1.35, oy + (stage.row - f.posY) * h * 0.35);
    c.drawPicture(stage.near);
    c.restore();
  }
  if (layered) c.restore();
}

/** Faint shapes far behind everything: they barely move, and they repeat as you sink. */
function drawFar(c: SkCanvas, f: Frame, sceneY: number) {
  'worklet';
  const { width: w, height: h } = f;
  for (let col = 0; col < f.far.length; col++) {
    const pic = f.far[col];
    const dx = col - f.posX;
    if (!pic || Math.abs(dx) >= 1) continue;
    const away = Math.abs(dx);
    const layer = Skia.Paint();
    layer.setAlphaf(1 - away * away * (3 - 2 * away));
    c.saveLayer(layer);
    const y = sceneY - wrap(f.posY * h * 0.3, h);
    c.save();
    c.translate(dx * w * 0.12, y);
    c.drawPicture(pic);
    c.translate(0, h);
    c.drawPicture(pic);
    c.restore();
    c.restore();
  }
}

/** Specks drifting in the water, near ones passing faster than far ones: what makes moving feel like moving. */
function drawMotes(c: SkCanvas, f: Frame, surface: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const deep = Math.min(1, f.posY / 2);
  const spanX = w * 1.3;
  const spanY = h * 1.3;
  const near = Skia.PathBuilder.Make();
  const soft = Skia.PathBuilder.Make();
  for (let i = 0; i < 46; i++) {
    const par = 0.35 + (i % 5) * 0.16;
    const x = wrap(((i * 0.381966) % 1) * spanX - f.posX * w * par + Math.sin(t * 0.2 + i) * 6, spanX) - w * 0.15;
    const y = wrap(((i * 0.618034) % 1) * spanY - f.posY * h * par + t * (1 + par) * 1.4, spanY) - h * 0.15;
    if (y < surface) continue;
    const r = 0.6 + (i % 4) * 0.3;
    near.addCircle(x, y, r);
    if (deep > 0.5 && i % 3 === 0) soft.addCircle(x, y, r * 4);
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(deep > 0.5 ? '#bff2f7' : '#ffffff'));
  p.setAlphaf(0.3 + 0.3 * deep);
  c.drawPath(near.build(), p);
  if (deep > 0.5) {
    p.setAlphaf(0.09);
    c.drawPath(soft.build(), p);
  }
}

function drawBubbles(c: SkCanvas, f: Frame, surface: number) {
  'worklet';
  const { width: w, height: h, t } = f;
  const rise = 1 + f.sea.pulse * 0.08;
  const ring = Skia.PathBuilder.Make();
  const shine = Skia.PathBuilder.Make();
  for (let i = 0; i < 14; i++) {
    const speed = 0.035 + ((i * 37) % 11) * 0.0055;
    const prog = (t * speed * rise + ((i * 0.618) % 1)) % 1;
    const y = h + 8 + (surface + 6 - (h + 8)) * prog;
    if (y > h + 6) continue;
    const x = wrap(((i * 0.381966) % 1) * w * 1.1 - f.posX * w * 0.8, w * 1.1) + Math.sin(t * 1.4 + i * 1.3) * 5;
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
  drawFar(c, f, sceneY);
  drawFloor(c, f, sceneY);
  for (let i = 0; i < f.stages.length; i++) {
    const s = f.stages[i];
    const dx = s.col - f.posX;
    const dy = s.row - f.posY;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) continue;
    const away = Math.abs(dx);
    drawStage(c, f, s, dx, dy * h + sceneY, 1 - away * away * (3 - 2 * away));
  }
  drawMotes(c, f, surface);
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
