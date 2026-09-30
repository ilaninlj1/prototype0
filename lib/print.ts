// Song prints: every song becomes one small two-ink mark, and 50 swipes of
// them make a one-of-one piece. Pure — no React, no network — so the same
// song always draws the same mark, here and in tests.
//
// What drives what:
//   trackId        → the seed for everything random (rotation, variation)
//   genre          → the mark's shape family (bars, rings, zigzags…)
//   cover colors   → the two inks
//   song length    → how big the mark is
//   release year   → how far the two inks drift out of register (older = looser)
//   swipe          → right: bold two-ink mark; left: a faint ghost outline
//   double-tap     → a small red dot

export const ART = { width: 1000, height: 240, slots: 50 } as const;

const SIGNAL = '#e63946';
const GHOST = '#f3ead8';
const NOW_YEAR = 2026; // fixed, so a song's print never changes with the calendar

export type Family = 'beat' | 'pulse' | 'edge' | 'bloom' | 'wave' | 'grain' | 'shard' | 'arc';

export type PrintInput = {
  id: number;
  genre: string;
  inks?: [string, string] | null;
  durationMs?: number | null;
  releaseYear?: number | null;
};

export type Print = {
  seed: number;
  family: Family;
  inks: [string, string];
  /** Roughly the mark's radius, in canvas units. */
  size: number;
  /** How far ink two sits from ink one. */
  offset: { dx: number; dy: number };
  rotation: number;
  /** A fixed random number per song for shape details. */
  variant: number;
};

export type Mark = { trackId: number; kind: 'bold' | 'ghost'; saved: boolean; print: Print };
export type ArtCanvas = { number: number; startedAt: number; marks: Mark[]; finishedAt?: number };
export type Shape = { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity: number };
type Point = { x: number; y: number };

// ---------- seeded randomness ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- data → traits ----------

const FAMILIES: [Family, RegExp][] = [
  ['beat', /hip.?hop|rap|trap|drill|grime|boom.?bap/],
  ['pulse', /electr|dance|house|techno|edm|trance|ambient|dubstep|drum.?(and|&|n).?bass|garage|synth/],
  ['wave', /r&b|rnb|soul|jazz|blues|funk|gospel|neo.?soul/],
  ['bloom', /pop/],
  ['edge', /rock|metal|punk|grunge|alternative|indie|emo|hardcore|shoegaze/],
  ['grain', /country|folk|singer|songwriter|acoustic|americana|bluegrass/],
  ['shard', /latin|reggae|afro|dancehall|world|salsa|cumbia|bachata|amapiano|brazil|baile|funk carioca/],
];

export function genreFamily(genre: string): Family {
  const g = genre.toLowerCase();
  for (const [family, re] of FAMILIES) if (re.test(g)) return family;
  return 'arc';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function makePrint(input: PrintInput): Print {
  const rand = mulberry32(input.id);
  const rotation = (rand() - 0.5) * 0.7; // upright-ish, like notes
  const variant = rand();
  const tilt = rand() * Math.PI * 2;
  const fallbackHue = rand() * 360;
  const fallbackSize = 27 + rand() * 6;

  const size = input.durationMs ? 18 + clamp((input.durationMs / 1000 - 120) / 300, 0, 1) * 26 : fallbackSize;
  const age = input.releaseYear ? clamp((NOW_YEAR - input.releaseYear) / 60, 0, 1) : null;
  const drift = age == null ? 3 : 1.5 + age * 9;

  return {
    seed: input.id,
    family: genreFamily(input.genre),
    inks: input.inks ?? [hsl(fallbackHue, 0.65, 0.62), hsl(fallbackHue + 150, 0.55, 0.55)],
    size,
    offset: { dx: Math.cos(tilt) * drift, dy: Math.sin(tilt) * drift },
    rotation,
    variant,
  };
}

// ---------- cover colors → two inks ----------

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Two inks from a tiny RGBA thumbnail of the cover, lifted so they read on navy. */
export function pickInks(rgba: Uint8Array): [string, string] | null {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  let lightest = 0;
  let pixels = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    pixels++;
    const [h, s, l] = toHsl(r, g, b);
    lightest = Math.max(lightest, l);
    if (s < 0.25 || l < 0.1 || l > 0.92) continue;
    const key = Math.floor(h / 30) % 12;
    const w = s * (1 - Math.abs(l - 0.5));
    const cur = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    buckets.set(key, { w: cur.w + w, r: cur.r + r * w, g: cur.g + g * w, b: cur.b + b * w });
  }
  if (pixels === 0) return null;

  const ranked = [...buckets.entries()].sort((a, b) => b[1].w - a[1].w);
  if (ranked.length === 0) {
    // A black-and-white cover prints in greys.
    return [hsl(40, 0.08, Math.max(0.72, lightest * 0.9)), hsl(40, 0.05, 0.5)];
  }
  const avg = (v: { w: number; r: number; g: number; b: number }) => toHsl(v.r / v.w, v.g / v.w, v.b / v.w);
  const [h1, s1, l1] = avg(ranked[0][1]);
  const inkA = hsl(h1, clamp(s1, 0.45, 0.9), clamp(l1, 0.58, 0.8));
  const hueGap = (k: number) => {
    const d = Math.abs(k - ranked[0][0]) % 12;
    return Math.min(d, 12 - d) * 30;
  };
  const second = ranked.find(([k, v]) => hueGap(k) >= 60 && v.w >= ranked[0][1].w * 0.08);
  if (second) {
    const [h2, s2, l2] = avg(second[1]);
    return [inkA, hsl(h2, clamp(s2, 0.4, 0.9), clamp(l2, 0.5, 0.78))];
  }
  // One-color cover: a neighbouring hue, darker, as the second ink.
  return [inkA, hsl(h1 + 28, clamp(s1, 0.4, 0.85), 0.48)];
}

// ---------- layout ----------

const PAD = 48;

/** The five staff lines the marks sit on, like notes. */
export const STAFF_LINES = [0, 1, 2, 3, 4].map((k) => 52 + k * 34);

// Each genre family gets its own line or space on the staff — its "pitch" —
// so a piece shows at a glance which sounds you kept coming back to.
const PITCH: Record<Family, number> = { edge: 0, beat: 1, pulse: 2, shard: 3, bloom: 4, wave: 5, grain: 6, arc: 7 };

/** Where the i-th swipe lands: across by order (the first in the middle, the next few spread out), up by genre. */
export function slotPosition(i: number, family: Family = 'bloom', variant = 0.5): Point {
  const fx = (0.5 + i * 0.6180339887) % 1;
  const step = (STAFF_LINES[4] - STAFF_LINES[0]) / 8;
  return { x: PAD + fx * (ART.width - PAD * 2), y: STAFF_LINES[0] + PITCH[family] * step + (variant - 0.5) * 10 };
}

/** A smooth thread through the revealed songs, in order (Catmull-Rom as cubic Béziers). */
export function threadPath(points: Point[]): string {
  if (points.length < 2) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

// ---------- the marks themselves ----------

type Geo = { d: string; mode: 'fill' | 'stroke'; width?: number };

function place(points: Point[], cx: number, cy: number, angle: number, shift: Point = { x: 0, y: 0 }): Point[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => ({ x: cx + shift.x + p.x * cos - p.y * sin, y: cy + shift.y + p.x * sin + p.y * cos }));
}

const n1 = (v: number) => Math.round(v * 10) / 10;
const line = (pts: Point[], closed = false) => `M${pts.map((p) => `${n1(p.x)} ${n1(p.y)}`).join(' L')}${closed ? ' Z' : ''}`;
const circle = (c: Point, r: number) =>
  `M${n1(c.x - r)} ${n1(c.y)} A${n1(r)} ${n1(r)} 0 1 0 ${n1(c.x + r)} ${n1(c.y)} A${n1(r)} ${n1(r)} 0 1 0 ${n1(c.x - r)} ${n1(c.y)} Z`;

/** One ink layer of a family's shape, in local coordinates placed at (cx, cy). */
function familyLayers(p: Print, cx: number, cy: number, shift: Point): { a: Geo[]; b: Geo[] } {
  const s = p.size;
  const rand = mulberry32(p.seed ^ 0x9e3779b9);
  const at = (pts: Point[], off: Point = { x: 0, y: 0 }) => place(pts, cx, cy, p.rotation, off);

  switch (p.family) {
    case 'beat': {
      const bars = 3 + Math.floor(p.variant * 3);
      const w = s * 0.26;
      const gap = s * 0.12;
      const total = bars * w + (bars - 1) * gap;
      const a: Geo[] = [];
      for (let i = 0; i < bars; i++) {
        const h = s * (0.6 + rand() * 1.1);
        const x0 = -total / 2 + i * (w + gap);
        a.push({ d: line(at([{ x: x0, y: s * 0.6 }, { x: x0 + w, y: s * 0.6 }, { x: x0 + w, y: s * 0.6 - h }, { x: x0, y: s * 0.6 - h }]), true), mode: 'fill' });
      }
      const base = at([{ x: -total / 2 - gap, y: s * 0.68 }, { x: total / 2 + gap, y: s * 0.68 }, { x: total / 2 + gap, y: s * 0.86 }, { x: -total / 2 - gap, y: s * 0.86 }], shift);
      return { a, b: [{ d: line(base, true), mode: 'fill' }] };
    }
    case 'pulse': {
      const rings = 2 + Math.floor(p.variant * 3);
      const a: Geo[] = [];
      for (let i = 0; i < rings; i++) a.push({ d: circle({ x: cx, y: cy }, s * (0.45 + (0.55 * (i + 1)) / rings)), mode: 'stroke', width: s * 0.09 });
      return { a, b: [{ d: circle({ x: cx + shift.x, y: cy + shift.y }, s * 0.28), mode: 'fill' }] };
    }
    case 'edge': {
      const teeth = 4 + Math.floor(p.variant * 4);
      const pts: Point[] = [];
      for (let i = 0; i <= teeth; i++) pts.push({ x: -s + (2 * s * i) / teeth, y: (i % 2 ? -1 : 1) * s * (0.3 + rand() * 0.45) });
      return {
        a: [{ d: line(at(pts)), mode: 'stroke', width: s * 0.17 }],
        b: [{ d: line(at(pts.map((q) => ({ x: q.x * 0.8, y: -q.y * 0.6 })), shift)), mode: 'stroke', width: s * 0.08 }],
      };
    }
    case 'bloom': {
      const angle = p.variant * Math.PI * 2;
      const inner = { x: cx + Math.cos(angle) * s * 0.4 + shift.x, y: cy + Math.sin(angle) * s * 0.4 + shift.y };
      return { a: [{ d: circle({ x: cx, y: cy }, s * 0.8), mode: 'fill' }], b: [{ d: circle(inner, s * 0.42), mode: 'fill' }] };
    }
    case 'wave': {
      const periods = 1.2 + p.variant * 1.3;
      const wave = (amp: number, phase: number) => {
        const pts: Point[] = [];
        for (let i = 0; i <= 28; i++) {
          const t = i / 28;
          pts.push({ x: -s * 1.1 + t * s * 2.2, y: Math.sin(t * periods * Math.PI * 2 + phase) * amp });
        }
        return pts;
      };
      return {
        a: [{ d: line(at(wave(s * 0.42, 0))), mode: 'stroke', width: s * 0.16 }],
        b: [{ d: line(at(wave(s * 0.3, Math.PI * 0.6), shift)), mode: 'stroke', width: s * 0.07 }],
      };
    }
    case 'grain': {
      const count = 5 + Math.floor(p.variant * 4);
      const a: Geo[] = [];
      for (let i = 0; i < count; i++) {
        const y = -s * 0.8 + (1.6 * s * i) / (count - 1);
        const half = s * (0.5 + rand() * 0.4);
        a.push({ d: line(at([{ x: -half, y }, { x: half, y }])), mode: 'stroke', width: s * 0.07 });
      }
      const b: Geo[] = [];
      for (let i = 0; i < 3; i++) {
        const x = -s * 0.5 + s * 0.5 * i;
        b.push({ d: line(at([{ x, y: -s * 0.7 }, { x: x + s * 0.3, y: s * 0.7 }], shift)), mode: 'stroke', width: s * 0.06 });
      }
      return { a, b };
    }
    case 'shard': {
      const tri = (r: number) =>
        [0, 1, 2].map((i) => {
          const ang = (i / 3) * Math.PI * 2 + (rand() - 0.5) * 0.9;
          return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
        });
      return { a: [{ d: line(at(tri(s)), true), mode: 'fill' }], b: [{ d: line(at(tri(s * 0.5), shift), true), mode: 'fill' }] };
    }
    case 'arc': {
      const half: Point[] = [];
      for (let i = 0; i <= 16; i++) {
        const ang = Math.PI + (i / 16) * Math.PI;
        half.push({ x: Math.cos(ang) * s, y: Math.sin(ang) * s + s * 0.35 });
      }
      const outer: Point[] = [];
      for (let i = 0; i <= 16; i++) {
        const ang = Math.PI + (i / 16) * Math.PI;
        outer.push({ x: Math.cos(ang) * s * 1.3, y: Math.sin(ang) * s * 1.3 + s * 0.35 });
      }
      return { a: [{ d: line(at(half), true), mode: 'fill' }], b: [{ d: line(at(outer, shift)), mode: 'stroke', width: s * 0.07 }] };
    }
  }
}

/** The SVG shapes for one mark centred at (cx, cy). */
export function markShapes(mark: Mark, cx: number, cy: number): Shape[] {
  const p = mark.print;
  const shift = { x: p.offset.dx, y: p.offset.dy };
  const { a, b } = familyLayers(p, cx, cy, shift);
  const out: Shape[] = [];
  if (mark.kind === 'ghost') {
    for (const g of a) out.push({ d: g.d, stroke: GHOST, strokeWidth: g.mode === 'stroke' ? Math.max(1.2, (g.width ?? 2) * 0.35) : 1.4, opacity: 0.26 });
  } else {
    const [inkA, inkB] = p.inks;
    for (const g of a) out.push(g.mode === 'fill' ? { d: g.d, fill: inkA, opacity: 0.95 } : { d: g.d, stroke: inkA, strokeWidth: g.width, opacity: 0.95 });
    for (const g of b) out.push(g.mode === 'fill' ? { d: g.d, fill: inkB, opacity: 0.82 } : { d: g.d, stroke: inkB, strokeWidth: g.width, opacity: 0.85 });
  }
  if (mark.saved) out.push({ d: circle({ x: cx + p.size * 0.95, y: cy - p.size * 0.95 }, 5), fill: SIGNAL, opacity: 1 });
  return out;
}

// ---------- the canvas ----------

export function addMark(canvas: ArtCanvas, mark: Mark, now: number): { canvas: ArtCanvas; finished?: ArtCanvas } {
  if (canvas.marks.some((m) => m.trackId === mark.trackId)) return { canvas };
  const marks = [...canvas.marks, mark];
  if (marks.length < ART.slots) return { canvas: { ...canvas, marks } };
  return {
    canvas: { number: canvas.number + 1, startedAt: now, marks: [] },
    finished: { ...canvas, marks, finishedAt: now },
  };
}

export function markSaved(canvas: ArtCanvas, trackId: number): ArtCanvas {
  if (!canvas.marks.some((m) => m.trackId === trackId && !m.saved)) return canvas;
  return { ...canvas, marks: canvas.marks.map((m) => (m.trackId === trackId ? { ...m, saved: true } : m)) };
}

/** Undo: take back the newest mark, but only if it belongs to the song being undone. */
export function removeLastMark(canvas: ArtCanvas, trackId: number): ArtCanvas {
  const last = canvas.marks[canvas.marks.length - 1];
  return last?.trackId === trackId ? { ...canvas, marks: canvas.marks.slice(0, -1) } : canvas;
}
