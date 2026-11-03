// The ocean's still art, recorded once as Skia pictures on the JS thread: each place's seabed, flora, coral and sand,
// and every creature's frames. The canvas's frame worklet only composes these, so a frame stays cheap.
// Skia is only ever reached through lazySkia, so importing it here is safe on the web.

import { BlendMode, PaintStyle, Skia, StrokeCap, TileMode, createPicture, type SkCanvas, type SkPaint, type SkPicture } from '@shopify/react-native-skia';

import { DEPTHS, placeKey, type Depth, type Place, type Water } from '@/lib/ocean-map';
import type { CoralPiece, SandLife } from '@/lib/ocean-person';
import { hexToRgb, mixRgb, seabedAt, type Rgb, type WildLook } from '@/lib/ocean-scene';

const TAU = Math.PI * 2;

const rng = (seed: number) => {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mixHex = (a: string, b: string, t: number) => hex(mixRgb(hexToRgb(a), hexToRgb(b), t));

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

/* ---------- flora ---------- */

function branch(c: SkCanvas, x: number, y: number, len: number, ang: number, w: number, color: string, r: () => number, d: number) {
  if (d <= 0 || len < 4) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  const path = Skia.PathBuilder.Make();
  path.moveTo(x, y);
  path.quadTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, x2, y2);
  c.drawPath(path.build(), line(color, w));
  const n = d > 2 ? 3 : 2;
  for (let i = 0; i < n; i++) branch(c, x2, y2, len * (0.62 + r() * 0.14), ang + (i - (n - 1) / 2) * (0.55 + r() * 0.25), w * 0.72, color, r, d - 1);
}
function fan(c: SkCanvas, x: number, y: number, rad: number, color: string) {
  const rib = line(color, 1.5);
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI + 0.25 + (i * (Math.PI - 0.5)) / 12;
    const path = Skia.PathBuilder.Make();
    path.moveTo(x, y);
    path.quadTo(x + Math.cos(a) * rad * 0.5, y + Math.sin(a) * rad * 0.7, x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    c.drawPath(path.build(), rib);
  }
  const web = line(color, 0.8, 0.6);
  for (let k = 1; k < 4; k++) {
    const rr = (rad * k) / 4;
    const path = Skia.PathBuilder.Make();
    path.addArc(Skia.XYWHRect(x - rr, y - rr, rr * 2, rr * 2), 180 + 14, 180 - 28);
    c.drawPath(path.build(), web);
  }
}
function brain(c: SkCanvas, x: number, y: number, rx: number, ry: number, color: string, dark: string) {
  const dome = Skia.PathBuilder.Make();
  dome.addArc(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), 180, 180);
  dome.close();
  c.drawPath(dome.build(), fill(color));
  c.save();
  c.clipPath(dome.build(), 1, true);
  const groove = line(dark, 1.2);
  for (let j = 0; j < 5; j++) {
    const path = Skia.PathBuilder.Make();
    for (let i = -rx; i <= rx; i += 3) {
      const yy = y - (ry * (j + 0.5)) / 5 + Math.sin(i * 0.35 + j * 1.7) * 2.2;
      if (i === -rx) path.moveTo(x + i, yy);
      else path.lineTo(x + i, yy);
    }
    c.drawPath(path.build(), groove);
  }
  c.restore();
}
function tubes(c: SkCanvas, x: number, y: number, color: string, lip: string, r: () => number) {
  for (let i = 0; i < 5; i++) {
    const tx = x + (i - 2) * 9 + r() * 3;
    const h = 18 + r() * 22;
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(tx - 4, y - h, 8, h + 4), 4, 4), fill(color));
    oval(c, tx, y - h, 4, 1.8, fill(lip));
  }
}
function rock(c: SkCanvas, x: number, y: number, rx: number, ry: number, color: string) {
  const dome = Skia.PathBuilder.Make();
  dome.addArc(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), 180, 180);
  dome.close();
  c.drawPath(dome.build(), fill(color));
}
function star(c: SkCanvas, x: number, y: number, s: number, color: string) {
  const path = Skia.PathBuilder.Make();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2 + 0.3;
    const rr = i % 2 ? s * 0.42 : s;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  path.close();
  c.drawPath(path.build(), fill(color));
}

const SAND: Record<Water, [string, string]> = {
  reef: ['#f8e7bb', '#dcc08a'],
  kelp: ['#d4c791', '#9c8f60'],
  blue: ['#9db3cb', '#5f7895'],
  midnight: ['#2b3050', '#14172c'],
};
const ROCK: Record<Water, string> = { reef: '#d7cfc0', kelp: '#6d7363', blue: '#54708f', midnight: '#1b1f38' };
const PALE_REEF = ['#e4eeee', '#dbe7e8', '#d3e0e2', '#d6e2e2', '#d8e4e5', '#e0eaeb'];
const DEEP: Record<Depth, number> = { popular: 0, deepcuts: 0.35, gems: 0.66, buried: 0.86 };
const ABYSS: Record<Water, string> = { reef: '#04203a', kelp: '#04221f', blue: '#041a40', midnight: '#020818' };

/** A pale piece of the place's own life, dimmer the deeper it sits. */
const paled = (hexColor: string, place: Place) => mixHex(hexColor, ABYSS[place.water], DEEP[place.depth]);

export type Weed = { x: number; base: number; height: number; color: string; width: number; phase: number; leaves: boolean };

/** The swaying plants of a place, which the frame worklet draws live so they can follow the beat. */
export function weedsFor(place: Place, width: number, height: number): Weed[] {
  const depthIndex = DEPTHS.indexOf(place.depth);
  const r = rng(137 + depthIndex * 41 + place.water.length * 13);
  const k = width / 270;
  const out: Weed[] = [];
  const floor = (x: number) => height - seabedAt(depthIndex, x / width) * height + 8;
  const colors: Record<Water, [string, string]> = {
    reef: ['#c9dcd2', '#d6e5dc'],
    kelp: ['#a9b58a', '#bfc99f'],
    blue: ['#b4c8d8', '#c5d6e3'],
    midnight: ['#34506f', '#3f5f80'],
  };
  const [a, b] = colors[place.water];
  const n = place.water === 'kelp' ? 9 : place.water === 'midnight' ? 3 : place.water === 'blue' ? 2 : 5;
  for (let i = 0; i < n; i++) {
    const x = (r() * 0.9 + 0.05) * width;
    const tall = place.water === 'kelp';
    out.push({
      x,
      base: floor(x),
      height: (tall ? 150 + r() * 200 : 30 + r() * 42) * k,
      color: paled(r() < 0.5 ? a : b, place),
      width: (tall ? 3.4 : 2.2) * k,
      phase: r() * 9,
      leaves: tall,
    });
  }
  return out;
}

/** Everything still about a place: its terraced seabed, pale flora, your coral and your sand. */
export function recordPlace(place: Place, width: number, height: number, coral: CoralPiece[], sand: SandLife | null, colorSafe: (c: string) => string): SkPicture {
  const depthIndex = DEPTHS.indexOf(place.depth);
  const k = width / 270;
  return createPicture(
    (c) => {
      const r = rng(19 + depthIndex * 97 + place.water.length * 31);
      const rise = (sand?.rise ?? 0) * 28 * k;
      const floor = (x: number) => height - seabedAt(depthIndex, Math.max(0, Math.min(1, x / width))) * height - rise;

      // The seabed, with a second, darker ledge in front so the terraces read.
      const body = Skia.PathBuilder.Make();
      body.moveTo(-2, height + 2);
      for (let x = -2; x <= width + 2; x += 5) body.lineTo(x, floor(x));
      body.lineTo(width + 2, height + 2);
      body.close();
      const [light, dark] = SAND[place.water];
      const sandPaint = Skia.Paint();
      sandPaint.setAntiAlias(true);
      const top = height * 0.72;
      sandPaint.setShader(
        Skia.Shader.MakeLinearGradient({ x: 0, y: top }, { x: 0, y: height }, [Skia.Color(paled(light, place)), Skia.Color(paled(dark, place))], [0, 1], TileMode.Clamp)
      );
      c.drawPath(body.build(), sandPaint);

      const grain = fill(paled(dark, place), 0.34);
      for (let i = 0; i < 150; i++) {
        const x = r() * width;
        const y = floor(x) + 6 + r() * (height - floor(x));
        c.drawRect(Skia.XYWHRect(x, y, 1.2, 1.2), grain);
      }
      const ripple = line(paled(dark, place), 1, 0.2);
      for (let i = 0; i < 7; i++) {
        const path = Skia.PathBuilder.Make();
        for (let x = -10; x < width + 10; x += 12) {
          const yy = floor(Math.max(0, x)) + 14 + i * 11 * k + Math.sin(x * 0.03 + i) * 3;
          if (x < 0) path.moveTo(x, yy);
          else path.lineTo(x, yy);
        }
        c.drawPath(path.build(), ripple);
      }

      // Pale flora: the same for everyone. Only your listening adds color.
      const pale = (i: number) => paled(PALE_REEF[i % PALE_REEF.length], place);
      const at = (f: number) => floor(f * width) + 4;
      if (place.water === 'reef') {
        const glow = depthIndex < 2;
        fan(c, 0.46 * width, at(0.46), 44 * k * (glow ? 1 : 0.8), pale(0));
        branch(c, 0.17 * width, at(0.17), 27 * k, -Math.PI / 2, 5.5 * k, pale(1), r, 4);
        branch(c, 0.32 * width, at(0.32), 15 * k, -Math.PI / 2 + 0.25, 3.5 * k, pale(2), r, 3);
        tubes(c, 0.86 * width, at(0.86), pale(4), mixHex(pale(4), '#ffffff', 0.5), r);
        brain(c, 0.67 * width, at(0.67) + 2, 27 * k, 19 * k, pale(3), mixHex(pale(3), '#70868a', 0.3));
        branch(c, 0.76 * width, at(0.76), 16 * k, -Math.PI / 2 - 0.2, 3.5 * k, pale(5), r, 3);
      } else if (place.water === 'kelp') {
        rock(c, 0.16 * width, at(0.16) + 4, 38 * k, 28 * k, paled(ROCK.kelp, place));
        rock(c, 0.79 * width, at(0.79) + 4, 50 * k, 30 * k, paled(mixHex(ROCK.kelp, '#3a4038', 0.2), place));
        rock(c, 0.48 * width, at(0.48) + 4, 20 * k, 14 * k, paled(mixHex(ROCK.kelp, '#ffffff', 0.1), place));
        branch(c, 0.34 * width, at(0.34), 13 * k, -Math.PI / 2, 2.6 * k, pale(1), r, 3);
      } else if (place.water === 'blue') {
        rock(c, 0.78 * width, at(0.78) + 4, 34 * k, 18 * k, paled(ROCK.blue, place));
        rock(c, 0.22 * width, at(0.22) + 4, 20 * k, 10 * k, paled(mixHex(ROCK.blue, '#ffffff', 0.1), place));
      } else {
        rock(c, 0.22 * width, at(0.22) + 4, 46 * k, 44 * k, paled(ROCK.midnight, place));
        rock(c, 0.8 * width, at(0.8) + 4, 40 * k, 58 * k, paled(mixHex(ROCK.midnight, '#0d1024', 0.3), place));
      }
      if (depthIndex >= 2) {
        // First glowing specks in the twilight; the sea floor glows faintly in the dark.
        const spot = fill('#9fe8f2', 0.75);
        const halo = fill('#9fe8f2', 0.16);
        for (let i = 0; i < 14; i++) {
          const x = r() * width;
          const y = floor(x) - 4 - r() * 90 * k;
          oval(c, x, y, 4.5, 4.5, halo);
          oval(c, x, y, 1.3, 1.3, spot);
        }
      }

      // Your coral grows over it, in each song's color.
      for (const piece of coral) {
        const f = rng(piece.seed + 3);
        const x = (0.05 + f() * 0.9) * width;
        const y = floor(x) + 6;
        const color = colorSafe(piece.color);
        if (piece.form === 0) branch(c, x, y, 22 * k * piece.size, -Math.PI / 2 + (f() - 0.5) * 0.4, 4.5 * k * piece.size, color, f, 4);
        else if (piece.form === 1) fan(c, x, y, 34 * k * piece.size, color);
        else brain(c, x, y + 4, 22 * k * piece.size, 15 * k * piece.size, color, mixHex(color, '#1b2a33', 0.32));
      }
      // Your sand: one colored speck per song you heard and let go.
      for (const speck of sand?.specks ?? []) {
        const f = rng(speck.seed + 11);
        const x = f() * width;
        const y = floor(x) + 8 + f() * (height - floor(x) - 10);
        oval(c, x, y, 0.9 + f() * 0.8, 0.9 + f() * 0.8, fill(colorSafe(speck.color), 0.78));
      }
    },
    { width, height }
  );
}

/* ---------- creatures ---------- */

export type SpritePalette = { body: string; dark: string; light: string; alpha: number };

/** The wild look: pale, the same in every ocean. */
export const PALE: SpritePalette = { body: '#c9d9de', dark: '#a7bcc4', light: '#eef5f6', alpha: 1 };

/** A song's creature: its print's color, as vivid as you listened. */
export function songPalette(color: string, vivid: number): SpritePalette {
  const body = mixHex(PALE.body, color, Math.min(1, vivid * 1.05));
  return { body, dark: mixHex(body, '#14303d', 0.28), light: mixHex(body, '#ffffff', 0.55), alpha: 0.55 + 0.45 * vivid };
}

const eye = (c: SkCanvas, x: number, y: number, r = 1.5) => {
  oval(c, x, y, r, r, fill('#ffffff'));
  oval(c, x + 0.3, y, r * 0.6, r * 0.6, fill('#111111'));
};
function tail(c: SkCanvas, x: number, color: string, w: number, size: number) {
  const path = Skia.PathBuilder.Make();
  path.moveTo(x + 1, 0);
  path.lineTo(x - size, -size * 0.8 + w * size * 0.5);
  path.lineTo(x - size * 0.72, w * size * 0.5);
  path.lineTo(x - size, size * 0.8 + w * size * 0.5);
  path.close();
  c.drawPath(path.build(), fill(color));
}

const FRAMES = 6;

/** One look in one palette, as frames from one end of its stroke to the other. */
export function recordSprite(look: WildLook | 'darter' | 'drifter', p: SpritePalette): SkPicture[] {
  const out: SkPicture[] = [];
  const box = look === 'whale' ? 200 : 80;
  for (let i = 0; i < FRAMES; i++) {
    const swing = (i / (FRAMES - 1)) * 2 - 1;
    const w = swing * 0.35;
    out.push(
      createPicture(
        (c) => {
          drawLook(c, look, w, swing, p);
        },
        Skia.XYWHRect(-box, -box, box * 2, box * 2)
      )
    );
  }
  return out;
}

function drawLook(c: SkCanvas, look: WildLook | 'darter' | 'drifter', w: number, swing: number, p: SpritePalette) {
  const body = fill(p.body);
  const dark = fill(p.dark);
  const light = fill(p.light);
  switch (look) {
    case 'clown': {
      tail(c, -10, p.dark, w, 8);
      oval(c, 0, 0, 12, 7, body);
      const clip = Skia.PathBuilder.Make();
      clip.addOval(Skia.XYWHRect(-12, -7, 24, 14));
      c.save();
      c.clipPath(clip.build(), 1, true);
      c.drawRect(Skia.XYWHRect(-6, -8, 3.4, 16), light);
      c.drawRect(Skia.XYWHRect(2, -8, 3.2, 16), light);
      c.restore();
      eye(c, 8, -1.5);
      break;
    }
    case 'tang': {
      tail(c, -9, p.dark, w, 6);
      const fin = Skia.PathBuilder.Make();
      fin.moveTo(-2, -7);
      fin.lineTo(3, -11);
      fin.lineTo(6, -6);
      fin.close();
      c.drawPath(fin.build(), body);
      oval(c, 0, 0, 10.5, 7.5, body);
      oval(c, -1, 2, 7, 3.4, light);
      eye(c, 6, -2);
      break;
    }
    case 'neon':
    case 'darter': {
      tail(c, -7, p.dark, w, 4.5);
      oval(c, 0, 0, 8, 2.8, body);
      c.drawRect(Skia.XYWHRect(-5, 0.2, 9, 1.5), light);
      eye(c, 5, -0.8, 1);
      break;
    }
    case 'silver':
    case 'drifter': {
      tail(c, -9, p.dark, w, 5);
      oval(c, 0, 0, 10, 3.2, body);
      c.drawRect(Skia.XYWHRect(-7, -2.4, 14, 1.2), dark);
      eye(c, 7, -0.6, 1);
      break;
    }
    case 'turtle': {
      const f = swing * 0.55;
      const flipper = fill(mixHex(p.body, '#3f6650', 0.2));
      oval(c, 8, -8, 8, 3, flipper, -0.8 + f);
      oval(c, 8, 8, 8, 3, flipper, 0.8 - f);
      oval(c, -11, -6, 5, 2.4, flipper, 0.7 - f * 0.5);
      oval(c, -11, 6, 5, 2.4, flipper, -0.7 + f * 0.5);
      oval(c, 14, 0, 5, 3.6, flipper);
      oval(c, 0, 0, 13, 10, dark);
      oval(c, 0, 0, 10.5, 8, body);
      const plate = line(p.dark, 1);
      c.drawLine(-9, 0, 9, 0, plate);
      c.drawLine(-3, -7, -3, 7, plate);
      c.drawLine(3, -7, 3, 7, plate);
      eye(c, 15.5, -1.2, 1);
      break;
    }
    case 'jelly': {
      const squeeze = 1 + swing * 0.08;
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      const c0 = Skia.Color(p.light);
      c0[3] = 0.42;
      const c1 = Skia.Color(p.light);
      c1[3] = 0;
      glow.setShader(Skia.Shader.MakeRadialGradient({ x: 0, y: -2 }, 24, [c0, c1], [0, 1], TileMode.Clamp));
      c.drawCircle(0, -2, 24, glow);
      const bell = Skia.PathBuilder.Make();
      bell.addArc(Skia.XYWHRect(-11 * squeeze, -11 / squeeze, 22 * squeeze, 22 / squeeze), 180, 180);
      bell.close();
      c.drawPath(bell.build(), fill(p.body, 0.88));
      const strand = line(p.body, 1.1, 0.72);
      for (let i = 0; i < 5; i++) {
        const x = -8 + i * 4;
        const path = Skia.PathBuilder.Make();
        path.moveTo(x, 0);
        path.cubicTo(x + swing * 2, 7, x - swing * 3, 12, x + swing * 2, 18 + (i % 2) * 4);
        c.drawPath(path.build(), strand);
      }
      break;
    }
    case 'puffer': {
      const spike = fill(p.dark);
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        const path = Skia.PathBuilder.Make();
        path.moveTo(Math.cos(a - 0.2) * 9.5, Math.sin(a - 0.2) * 9.5);
        path.lineTo(Math.cos(a) * 13.5, Math.sin(a) * 13.5);
        path.lineTo(Math.cos(a + 0.2) * 9.5, Math.sin(a + 0.2) * 9.5);
        path.close();
        c.drawPath(path.build(), spike);
      }
      tail(c, -11, p.dark, w, 4.5);
      oval(c, 0, 0, 11, 10, body);
      oval(c, 0, 3.4, 8, 5.4, light);
      eye(c, 5, -3, 1.8);
      break;
    }
    case 'whale': {
      const fluke = Skia.PathBuilder.Make();
      fluke.moveTo(-60, 0);
      fluke.lineTo(-76, -11 + w * 10);
      fluke.lineTo(-68, 0);
      fluke.lineTo(-76, 11 + w * 10);
      fluke.close();
      c.drawPath(fluke.build(), dark);
      oval(c, 0, 0, 62, 20, body);
      oval(c, 6, 8, 48, 10, light);
      oval(c, 0, 16, 12, 4, dark, 0.35);
      eye(c, 42, -4, 1.6);
      break;
    }
    case 'angler': {
      tail(c, -11, p.dark, w, 8);
      oval(c, 0, 0, 13, 10, body);
      const lure = Skia.PathBuilder.Make();
      lure.moveTo(5, -9);
      lure.quadTo(12, -18, 18, -13);
      c.drawPath(lure.build(), line(p.dark, 1.2));
      oval(c, 18, -12, 6, 6, fill('#9fe8f2', 0.22));
      oval(c, 18, -12, 2, 2, fill('#d8fbff'));
      eye(c, 7, -3, 1.6);
      break;
    }
    case 'crab': {
      const leg = line(p.dark, 1.4);
      for (let i = 0; i < 3; i++) {
        c.drawLine(-5, 1 + i, -12, 5 + i * 1.5, leg);
        c.drawLine(5, 1 + i, 12, 5 + i * 1.5, leg);
      }
      oval(c, -10, -4, 3.4, 2.6, body, -0.5);
      oval(c, 10, -4, 3.4, 2.6, body, 0.5);
      oval(c, 0, 0, 8, 5.4, body);
      eye(c, -2.5, -5, 1);
      eye(c, 2.5, -5, 1);
      break;
    }
    case 'starfish':
      star(c, 0, 0, 8, p.body);
      break;
  }
}

/** A soft ring of light around a creature, for the night and the deep. */
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

/** A bottle resting on the sand, glowing with its song's light. */
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

export const placeId = placeKey;
