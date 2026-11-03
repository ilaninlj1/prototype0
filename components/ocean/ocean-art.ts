// The ocean's still art, recorded once as Skia pictures on the JS thread: what only each biome has, what your listening
// grew there, the layers behind and in front of it, the sea floor's detail, and every creature's frames. The canvas's frame worklet only composes
// these, so a frame stays cheap. Skia is only ever reached through lazySkia, so importing it here is safe on the web.

import { BlendMode, PaintStyle, Skia, StrokeCap, TileMode, createPicture, type SkCanvas, type SkPaint, type SkPathBuilder, type SkPicture, type SkShader } from '@shopify/react-native-skia';

import type { Anatomy } from '@/lib/ocean-anatomy';
import { DEPTHS, WATERS, type Depth, type Kind, type Place, type Water } from '@/lib/ocean-map';
import type { CoralPiece, SandLife } from '@/lib/ocean-person';
import { TOWERS, anemoneSpots, floorAt, hexToRgb, mixRgb, seabedAt, towerRadius, type Rgb } from '@/lib/ocean-scene';

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
  return anemoneSpots(row).map((s) => ({ x: s.x * width, y: s.y * height, size: 15 * k, color: Skia.Color(toneAt('#f0d8de', 'reef', row)) }));
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

function drawTowers(c: SkCanvas, place: Place, width: number, height: number, coral: CoralPiece[], k: number) {
  const row = DEPTHS.indexOf(place.depth);
  const rock = Skia.Paint();
  rock.setAntiAlias(true);
  rock.setShader(fadingDown(ROCK.reef, 'reef', row, height));
  const rim = line(toneAt(mixHex(ROCK.reef, '#ffffff', 0.3), 'reef', row), 2 * k, 0.5);
  const spots: { x: number; y: number; side: number }[] = [];
  TOWERS.forEach((t, i) => {
    const left: number[] = [];
    const right: number[] = [];
    let first = -1;
    for (let y = -4; y <= height + 4; y += 4) {
      const radius = towerRadius(i, row + y / height);
      if (radius <= 0) continue;
      if (first < 0) first = y;
      left.push(t.cx * width - radius * width, y);
      right.push(t.cx * width + radius * width, y);
    }
    if (left.length < 4) return;
    const b = path();
    b.moveTo(left[0], left[1]);
    for (let j = 2; j < left.length; j += 2) b.lineTo(left[j], left[j + 1]);
    for (let j = right.length - 2; j >= 0; j -= 2) b.lineTo(right[j], right[j + 1]);
    b.close();
    c.drawPath(b.build(), rock);
    // Lumps of old coral all over it, so it reads as something grown and not a pillar.
    const lump = rng(41 + i * 13 + row * 7);
    const light = fill(toneAt(mixHex(ROCK.reef, '#ffffff', 0.22), 'reef', row), 0.55);
    const dark = fill(toneAt(mixHex(ROCK.reef, '#3a3428', 0.35), 'reef', row), 0.5);
    for (let n = 0; n < 34; n++) {
      const y = lump() * height;
      const radius = towerRadius(i, row + y / height);
      if (radius <= 0.012) continue;
      const x = t.cx * width + (lump() * 2 - 1) * radius * width * 0.92;
      const size = (2.5 + lump() * 6) * k;
      oval(c, x, y, size, size * 0.8, n % 3 === 0 ? dark : light);
    }
    const edge = path();
    edge.moveTo(right[0], right[1]);
    for (let j = 2; j < right.length; j += 2) edge.lineTo(right[j], right[j + 1]);
    c.drawPath(edge.build(), rim);
    // Places on the tower for things to grow.
    for (let y = Math.max(first + 20, height * 0.08); y < height * 0.92; y += height * 0.16) {
      const radius = towerRadius(i, row + y / height);
      if (radius > 0.02) spots.push({ x: t.cx * width + (i === 1 ? -radius : radius) * width, y, side: i === 1 ? -1 : 1 });
    }
  });
  // The pale flora everyone starts with, then your coral in each song's color.
  const r = rng(19 + row * 97);
  spots.forEach((s, i) => {
    if (i % 2 === 0) coralForm(c, (i / 2 + row) % 3, s.x, s.y, k, 0.8, toneAt(PALE[i % PALE.length], 'reef', row), r, s.side * 0.35);
  });
  coral.forEach((piece, i) => {
    const f = rng(piece.seed + 3);
    const s = spots.length ? spots[(i * 2 + 1) % spots.length] : { x: width * 0.3, y: height * 0.5, side: 1 };
    const y = s.y + (f() - 0.5) * height * 0.1;
    coralForm(c, piece.form, s.x + s.side * f() * 6 * k, y, k, piece.size, piece.color, f, s.side * 0.35);
  });
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
      if (place.water === 'reef') drawTowers(c, place, width, height, coral, k);
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

/** The far layer: faint shapes well behind everything, which barely move. Open blue has none, on purpose. */
export function recordFar(water: Water, width: number, height: number): SkPicture | null {
  if (water === 'blue') return null;
  const k = width / 270;
  return createPicture(
    (c) => {
      const r = rng(water.length * 53);
      const tone = fill(water === 'midnight' ? '#000000' : '#04283a', water === 'midnight' ? 0.28 : 0.1);
      if (water === 'reef') {
        for (const fx of [0.3, 0.62, 1.02]) {
          const b = path();
          const half = (18 + r() * 14) * k;
          b.moveTo(fx * width - half, -2);
          b.cubicTo(fx * width - half * 1.2, height * 0.3, fx * width - half * 0.7, height * 0.7, fx * width - half, height + 2);
          b.lineTo(fx * width + half, height + 2);
          b.cubicTo(fx * width + half * 0.7, height * 0.7, fx * width + half * 1.2, height * 0.3, fx * width + half, -2);
          b.close();
          c.drawPath(b.build(), tone);
        }
      } else if (water === 'kelp') {
        for (let i = 0; i < 12; i++) {
          const x = r() * width * 1.1;
          const b = path();
          b.moveTo(x, -2);
          b.cubicTo(x + 10 * k, height * 0.3, x - 10 * k, height * 0.7, x, height + 2);
          c.drawPath(b.build(), line('#04283a', 2.2 * k, 0.12));
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const x = r() * width;
          poly(c, [x - 34 * k, -2, x + 34 * k, -2, x + 22 * k, height + 2, x - 22 * k, height + 2], tone);
        }
      }
    },
    { width, height }
  );
}

/** The near layer: big soft shapes right by you, which sweep past fastest. Layered strokes stand in for being out of focus. */
export function recordNear(water: Water, width: number, height: number): SkPicture | null {
  if (water !== 'kelp' && water !== 'reef') return null;
  const k = width / 270;
  const soft = (c: SkCanvas, b: SkPathBuilder, wide: number) => {
    const shape = b.build();
    for (const [w, a] of [[1.6, 0.07], [1.25, 0.1], [1, 0.14]] as const) c.drawPath(shape, line('#032430', wide * w, a));
  };
  return createPicture(
    (c) => {
      if (water === 'kelp') {
        const a = path();
        a.moveTo(width * 1.02, height * 1.02);
        a.cubicTo(width * 0.9, height * 0.72, width * 1.04, height * 0.5, width * 0.93, height * 0.28);
        soft(c, a, 15 * k);
        const b = path();
        b.moveTo(-width * 0.03, height * 0.75);
        b.cubicTo(width * 0.06, height * 0.6, -width * 0.02, height * 0.46, width * 0.04, height * 0.34);
        soft(c, b, 13 * k);
      } else {
        const a = path();
        a.moveTo(width * 1.04, height * 0.96);
        a.quadTo(width * 0.9, height * 0.84, width * 0.86, height * 0.7);
        a.moveTo(width * 0.94, height * 0.84);
        a.quadTo(width * 0.84, height * 0.82, width * 0.78, height * 0.76);
        soft(c, a, 15 * k);
      }
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

export type SpritePalette = { body: string; dark: string; light: string; accent: string };

/** A song's creature: its print's colors, as vivid as you listened. */
export function songPalette(color: string, accent: string, vivid: number): SpritePalette {
  const pale = '#c9d9de';
  const body = mixHex(pale, color, Math.min(1, vivid * 1.05));
  return { body, dark: mixHex(body, '#14303d', 0.3), light: mixHex(body, '#ffffff', 0.6), accent: mixHex(pale, accent, Math.min(1, vivid * 1.05)) };
}

const eye = (c: SkCanvas, x: number, y: number, r = 1.5) => {
  oval(c, x, y, r, r, fill('#ffffff'));
  oval(c, x + 0.3, y, r * 0.6, r * 0.6, fill('#111111'));
};

function tailFin(c: SkCanvas, x: number, a: Anatomy, p: SpritePalette, w: number, size: number) {
  const s = size * (0.8 + a.fin * 0.3);
  const lift = w * s * 0.5;
  const paint = fill(p.dark);
  if (a.tail === 'fork') poly(c, [x + 1, 0, x - s, -s * 0.85 + lift, x - s * 0.55, lift, x - s, s * 0.85 + lift], paint);
  else if (a.tail === 'round') {
    const b = path();
    b.moveTo(x + 1, 0);
    b.quadTo(x - s * 1.3, -s * 0.9 + lift, x - s, lift);
    b.quadTo(x - s * 1.3, s * 0.9 + lift, x + 1, 0);
    c.drawPath(b.build(), paint);
  } else poly(c, [x + 1, 0, x - s, -s * 0.6 + lift, x - s * 1.15, lift, x - s, s * 0.6 + lift], paint);
}

/** A fish's markings, clipped to its body. */
function markings(c: SkCanvas, a: Anatomy, p: SpritePalette, L: number, H: number) {
  const b = path();
  b.addOval(Skia.XYWHRect(-L, -H, L * 2, H * 2));
  c.save();
  c.clipPath(b.build(), CLIP_IN, true);
  const mark = fill(p.accent);
  if (a.pattern === 'stripes') {
    const n = Math.max(1, a.marks);
    const gap = (L * 1.5) / (n + 1);
    for (let i = 1; i <= n; i++) c.drawRect(Skia.XYWHRect(-L * 0.75 + gap * i - 1.4, -H, 2.8, H * 2), mark);
  } else if (a.pattern === 'spots') {
    const f = rng(a.marks * 31 + 7);
    for (let i = 0; i < 4 + a.marks * 2; i++) oval(c, (f() * 1.6 - 0.8) * L, (f() * 1.5 - 0.75) * H, 1.2, 1.2, mark);
  } else if (a.pattern === 'lines') {
    const glow = line(p.accent, 0.9);
    for (let i = 0; i < 2 + (a.marks % 2); i++) c.drawLine(-L, -H * 0.4 + i * H * 0.42, L, -H * 0.4 + i * H * 0.42, glow);
  } else if (a.pattern === 'band') {
    c.drawRect(Skia.XYWHRect(-L * 0.2, -H, L * 0.5, H * 2), mark);
  }
  oval(c, -L * 0.05, H * 0.55, L * 0.72, H * 0.42, fill(p.light, 0.55));
  c.restore();
}

function fish(c: SkCanvas, a: Anatomy, p: SpritePalette, w: number, L0: number, H0: number, swing: number) {
  const L = L0 * a.length;
  const H = H0 * a.depth;
  tailFin(c, -L + 1, a, p, w, L0 * 0.68);
  // Top and bottom fins, bigger on brighter songs.
  const f = a.fin;
  poly(c, [-L * 0.5, -H * 0.8, -L * 0.1 + swing, -H - 5 * f, L * 0.45, -H * 0.72], fill(p.dark));
  poly(c, [-L * 0.3, H * 0.8, -L * 0.1 - swing, H + 3.6 * f, L * 0.3, H * 0.74], fill(p.dark));
  oval(c, 0, 0, L, H, fill(p.body));
  markings(c, a, p, L, H);
  // The side fin beats.
  oval(c, L * 0.12, H * 0.25, 3.4 * f, 1.8, fill(p.dark), 0.5 + swing * 0.4);
  eye(c, L * 0.62, -H * 0.24, Math.max(1, H0 * 0.2));
  if (a.voice) oval(c, L * 0.95, H * 0.16, 1.4, 1.4, fill('#14202a', 0.8));
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
  const body = fill(p.body);
  const dark = fill(p.dark);
  const light = fill(p.light);
  switch (kind) {
    case 'clown':
      fish(c, a, p, w, 12, 7.5, swing);
      break;
    case 'darter':
      fish(c, a, p, w, 11, 3.6, swing);
      break;
    case 'drifter': {
      tailFin(c, -9, a, p, w, 5);
      oval(c, 0, 0, 10, 3.2, body);
      c.drawRect(Skia.XYWHRect(-7, -2.4, 14, 1.2), dark);
      eye(c, 7, -0.6, 1);
      break;
    }
    case 'turtle': {
      const f = swing * 0.55;
      const flipper = fill(mixHex(p.dark, '#3f6650', 0.25));
      oval(c, 8, -8, 8 * a.fin, 3, flipper, -0.8 + f);
      oval(c, 8, 8, 8 * a.fin, 3, flipper, 0.8 - f);
      oval(c, -11, -6, 5, 2.4, flipper, 0.7 - f * 0.5);
      oval(c, -11, 6, 5, 2.4, flipper, -0.7 + f * 0.5);
      oval(c, 14, 0, 5, 3.6, flipper);
      const L = 13 * a.length;
      oval(c, 0, 0, L, 10 * a.depth, dark);
      oval(c, 0, 0, L - 2.5, (10 - 2) * a.depth, body);
      // The shell's plates are its key.
      const plate = line(p.accent, 1.1);
      const n = 1 + Math.max(1, a.marks);
      for (let i = 1; i < n + 1; i++) c.drawLine(-L * 0.8 + (i * L * 1.6) / (n + 1), -6.5 * a.depth, -L * 0.8 + (i * L * 1.6) / (n + 1), 6.5 * a.depth, plate);
      c.drawLine(-L * 0.75, 0, L * 0.75, 0, plate);
      eye(c, 15.5, -1.2, 1);
      break;
    }
    case 'jelly': {
      const squeeze = 1 + swing * 0.08;
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      const c0 = Skia.Color(p.light);
      c0[3] = 0.4;
      const c1 = Skia.Color(p.light);
      c1[3] = 0;
      glow.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: -2 }, 24, [c0, c1], [0, 1], TileMode.Clamp));
      c.drawCircle(0, -2, 24, glow);
      const R = 11 * a.depth;
      const bell = path();
      bell.addArc(Skia.XYWHRect(-R * squeeze, -R / squeeze, 2 * R * squeeze, (2 * R) / squeeze), 180, 180);
      bell.close();
      c.drawPath(bell.build(), fill(p.body, 0.88));
      // A rim in the second color, and strands from the song's key.
      const rim = path();
      rim.addArc(Skia.XYWHRect(-R * squeeze * 0.7, (-R / squeeze) * 0.7, 1.4 * R * squeeze, (1.4 * R) / squeeze), 200, 140);
      c.drawPath(rim.build(), line(p.accent, 1.2, 0.8));
      const strand = line(p.body, 1.1, 0.72);
      const len = 16 + a.fin * 8;
      for (let i = 0; i < a.strands; i++) {
        const x = -R * 0.8 + (i * R * 1.6) / Math.max(1, a.strands - 1);
        const b = path();
        b.moveTo(x, 0);
        b.cubicTo(x + swing * 2, len * 0.4, x - swing * 3, len * 0.7, x + swing * 2, len + (i % 2) * 4);
        c.drawPath(b.build(), strand);
      }
      break;
    }
    case 'puffer': {
      const spike = fill(p.dark);
      for (let i = 0; i < a.spines; i++) {
        const t = (i * TAU) / a.spines;
        poly(c, [Math.cos(t - 0.2) * 9.5, Math.sin(t - 0.2) * 9.5, Math.cos(t) * 13.5, Math.sin(t) * 13.5, Math.cos(t + 0.2) * 9.5, Math.sin(t + 0.2) * 9.5], spike);
      }
      tailFin(c, -10, a, p, w, 5);
      oval(c, 0, 0, 11, 10, body);
      markings(c, a, p, 11, 10);
      eye(c, 5, -3, 1.8);
      if (a.voice) oval(c, 10, 1, 1.5, 1.5, fill('#14202a', 0.8));
      break;
    }
    case 'manta': {
      // Wings that really flap; the second color runs along their backs.
      const flap = swing * 7;
      const L = 15 * a.length;
      const wing = (side: number) => {
        const tipY = side * (17 + a.fin * 6) + flap * side * 0.5;
        const b = path();
        b.moveTo(L * 0.6, side * 1);
        b.quadTo(L * 0.25, tipY * 0.8, -L * 0.25, tipY);
        b.quadTo(-L * 0.3, tipY * 0.4, -L * 0.7, side * 2);
        b.close();
        c.drawPath(b.build(), fill(p.body));
      };
      wing(-1);
      wing(1);
      const tail = path();
      tail.moveTo(-L * 0.7, 0);
      tail.quadTo(-L * 1.4, swing * 5, -L * 2.2, -swing * 6);
      c.drawPath(tail.build(), line(p.dark, 1.2));
      oval(c, 0, 0, L * 0.75, 5.5, fill(p.dark));
      for (let i = 0; i < Math.max(1, a.marks); i++) oval(c, -L * 0.4 + i * 5, 0, 1.5, 1.5, fill(p.accent));
      poly(c, [L * 0.55, -3, L * 0.95, -5, L * 0.72, -1], fill(p.dark));
      poly(c, [L * 0.55, 3, L * 0.95, 5, L * 0.72, 1], fill(p.dark));
      break;
    }
    case 'seahorse': {
      // Upright, with its tail curled and a little fin fluttering.
      const b = path();
      b.moveTo(1, -12);
      b.cubicTo(7 * a.depth, -7, 7 * a.depth, 3, 2, 8);
      b.cubicTo(-1, 13, -5 + swing, 16, -2 + swing, 19);
      b.cubicTo(1 + swing, 21, 4 + swing, 18, 1 + swing, 16);
      c.drawPath(b.build(), line(p.body, 5 * a.depth));
      oval(c, 3, -14, 4.6, 3.6, body, 0.2);
      poly(c, [6, -15, 12, -14, 7, -12], fill(p.dark));
      for (let i = 0; i < 3; i++) poly(c, [-1 + i * 2, -17.5, i * 2, -21 - (i % 2) * 1.5, 1 + i * 2, -17], fill(p.accent));
      poly(c, [-2, -6, -8 - swing * 2.5 * a.fin, -2, -2, 2], fill(p.dark, 0.85));
      for (let i = 0; i < Math.max(1, a.marks); i++) c.drawLine(0, -6 + i * 5, 5 * a.depth, -5 + i * 5, line(p.accent, 1));
      eye(c, 4, -15, 1.1);
      break;
    }
    case 'eel': {
      // A long body in a wave, always open-mouthed: eels are the songs that talk.
      const L = 26 * a.length;
      const b = path();
      for (let i = 0; i <= 12; i++) {
        const f = i / 12;
        const x = L * 0.7 - f * L * 1.9;
        const y = Math.sin(f * 6 + swing * 2.4) * (2 + f * 5);
        if (i === 0) b.moveTo(x, y);
        else b.lineTo(x, y);
      }
      const spine = b.build();
      c.drawPath(spine, line(p.body, 5 * a.depth));
      c.drawPath(spine, line(p.accent, 1.1));
      oval(c, L * 0.75, Math.sin(swing * 2.4) * 2, 6.5, 3.8 * a.depth, body);
      oval(c, L * 0.75 + 5, Math.sin(swing * 2.4) * 2 + 1, 1.8, 1.8, fill('#14202a', 0.85));
      eye(c, L * 0.75 + 1.5, Math.sin(swing * 2.4) * 2 - 1.6, 1.1);
      break;
    }
  }
  void light;
}

/** A soft ring of light around a creature, for the night, the deep, and a song in the same key. */
export function recordHalo(color: string): SkPicture {
  return createPicture(
    (c) => {
      const p = Skia.Paint();
      p.setAntiAlias(true);
      p.setBlendMode(BlendMode.Screen);
      const c0 = Skia.Color(color);
      c0[3] = 0.5;
      const c1 = Skia.Color(color);
      c1[3] = 0;
      p.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, 30, [c0, c1], [0, 1], TileMode.Clamp));
      c.drawCircle(0, 0, 30, p);
    },
    Skia.XYWHRect(-30, -30, 60, 60)
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
