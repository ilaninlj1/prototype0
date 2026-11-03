// The ocean's still art, recorded once as Skia pictures on the JS thread: what only each biome has, what your listening
// grew there, the layers behind and in front of it, the sea floor's detail, and every creature's frames. The canvas's frame worklet only composes
// these, so a frame stays cheap. Skia is only ever reached through lazySkia, so importing it here is safe on the web.

import { BlendMode, PaintStyle, Skia, StrokeCap, TileMode, createPicture, type SkCanvas, type SkPaint, type SkPathBuilder, type SkPicture, type SkShader } from '@shopify/react-native-skia';

import type { Anatomy } from '@/lib/ocean-anatomy';
import { DEPTHS, WATERS, type Depth, type Kind, type Place, type Water } from '@/lib/ocean-map';
import type { CoralPiece, SandLife } from '@/lib/ocean-person';
import { TOWERS, anemoneSpots, floorAt, hexToRgb, mixRgb, seabedAt, towerRadius, waterStops, type Rgb } from '@/lib/ocean-scene';

const TAU = Math.PI * 2;
const CLIP_IN = 1;

const rng = (seed: number) => {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mixHex = (a: string, b: string, t: number) => hex(mixRgb(hexToRgb(a), hexToRgb(b), t));
const path = () => Skia.PathBuilder.Make();

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
const oval = (c: SkCanvas, x: number, y: number, rx: number, ry: number, paint: SkPaint, rot = 0) => {
  if (!rot) return c.drawOval(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), paint);
  c.save();
  c.translate(x, y);
  c.rotate((rot * 180) / Math.PI, 0, 0);
  c.drawOval(Skia.XYWHRect(-rx, -ry, rx * 2, ry * 2), paint);
  c.restore();
};
const poly = (c: SkCanvas, pts: number[], paint: SkPaint) => {
  const b = path();
  b.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]);
  b.close();
  c.drawPath(b.build(), paint);
};

/* ---------- flora ---------- */

function branch(c: SkCanvas, x: number, y: number, len: number, ang: number, w: number, color: string, r: () => number, d: number) {
  if (d <= 0 || len < 4) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  const b = path();
  b.moveTo(x, y);
  b.quadTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x2, y2);
  c.drawPath(b.build(), line(color, w));
  const n = d > 2 ? 3 : 2;
  for (let i = 0; i < n; i++) branch(c, x2, y2, len * (0.62 + r() * 0.14), ang + (i - (n - 1) / 2) * (0.55 + r() * 0.25), w * 0.72, color, r, d - 1);
}
function fan(c: SkCanvas, x: number, y: number, rad: number, color: string) {
  const rib = line(color, 1.5);
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI + 0.25 + (i * (Math.PI - 0.5)) / 12;
    const b = path();
    b.moveTo(x, y);
    b.quadTo(x + Math.cos(a) * rad * 0.5, y + Math.sin(a) * rad * 0.7, x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    c.drawPath(b.build(), rib);
  }
  const web = line(color, 0.8, 0.6);
  for (let k = 1; k < 4; k++) {
    const rr = (rad * k) / 4;
    const b = path();
    b.addArc(Skia.XYWHRect(x - rr, y - rr, rr * 2, rr * 2), 194, 152);
    c.drawPath(b.build(), web);
  }
}
function brain(c: SkCanvas, x: number, y: number, rx: number, ry: number, color: string, dark: string) {
  const b = path();
  b.addArc(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), 180, 180);
  b.close();
  const dome = b.build();
  c.drawPath(dome, fill(color));
  c.save();
  c.clipPath(dome, CLIP_IN, true);
  const groove = line(dark, 1.2);
  for (let j = 0; j < 5; j++) {
    const g = path();
    for (let i = -rx; i <= rx; i += 3) {
      const yy = y - (ry * (j + 0.5)) / 5 + Math.sin(i * 0.35 + j * 1.7) * 2.2;
      if (i === -rx) g.moveTo(x + i, yy);
      else g.lineTo(x + i, yy);
    }
    c.drawPath(g.build(), groove);
  }
  c.restore();
}
function tubes(c: SkCanvas, x: number, y: number, color: string, lip: string, r: () => number) {
  for (let i = 0; i < 4; i++) {
    const tx = x + i * 8 + r() * 3;
    const h = 14 + r() * 20;
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(tx - 3.6, y - h, 7.2, h + 4), 3.6, 3.6), fill(color));
    oval(c, tx, y - h, 3.6, 1.6, fill(lip));
  }
}

const ROCK: Record<Water, string> = { reef: '#b3a68f', kelp: '#4c5346', blue: '#2f4663', midnight: '#10142a' };
const PALE = ['#e4eeee', '#dbe7e8', '#d3e0e2', '#d6e2e2', '#d8e4e5', '#e0eaeb'];
const DEEP: number[] = [0, 0.3, 0.55, 0.72, 0.78];
const ABYSS: Record<Water, string> = { reef: '#04203a', kelp: '#04221f', blue: '#041a40', midnight: '#020818' };

const toneAt = (hexColor: string, water: Water, row: number) => mixHex(hexColor, ABYSS[water], DEEP[Math.max(0, Math.min(4, row))]);

/** A place's color for things with no ground: pale, and dimmer the deeper it sits. */
const paled = (hexColor: string, place: Place) => toneAt(hexColor, place.water, DEPTHS.indexOf(place.depth));

/** Colors running top to bottom of a place, meeting the next place's so nothing changes abruptly as you sink. */
function fadingDown(hexColor: string, water: Water, row: number, height: number): SkShader {
  return Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: height }, [Skia.Color(toneAt(hexColor, water, row)), Skia.Color(toneAt(hexColor, water, row + 1))], [0, 1], TileMode.Clamp);
}

export type Weed = { x: number; top: number; base: number; width: number; phase: number; tall: boolean; amp: number; shader: SkShader; front: boolean };
export type Anemone = { x: number; y: number; size: number; color: Float32Array };
export type Raft = { sprite: SkPicture; x: number; y: number; speed: number; phase: number };
export type Tendril = { x: number; length: number; phase: number; bead: Float32Array; lantern: Float32Array | null };
export type Vent = { x: number; y: number };
export type Trail = { x: number; y0: number; y1: number; color: string; seed: number };

/** How many of your songs get live, swaying growth in one place. The rest are still, behind them. */
const LIVE_GROWTH = 8;
const KELP_COLOR = '#b4bf8e';

/** Kelp from the floor to the surface: the same stems at every depth, in stretches that meet, so you sink past them. */
export function kelpFor(place: Place, width: number, height: number, songColors: { color: string; seed: number }[]): Weed[] {
  const row = DEPTHS.indexOf(place.depth);
  const k = width / 270;
  const out: Weed[] = [];
  const stem = (x: number, phase: number, tip: number, wide: number, color: string, front: boolean) => {
    const floor = height - floorAt(1, x / width) * height + 8;
    out.push({ x, top: row === 0 ? height * tip : 0, base: row === 3 ? floor : height, width: wide * k, phase, tall: true, amp: 15 * k, shader: fadingDown(color, 'kelp', row, height), front });
  };
  const r = rng(137);
  for (let i = 0; i < 5; i++) stem((0.1 + r() * 0.8) * width, r() * 9, 0.14 + r() * 0.2, 3.4, KELP_COLOR, i % 2 === 0);
  // Every song you heard here and let go adds a stem in its color, so the forest thickens as you listen.
  songColors.slice(0, 10).forEach((s) => {
    const f = rng(s.seed + 5);
    stem((0.06 + f() * 0.88) * width, f() * 9, 0.1 + f() * 0.3, 2.6, s.color, f() < 0.35);
  });
  return out;
}

/** The reef's anemones in a level: they sway live, and clownfish nest in them. */
export function anemonesFor(place: Place, width: number, height: number): Anemone[] {
  if (place.water !== 'reef') return [];
  const row = DEPTHS.indexOf(place.depth);
  const k = width / 270;
  const tone = waterTone(place);
  return anemoneSpots(row).map((s) => ({ x: s.x * width, y: s.y * height, size: 11 * k, color: Skia.Color(mixHex(toneAt('#f0d8de', 'reef', row), tone, 0.25)) }));
}

/** A clump of drifting seaweed, hanging its fronds under it. */
export function recordRaft(color: string, k: number): SkPicture {
  return createPicture(
    (c) => {
      const r = rng(hexToRgb(color)[0] * 31 + 7);
      // A wide tangled mat with little air bladders holding it up, nothing like a jellyfish's bell.
      const frond = line(mixHex(color, '#1b2a33', 0.2), 1.3 * k, 0.9);
      for (let i = 0; i < 14; i++) {
        const b = path();
        const x = (r() - 0.5) * 44 * k;
        const y = (r() - 0.5) * 6 * k;
        b.moveTo(x, y);
        b.quadTo(x + (r() - 0.5) * 14 * k, y + 5 * k, x + (r() - 0.5) * 18 * k, y + (r() * 9 - 2) * k);
        c.drawPath(b.build(), frond);
      }
      for (let i = 0; i < 16; i++) oval(c, (r() - 0.5) * 42 * k, (r() - 0.5) * 7 * k, 1.8 * k, 1.8 * k, fill(color));
    },
    Skia.XYWHRect(-40 * k, -10 * k, 80 * k, 60 * k)
  );
}

/** Open blue has nothing solid: just rafts drifting by. Pale ones near the top, and yours, wherever you heard them. */
export function raftsFor(place: Place, width: number, height: number, coral: CoralPiece[], art: (color: string) => SkPicture): Raft[] {
  if (place.water !== 'blue') return [];
  const row = DEPTHS.indexOf(place.depth);
  const out: Raft[] = [];
  if (row === 0) {
    const pale = toneAt('#d6e2d8', 'blue', 0);
    out.push({ sprite: art(pale), x: 0.25, y: height * 0.17, speed: 4, phase: 1 });
    out.push({ sprite: art(pale), x: 0.8, y: height * 0.28, speed: 3, phase: 4 });
  }
  coral.slice(0, LIVE_GROWTH).forEach((p) => {
    const f = rng(p.seed + 9);
    out.push({ sprite: art(p.color), x: f(), y: height * (0.15 + f() * 0.62), speed: 2.5 + f() * 3, phase: f() * 6 });
  });
  return out;
}

/** Midnight's glowing tendrils, hanging out of the dark above. Your songs here are lanterns on them. */
export function tendrilsFor(place: Place, width: number, height: number, coral: CoralPiece[]): Tendril[] {
  if (place.water !== 'midnight' || place.depth === 'buried') return [];
  const row = DEPTHS.indexOf(place.depth);
  const bead = Skia.Color('#8fe3ea');
  const r = rng(61 + row * 17);
  const out: Tendril[] = [];
  for (let i = 0; i < 5; i++) out.push({ x: (0.06 + r() * 0.88) * width, length: height * (0.35 + r() * 0.5), phase: r() * 9, bead, lantern: null });
  coral.slice(0, LIVE_GROWTH).forEach((p) => {
    const f = rng(p.seed + 13);
    out.push({ x: (0.05 + f() * 0.9) * width, length: height * (0.3 + f() * 0.5), phase: f() * 9, bead, lantern: Skia.Color(p.color) });
  });
  return out;
}

/** Smoke rises from Midnight's vents, on the floor of the trench. */
export function ventsFor(place: Place, width: number, height: number): Vent[] {
  if (place.water !== 'midnight' || place.depth !== 'buried') return [];
  return [0.3, 0.68].map((fx) => ({ x: fx * width, y: height - floorAt(3, fx) * height - 26 * (width / 270) }));
}

function coralForm(c: SkCanvas, form: number, x: number, y: number, k: number, size: number, color: string, f: () => number, lean = 0) {
  if (form === 0) branch(c, x, y, 22 * k * size, -Math.PI / 2 + lean, 4.5 * k * size, color, f, 4);
  else if (form === 1) fan(c, x, y, 30 * k * size, color);
  else brain(c, x, y, 20 * k * size, 14 * k * size, color, mixHex(color, '#1b2a33', 0.32));
}

/** The water's color in a place, which distant things fade toward. */
export function waterTone(place: Place): string {
  return waterStops(place.water, place.depth, { night: 0, warm: 0 }).mid;
}

/** How much of the reef draws at once in a place: the newest, and enough to look like a reef without crowding. */
const REEF_PIECES = 20;

/**
 * The reef: there's no rock. Faint outlines of towers rise from below, and the coral is what you listened to, so a reef
 * only grows where you've been. Coral sits back in the water's color, so the creatures stay in front.
 */
function drawReef(c: SkCanvas, place: Place, width: number, height: number, coral: CoralPiece[], k: number) {
  const row = DEPTHS.indexOf(place.depth);
  const tone = waterTone(place);
  // The outlines' color runs into the next level's, so no band crosses the screen as you sink past one.
  const below = waterTone({ water: 'reef', depth: DEPTHS[Math.min(3, row + 1)] });
  const ghost = Skia.Paint();
  ghost.setAntiAlias(true);
  ghost.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: height }, [Skia.Color(mixHex(tone, '#ffffff', 0.16)), Skia.Color(mixHex(below, '#ffffff', 0.16))], [0, 1], TileMode.Clamp));
  ghost.setAlphaf(0.36);
  TOWERS.forEach((t, i) => {
    const left: number[] = [];
    const right: number[] = [];
    // Exactly one level tall: overlapping the next one would double the see-through color into a line.
    for (let y = 0; y <= height; y = y === height ? height + 1 : Math.min(height, y + 4)) {
      const radius = towerRadius(i, row + y / height);
      if (radius <= 0) continue;
      left.push(t.cx * width - radius * width, y);
      right.push(t.cx * width + radius * width, y);
    }
    if (left.length < 4) return;
    const b = path();
    b.moveTo(left[0], left[1]);
    for (let j = 2; j < left.length; j += 2) b.lineTo(left[j], left[j + 1]);
    for (let j = right.length - 2; j >= 0; j -= 2) b.lineTo(right[j], right[j + 1]);
    b.close();
    c.drawPath(b.build(), ghost);
  });
  // A little pale growth on each outline, the same for everyone.
  const r = rng(19 + row * 97);
  const place3 = (f: () => number, tower: number, yf: number) => {
    const radius = towerRadius(tower, row + yf);
    return radius > 0.015 ? { x: (TOWERS[tower].cx + (f() * 2 - 1) * radius * 0.85) * width, y: yf * height } : null;
  };
  for (let i = 0; i < 4; i++) {
    const at = place3(r, i % 3, 0.15 + r() * 0.7);
    if (at) coralForm(c, i % 3, at.x, at.y, k, 0.55, mixHex(toneAt(PALE[i], 'reef', row), tone, 0.3), r, 0);
  }
  // Your coral, packed onto the towers, lower pieces in front.
  const spots = coral.slice(0, REEF_PIECES).flatMap((piece) => {
    const f = rng(piece.seed + 3);
    for (let tries = 0; tries < 4; tries++) {
      const at = place3(f, (piece.seed + tries) % 3, 0.06 + f() * 0.88);
      if (at) return [{ piece, f, ...at }];
    }
    return [];
  });
  spots.sort((a, b) => a.y - b.y);
  const sink = 0.26 + [0, 0.08, 0.16, 0.22][row];
  for (const s of spots) coralForm(c, s.piece.form, s.x, s.y, k, 0.62 * s.piece.size, mixHex(s.piece.color, tone, sink), s.f, (s.f() - 0.5) * 0.5);
}

function drawBones(c: SkCanvas, width: number, height: number, k: number) {
  // A whale fall on the trench floor: a spine and its ribs.
  const fx = 0.5;
  const y = height - floorAt(3, fx) * height - 2;
  const bone = line('#5b6d84', 2.4 * k, 0.75);
  const spine = path();
  spine.moveTo(width * 0.34, y);
  spine.quadTo(width * 0.5, y - 5 * k, width * 0.62, y + 1 * k);
  c.drawPath(spine.build(), bone);
  for (let i = 0; i < 7; i++) {
    const x = width * (0.37 + i * 0.035);
    const b = path();
    b.moveTo(x, y - 2 * k);
    b.quadTo(x + 6 * k, y - 20 * k, x - 3 * k, y - (24 - i) * k);
    c.drawPath(b.build(), bone);
  }
}

function drawVent(c: SkCanvas, x: number, y: number, k: number) {
  poly(c, [x - 11 * k, y + 28 * k, x - 4 * k, y, x + 4 * k, y, x + 11 * k, y + 28 * k], fill('#1b2038'));
  oval(c, x, y, 4 * k, 1.6 * k, fill('#6fd2db', 0.55));
}

/** Everything still about a place: what only this biome has, and what your listening grew in it. */
export function recordPlace(place: Place, width: number, height: number, coral: CoralPiece[], sand: SandLife | null, trails: Trail[]): SkPicture {
  const row = DEPTHS.indexOf(place.depth);
  const col = WATERS.indexOf(place.water);
  const k = width / 270;
  const floor = (x: number) => height - floorAt(col, x / width) * height + 3;
  return createPicture(
    (c) => {
      if (place.water === 'reef') drawReef(c, place, width, height, coral, k);
      if (place.water === 'blue') {
        // Your songs past what can drift live: small still tufts.
        coral.slice(LIVE_GROWTH).forEach((p) => {
          const f = rng(p.seed + 9);
          oval(c, f() * width, height * (0.1 + f() * 0.75), 5 * k, 1.8 * k, fill(p.color, 0.7));
        });
      }
      if (place.water === 'midnight' && row === 3) {
        drawBones(c, width, height, k);
        for (const fx of [0.3, 0.68]) drawVent(c, fx * width, height - floorAt(3, fx) * height - 26 * k, k);
        // Songs you heard here and let go: tube worms around the vents, each plume in its song's color.
        coral.forEach((p) => {
          const f = rng(p.seed + 3);
          const x = (0.1 + f() * 0.8) * width;
          const h = (14 + f() * 16) * k * p.size;
          const base = floor(x) + 2;
          c.drawLine(x, base, x, base - h, line('#e6e2d8', 2.2 * k));
          oval(c, x, base - h, 4.2 * k, 4.2 * k, fill(p.color));
          oval(c, x, base - h, 8 * k, 8 * k, fill(p.color, 0.18));
        });
      }
      if (place.water === 'kelp' && row === 3) {
        // Where the kelp holds on, on the floor.
        const r = rng(137);
        for (let i = 0; i < 5; i++) {
          const x = (0.1 + r() * 0.8) * width;
          r();
          r();
          oval(c, x, floor(x) + 1, 9 * k, 5 * k, fill(toneAt(ROCK.kelp, 'kelp', 3)));
        }
      }
      if (place.water === 'reef' && row === 3) {
        // Coral rubble where the towers meet the sand.
        const r = rng(71);
        for (let i = 0; i < 14; i++) {
          const x = r() * width;
          oval(c, x, floor(x) + 2, (3 + r() * 5) * k, (2 + r() * 2) * k, fill(toneAt('#cfc3ab', 'reef', 3), 0.8));
        }
      }
      // What you heard and let go settles on the sea floor, one colored speck per song.
      if (row === 3)
        for (const speck of sand?.specks ?? []) {
          const f = rng(speck.seed + 11);
          const x = f() * width;
          const y = floor(x) + 4 + f() * Math.max(2, height - floor(x) - 6);
          oval(c, x, y, 0.9 + f() * 0.8, 0.9 + f() * 0.8, fill(speck.color, 0.78));
        }
      // A faint trail back to where you found each fish that has climbed.
      for (const t of trails) {
        const dot = fill(t.color, 0.28);
        for (let y = Math.max(t.y0, -4); y <= Math.min(t.y1, height + 4); y += 7 * k) {
          oval(c, t.x + Math.sin(((row * height + y) / height) * 2.4 + t.seed) * 10 * k, y, 1.1 * k, 1.1 * k, dot);
        }
      }
    },
    { width, height }
  );
}

/** A tall soft shape that repeats exactly once per screen height, so sliding it down one screen looks the same. */
function farColumn(x: number, half: number, sway: number, phase: number, height: number) {
  const b = path();
  const steps = 48;
  const at = (i: number) => (i / steps) * height * 2;
  const wobble = (y: number) => Math.sin((y / height) * TAU + phase) * sway;
  b.moveTo(x - half + wobble(0), 0);
  for (let i = 1; i <= steps; i++) b.lineTo(x - half + wobble(at(i)), at(i));
  for (let i = steps; i >= 0; i--) b.lineTo(x + half + wobble(at(i)), at(i));
  b.close();
  return b.build();
}

/**
 * The far layer: faint shapes well behind everything, which barely move. Two screens tall and drawn once, so nothing
 * meets anything and no line can show.
 */
export function recordFar(water: Water, width: number, height: number): SkPicture | null {
  // The reef's own faint towers do this job, and Open blue has nothing, on purpose.
  if (water === 'blue' || water === 'reef') return null;
  const k = width / 270;
  return createPicture(
    (c) => {
      const r = rng(water.length * 53);
      if (water === 'kelp') {
        const tone = fill('#04283a', 0.12);
        for (let i = 0; i < 12; i++) c.drawPath(farColumn(r() * width * 1.1, 1.2 * k, 8 * k, r() * TAU, height), tone);
      } else {
        const tone = fill('#000000', 0.08);
        for (let i = 0; i < 4; i++) c.drawPath(farColumn(r() * width, (24 + r() * 16) * k, 12 * k, r() * TAU, height), tone);
      }
    },
    { width: width * 1.3, height: height * 2 }
  );
}

/** The near layer: big soft shapes right by you, which sweep past fastest. Layered strokes stand in for being out of focus. */
export function recordNear(water: Water, width: number, height: number): SkPicture | null {
  if (water !== 'kelp') return null;
  const k = width / 270;
  const soft = (c: SkCanvas, b: SkPathBuilder, wide: number) => {
    const shape = b.build();
    for (const [w, a] of [[1.6, 0.04], [1.25, 0.06], [1, 0.08]] as const) c.drawPath(shape, line('#032430', wide * w, a));
  };
  return createPicture(
    (c) => {
      const a = path();
      a.moveTo(width * 1.02, height * 1.02);
      a.cubicTo(width * 0.9, height * 0.72, width * 1.04, height * 0.5, width * 0.93, height * 0.28);
      soft(c, a, 13 * k);
      const b = path();
      b.moveTo(-width * 0.03, height * 0.75);
      b.cubicTo(width * 0.06, height * 0.6, -width * 0.02, height * 0.46, width * 0.04, height * 0.34);
      soft(c, b, 11 * k);
    },
    { width, height }
  );
}

/** The sand's grain and ripples, one screen wide and repeating, in a tone that sits on any biome's sand. */
export function recordFloorDetail(width: number, height: number): SkPicture {
  return createPicture(
    (c) => {
      const r = rng(19);
      const grain = fill('#000000', 0.1);
      for (let i = 0; i < 170; i++) {
        const x = r() * width;
        const top = height - seabedAt(x / width) * height;
        c.drawRect(Skia.XYWHRect(x, top + 6 + r() * (height - top), 1.2, 1.2), grain);
      }
      const ripple = line('#000000', 1, 0.06);
      for (let i = 0; i < 7; i++) {
        const b = path();
        for (let x = 0; x <= width; x += 10) {
          const yy = height - seabedAt(x / width) * height + 14 + i * 12 + Math.sin((x / width) * TAU * 2 + i) * 3;
          if (x === 0) b.moveTo(x, yy);
          else b.lineTo(x, yy);
        }
        c.drawPath(b.build(), ripple);
      }
    },
    { width, height: height * 1.2 }
  );
}

/* ---------- creatures ---------- */

export type SpritePalette = { body: string; back: string; belly: string; fin: string; accent: string };

/** How far each level's creatures sink into the water's color, and how much haze a far one adds. */
const LEVEL_HAZE = [0, 0.1, 0.22, 0.32];
const Z_HAZE = [0.2, 0.08, 0];

/**
 * A song's creature: its print's colors, as vivid as you listened, and tinted by the water around it so it sits in the
 * scene. Darker on top and lighter underneath, the way real fish are.
 */
export function songPalette(color: string, accent: string, vivid: number, tone: string, row: number, z: number): SpritePalette {
  const pale = '#c9d9de';
  const haze = LEVEL_HAZE[row] + Z_HAZE[z];
  const body = mixHex(mixHex(pale, color, Math.min(1, vivid * 1.05)), tone, haze);
  return {
    body,
    back: mixHex(body, '#0c2733', 0.34),
    belly: mixHex(body, '#ffffff', 0.42),
    fin: mixHex(body, '#0c2733', 0.18),
    accent: mixHex(mixHex(pale, accent, Math.min(1, vivid * 1.05)), tone, haze),
  };
}

/** A small dark eye with one point of light. */
const eye = (c: SkCanvas, x: number, y: number, r = 1.2) => {
  oval(c, x, y, r, r, fill('#0b1a22'));
  oval(c, x + r * 0.3, y - r * 0.3, r * 0.3, r * 0.3, fill('#ffffff', 0.85));
};

/** A shape shaded down its height, dark back to light belly. */
function countershaded(top: number, bottom: number, p: SpritePalette, alpha = 1): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: top }, { x: 0, y: bottom }, [Skia.Color(p.back), Skia.Color(p.body), Skia.Color(p.belly)], [0, 0.5, 1], TileMode.Clamp));
  paint.setAlphaf(alpha);
  return paint;
}

/** A line that narrows along its length, for tails and long bodies. */
function taper(c: SkCanvas, pts: number[], from: number, to: number, color: string, alpha = 1) {
  const n = pts.length / 2 - 1;
  for (let i = 0; i < n; i++) {
    const g = i / Math.max(1, n - 1);
    c.drawLine(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], line(color, from + (to - from) * g, alpha));
  }
}

function tailFin(c: SkCanvas, x: number, a: Anatomy, p: SpritePalette, w: number, size: number) {
  const s = size * (0.8 + a.fin * 0.3);
  const lift = w * s * 0.5;
  const paint = fill(p.fin, 0.92);
  const b = path();
  b.moveTo(x + 1.5, 0);
  if (a.tail === 'fork') {
    b.quadTo(x - s * 0.5, -s * 0.2 + lift, x - s, -s * 0.85 + lift);
    b.quadTo(x - s * 0.62, lift, x - s, s * 0.85 + lift);
    b.quadTo(x - s * 0.5, s * 0.2 + lift, x + 1.5, 0);
  } else if (a.tail === 'round') {
    b.quadTo(x - s * 1.25, -s * 0.95 + lift, x - s, lift);
    b.quadTo(x - s * 1.25, s * 0.95 + lift, x + 1.5, 0);
  } else {
    b.quadTo(x - s * 0.7, -s * 0.5 + lift, x - s * 1.1, lift);
    b.quadTo(x - s * 0.7, s * 0.5 + lift, x + 1.5, 0);
  }
  c.drawPath(b.build(), paint);
}

function fishShape(L: number, H: number) {
  const b = path();
  b.moveTo(L, 0);
  b.cubicTo(L * 0.62, -H * 1.12, -L * 0.3, -H * 1.04, -L, -H * 0.1);
  b.lineTo(-L, H * 0.1);
  b.cubicTo(-L * 0.3, H * 1.04, L * 0.62, H * 1.12, L, 0);
  b.close();
  return b.build();
}

/** A fish's markings, kept inside its body. */
function markings(c: SkCanvas, a: Anatomy, p: SpritePalette, shape: ReturnType<typeof fishShape>, L: number, H: number) {
  c.save();
  c.clipPath(shape, CLIP_IN, true);
  const mark = fill(p.accent, 0.9);
  if (a.pattern === 'stripes') {
    const n = Math.max(1, a.marks);
    const gap = (L * 1.4) / (n + 1);
    for (let i = 1; i <= n; i++) {
      const b = path();
      const x = -L * 0.7 + gap * i;
      b.moveTo(x, -H * 1.1);
      b.quadTo(x + L * 0.1, 0, x, H * 1.1);
      c.drawPath(b.build(), line(p.accent, Math.max(1.4, L * 0.16), 0.9));
    }
  } else if (a.pattern === 'spots') {
    const f = rng(a.marks * 31 + 7);
    for (let i = 0; i < 4 + a.marks * 2; i++) oval(c, (f() * 1.5 - 0.8) * L, (f() * 1.1 - 0.75) * H, 0.9, 0.9, mark);
  } else if (a.pattern === 'lines') {
    const glow = line(p.accent, 0.8, 0.95);
    for (let i = 0; i < 2 + (a.marks % 2); i++) c.drawLine(-L, -H * 0.42 + i * H * 0.42, L, -H * 0.42 + i * H * 0.42, glow);
  } else if (a.pattern === 'band') {
    c.drawRect(Skia.XYWHRect(-L * 0.15, -H * 1.1, L * 0.42, H * 2.2), mark);
  }
  c.restore();
}

function fish(c: SkCanvas, a: Anatomy, p: SpritePalette, w: number, L0: number, H0: number, swing: number) {
  const L = L0 * a.length;
  const H = H0 * a.depth;
  tailFin(c, -L + 1, a, p, w, L0 * 0.62);
  const f = a.fin;
  const top = path();
  top.moveTo(-L * 0.5, -H * 0.82);
  top.quadTo(-L * 0.15 + swing, -H - 5.5 * f, L * 0.38, -H * 0.8);
  top.close();
  c.drawPath(top.build(), fill(p.fin, 0.9));
  const low = path();
  low.moveTo(-L * 0.3, H * 0.84);
  low.quadTo(-L * 0.1 - swing, H + 3.4 * f, L * 0.22, H * 0.8);
  low.close();
  c.drawPath(low.build(), fill(p.fin, 0.8));
  const shape = fishShape(L, H);
  c.drawPath(shape, countershaded(-H, H, p));
  markings(c, a, p, shape, L, H);
  // The side fin beats.
  oval(c, L * 0.1, H * 0.22, 3 * f, 1.5, fill(p.fin, 0.85), 0.5 + swing * 0.4);
  eye(c, L * 0.6, -H * 0.22, Math.max(0.9, H0 * 0.16));
  if (a.voice) oval(c, L * 0.9, H * 0.14, 1, 1, fill('#0b1a22', 0.75));
}

const FRAMES = 6;

/** One song's creature, as frames from one end of its stroke to the other. */
export function recordCreature(kind: Kind, a: Anatomy, p: SpritePalette): SkPicture[] {
  const out: SkPicture[] = [];
  const box = 90;
  for (let i = 0; i < FRAMES; i++) {
    const swing = (i / (FRAMES - 1)) * 2 - 1;
    out.push(
      createPicture(
        (c) => {
          drawKind(c, kind, a, swing * 0.35, swing, p);
        },
        Skia.XYWHRect(-box, -box, box * 2, box * 2)
      )
    );
  }
  return out;
}

function drawKind(c: SkCanvas, kind: Kind, a: Anatomy, w: number, swing: number, p: SpritePalette) {
  switch (kind) {
    case 'clown':
      fish(c, a, p, w, 11, 7, swing);
      break;
    case 'darter':
      fish(c, a, p, w, 12, 3.6, swing);
      break;
    case 'drifter': {
      const shape = fishShape(10, 3.2);
      tailFin(c, -9, a, p, w, 5);
      c.drawPath(shape, countershaded(-3.2, 3.2, p));
      eye(c, 6.5, -0.6, 0.9);
      break;
    }
    case 'turtle': {
      const f = swing * 0.55;
      const flipper = fill(p.fin);
      oval(c, 7, -7.5, 7.5 * a.fin, 2.4, flipper, -0.8 + f);
      oval(c, 7, 7.5, 7.5 * a.fin, 2.4, flipper, 0.8 - f);
      oval(c, -9.5, -5, 4.2, 1.9, flipper, 0.7 - f * 0.5);
      oval(c, -9.5, 5, 4.2, 1.9, flipper, -0.7 + f * 0.5);
      oval(c, 12.5, 0, 4, 2.9, fill(p.fin));
      const L = 11 * a.length;
      const R = 8.5 * a.depth;
      oval(c, 0, 0, L, R, countershaded(-R, R, p));
      // The shell's plates are its key: a row of soft scutes, not a grid.
      const n = 2 + Math.max(1, a.marks);
      for (let i = 0; i < n; i++) oval(c, -L * 0.62 + (i * L * 1.24) / Math.max(1, n - 1), 0, L / (n + 0.6), R * 0.46, fill(p.accent, 0.75));
      eye(c, 13.6, -1, 0.8);
      break;
    }
    case 'jelly': {
      const squeeze = 1 + swing * 0.08;
      const R = 9.5 * a.depth;
      // Long thin strands from the song's key, and two thicker arms.
      const strand = line(p.body, 0.8, 0.55);
      const len = 13 + a.fin * 6;
      for (let i = 0; i < a.strands; i++) {
        const x = -R * 0.8 + (i * R * 1.6) / Math.max(1, a.strands - 1);
        const b = path();
        b.moveTo(x, 0);
        b.cubicTo(x + swing * 2, len * 0.4, x - swing * 3, len * 0.7, x + swing * 2, len + (i % 2) * 4);
        c.drawPath(b.build(), strand);
      }
      for (const side of [-1, 1]) {
        const b = path();
        b.moveTo(side * R * 0.25, 0);
        b.cubicTo(side * R * 0.4 + swing * 2, len * 0.3, side * R * 0.1 - swing * 2, len * 0.45, side * R * 0.3 + swing, len * 0.62);
        c.drawPath(b.build(), line(p.accent, 1.6, 0.6));
      }
      const bell = path();
      bell.addArc(Skia.XYWHRect(-R * squeeze, -R / squeeze, 2 * R * squeeze, (2 * R) / squeeze), 180, 180);
      bell.close();
      const glass = Skia.Paint();
      glass.setAntiAlias(true);
      glass.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: -R }, { x: 0, y: 0 }, [Skia.Color(p.belly), Skia.Color(p.body)], [0, 1], TileMode.Clamp));
      glass.setAlphaf(0.86);
      c.drawPath(bell.build(), glass);
      break;
    }
    case 'puffer': {
      const R = 9.5;
      const spike = line(p.back, 0.9, 0.9);
      for (let i = 0; i < a.spines; i++) {
        const t = (i * TAU) / a.spines;
        c.drawLine(Math.cos(t) * R * 0.92, Math.sin(t) * R * 0.92, Math.cos(t) * (R + 2.6), Math.sin(t) * (R + 2.6), spike);
      }
      tailFin(c, -R + 1, a, p, w, 4.5);
      oval(c, 0, 0, R * 1.04, R, countershaded(-R, R, p));
      oval(c, 2.5, -R * 0.1, 3 * a.fin, 1.5, fill(p.fin, 0.85), 0.5 + swing * 0.4);
      eye(c, 5, -3, 1.3);
      if (a.voice) oval(c, 9, 1, 1, 1, fill('#0b1a22', 0.75));
      break;
    }
    case 'manta': {
      // Wings that really flap; the second color runs down its back.
      const flap = swing * 6;
      const L = 12.5 * a.length;
      const wing = (side: number) => {
        const tipY = side * (14 + a.fin * 5) + flap * side * 0.5;
        const b = path();
        b.moveTo(L * 0.6, side * 1);
        b.quadTo(L * 0.25, tipY * 0.8, -L * 0.25, tipY);
        b.quadTo(-L * 0.3, tipY * 0.4, -L * 0.7, side * 2);
        b.close();
        c.drawPath(b.build(), countershaded(side < 0 ? tipY : 0, side < 0 ? 0 : tipY, p));
      };
      wing(-1);
      wing(1);
      taper(c, [-L * 0.7, 0, -L * 1.1, swing * 2, -L * 1.5, swing * 4, -L * 1.9, swing * 2, -L * 2.2, -swing * 4], 1.3, 0.5, p.back);
      oval(c, 0, 0, L * 0.72, 4.5, fill(p.back));
      for (let i = 0; i < Math.max(1, a.marks); i++) oval(c, -L * 0.36 + i * 4.5, 0, 1.2, 1.2, fill(p.accent));
      eye(c, L * 0.5, -2.8, 0.8);
      break;
    }
    case 'seahorse': {
      // Upright, thick at the chest and narrowing to a curled tail.
      const d = a.depth;
      const spine = [1, -11, 3.6 * d, -7, 4.4 * d, -3, 3.4 * d, 1, 1.6, 5, 0, 9, -1.4 + swing, 13, -1.6 + swing, 16, 0 + swing, 18, 2.2 + swing, 17.4, 2 + swing, 15];
      taper(c, spine, 5 * d, 1, p.body);
      taper(c, [2, -10, 5 * d, -6, 5.6 * d, -2, 4.6 * d, 2], 1.3, 0.8, p.belly, 0.75);
      oval(c, 3, -13, 3.8, 2.9, fill(p.body), 0.2);
      taper(c, [5.6, -13.4, 8.4, -13, 10.6, -12.4], 1.6, 1, p.body);
      for (let i = 0; i < 3; i++) c.drawLine(-0.6 + i * 1.7, -15.2, -0.2 + i * 1.7, -17.6 - (i % 2) * 1.2, line(p.accent, 1));
      const finS = path();
      finS.moveTo(-1.5, -6);
      finS.quadTo(-7 - swing * 2.2 * a.fin, -2, -1.5, 2);
      finS.close();
      c.drawPath(finS.build(), fill(p.fin, 0.8));
      for (let i = 0; i < Math.max(1, a.marks); i++) c.drawLine(0.6, -5 + i * 4, 4.4 * d, -4 + i * 4, line(p.accent, 0.9, 0.9));
      eye(c, 4, -13.6, 0.85);
      break;
    }
    case 'eel': {
      // A long body in a wave, thick at the head and narrowing to nothing: eels are the songs that talk.
      const L = 20 * a.length;
      const pts: number[] = [];
      const top: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const f = i / 14;
        const x = L * 0.7 - f * L * 1.9;
        const y = Math.sin(f * 6 + swing * 2.4) * (1.5 + f * 4.5);
        pts.push(x, y);
        top.push(x, y - (1.5 - f));
      }
      taper(c, pts, 4.2 * a.depth, 0.9, p.body);
      taper(c, top, 1.1, 0.4, p.accent, 0.9);
      const hy = Math.sin(swing * 2.4) * 1.5;
      oval(c, L * 0.74, hy, 5.2, 2.9 * a.depth, fill(p.body));
      oval(c, L * 0.74 + 4, hy + 0.9, 1.1, 1.1, fill('#0b1a22', 0.8));
      eye(c, L * 0.74 + 1.4, hy - 1.1, 0.85);
      break;
    }
  }
}

/** The soft light around a creature. Bright is a reason to look (same key, its big move); faint is just the deep. */
export function recordHalo(color: string, bright: boolean): SkPicture {
  const R = bright ? 30 : 19;
  return createPicture(
    (c) => {
      const p = Skia.Paint();
      p.setAntiAlias(true);
      p.setBlendMode(BlendMode.Screen);
      const c0 = Skia.Color(color);
      c0[3] = bright ? 0.6 : 0.2;
      const c1 = Skia.Color(color);
      c1[3] = 0;
      p.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, R, [c0, c1], [0, 1], TileMode.Clamp));
      c.drawCircle(0, 0, R, p);
    },
    Skia.XYWHRect(-R, -R, R * 2, R * 2)
  );
}

/** A bottle hanging in the water or lying on the sand, glowing with its song's light. */
export function recordBottle(color: string): SkPicture {
  return createPicture(
    (c) => {
      c.rotate(-18, 0, 0);
      oval(c, 0, 0, 13, 9, fill(color, 0.22));
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(-11, -6, 18, 12), 6, 6), fill('#f3ead8', 0.6));
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(6, -3.5, 6, 7), 2, 2), fill('#f3ead8', 0.6));
      c.drawRRect(Skia.RRectXY(Skia.XYWHRect(11, -3, 3.6, 6), 1.3, 1.3), fill('#b07a4a'));
      oval(c, -2, 0, 3.6, 3.6, fill(color));
    },
    Skia.XYWHRect(-20, -14, 40, 28)
  );
}

export type { SkPathBuilder };
