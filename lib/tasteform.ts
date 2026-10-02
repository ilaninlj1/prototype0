// The Tasteform: every saved song is a cell of one living shape, painted with
// its cover's color. "Shape" grows it the organic way — each genre reaches in
// its own direction, famous artists sit in the middle, rare finds out at the
// edge. The other modes re-form the same cells into labeled islands (by
// genre, listeners, color or month) big enough to see every cover.
// Pure — the drawing is components/tasteform/.

import type { CoverColor } from './cover-color';
import type { DiscoveryTrack, SwipeEntry } from './discovery';

export type FormSong = {
  id: number;
  genre: string;
  listeners?: number;
  likedAt?: number;
  color?: CoverColor;
  /** Saved from the blind card, before the reveal. */
  blind: boolean;
  /** Saved within the first few seconds of hearing it. */
  quick: boolean;
  /** 0 (calm) to 1 (intense), measured from the song's audio. Unknown until it's been analyzed. */
  energy?: number;
};

/**
 * What a song's audio measures as (see lib/song-feel-api.ts). Tempo is kept but too shaky on 30s clips to
 * drive anything. The rest are optional: songs measured before 2026-10-02 only kept energy, valence and tempo.
 */
export type SongFeel = {
  energy: number;
  valence: number;
  tempo: number;
  danceability?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
  speechiness?: number;
  loudness?: number;
};

/** Saved within this much listening counts as a quick call — its cell grows a little bigger. */
const QUICK_MS = 8_000;

/** Liked songs as cells. A save is blind when it came from the blind card's double-tap (a 'like' in swipe history). */
export function formSongs(
  liked: DiscoveryTrack[],
  history: SwipeEntry[],
  colors: Record<string, CoverColor>,
  feels: Record<number, SongFeel> = {}
): FormSong[] {
  const blindSaves = new Map<number, SwipeEntry>();
  for (const e of history) if (e.action === 'like') blindSaves.set(e.trackId, e);
  return liked.map((t) => {
    const save = blindSaves.get(t.id);
    return {
      id: t.id,
      genre: t.primaryGenreName,
      listeners: t.artistListeners,
      likedAt: t.likedAt,
      color: colors[t.artworkUrl100],
      blind: !!save,
      quick: save?.listenMs != null && save.listenMs < QUICK_MS,
      energy: feels[t.id]?.energy,
    };
  });
}

// ---------- Breathing ----------

/** One breath: half of it in ms (in, then out takes twice this) and how far it swells. */
export type Breath = { halfMs: number; depth: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const known = (songs: FormSong[]) => songs.flatMap((s) => (s.energy == null ? [] : [s.energy]));

/** The whole body breathes at the average energy of your saves: calm music slow and deep, intense music quick. */
export function bodyBreath(songs: FormSong[]): Breath {
  const e = known(songs);
  if (!e.length) return { halfMs: 2600, depth: 1.018 };
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  return { halfMs: Math.round(lerp(3000, 900, mean)), depth: lerp(1.012, 1.03, mean) };
}

/** Each cell also pulses at its own song's energy, so a calm island and a loud one move differently. */
export function cellBreath(energy?: number): Breath | null {
  if (energy == null) return null;
  return { halfMs: Math.round(lerp(2400, 650, energy)), depth: lerp(1.04, 1.1, energy) };
}

/** One plain sentence about the pace, once at least 3 songs have been measured. */
export function describeBreath(songs: FormSong[]): string | null {
  const e = known(songs);
  if (e.length < 3) return null;
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  if (mean < 0.4) return 'It breathes slowly: most of what you save is calm.';
  if (mean > 0.65) return 'It breathes fast: most of what you save is high-energy.';
  return 'It breathes at an easy pace: your saves mix calm and loud.';
}

export type Mode = 'shape' | 'genre' | 'listeners' | 'color' | 'when';

export const MODES: { id: Mode; label: string; caption: string }[] = [
  {
    id: 'shape',
    label: 'Shape',
    caption: 'Each genre grows its own way. Famous artists sit in the middle, your rarest finds reach the edges.',
  },
  {
    id: 'genre',
    label: 'Genre',
    caption: 'Your saves by genre. Tap a cover to hear it.',
  },
  {
    id: 'listeners',
    label: 'Listeners',
    caption: 'From everyone-knows-it to almost nobody. Tap a cover to hear it.',
  },
  {
    id: 'color',
    label: 'Color',
    caption: 'Your saves by cover color. Tap a cover to hear it.',
  },
  {
    id: 'when',
    label: 'When',
    caption: 'Newest month first, first saves in the middle. Tap a cover to hear it.',
  },
];

/** r: the body's radius around the cell. d: the cover's diameter. */
export type Cell = { id: number; x: number; y: number; r: number; d: number };
export type Label = { text: string; x: number; y: number };
/** A small droplet a high-energy song throws off its cell, in its cover's color. Shape view only. */
export type Bud = { parent: number; x: number; y: number; r: number };
export type Form = {
  width: number;
  height: number;
  cells: Cell[];
  labels: Label[];
  buds: Bud[];
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Stable 0–1 per song, so the shape doesn't reshuffle between visits. */
const hash = (id: number, salt: number) => (Math.imul(id ^ salt, 2654435761) >>> 0) / 4294967296;

function byLikedAt(songs: FormSong[]): FormSong[] {
  return songs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.likedAt ?? 0) - (b.s.likedAt ?? 0) || a.i - b.i)
    .map((x) => x.s);
}

/** 0 for a 5M-listener artist (the middle), 1 for 2K or fewer (the edge). Unknown sits halfway. */
export function obscurity(listeners?: number): number {
  if (listeners == null || listeners <= 0) return 0.5;
  const hi = Math.log10(5_000_000);
  const lo = Math.log10(2_000);
  return clamp((hi - Math.log10(listeners)) / (hi - lo), 0, 1);
}

/**
 * iTunes genre names are many and oddly specific ("Urbano latino", "Classical
 * Crossover"). Songs grow and group by family instead, so a handful of saves
 * makes a few real branches, not a dozen one-song islands. First match wins.
 */
const FAMILIES: [string, RegExp][] = [
  ['Hip-Hop', /hip.?hop|rap\b|drill|grime|trap/i],
  ['R&B & Soul', /r&b|soul|funk/i],
  ['Latin', /latin|urbano|reggaet|salsa|bachata|cumbia|mexican|tropical/i],
  ['Electronic', /electr|dance|house|techno|ambient|dubstep|drum|trance|idm|downtempo|breakbeat|garage|disco/i],
  ['Jazz', /jazz|bebop|bossa|swing/i],
  ['Classical', /classical|opera|soundtrack|score|orchestra/i],
  ['Country & Folk', /country|folk|americana|bluegrass|singer\/songwriter/i],
  ['World', /world|afro|amapiano|reggae|dancehall|african|brazil/i],
  ['Alternative', /alternative|indie|shoegaze|lo-fi/i],
  ['Rock', /rock|metal|punk|grunge|emo|hardcore/i],
  ['Pop', /pop/i],
];

export function genreFamily(genre: string): string {
  return FAMILIES.find(([, re]) => re.test(genre))?.[0] ?? (genre || 'Other');
}

// ---------- Shape ----------

const SHAPE_COVER = 12;
const SHAPE_BODY = 16;
/** How big a small shape may be drawn; keeps 3 saves a cell, not a poster. */
const SHAPE_MAX_SCALE = 2.4;

function shapeLayout(songs: FormSong[], width: number, height: number): Form {
  const ordered = byLikedAt(songs);
  const n = ordered.length;
  const genreAngle = new Map<string, number>();
  for (const s of ordered) {
    const family = genreFamily(s.genre);
    if (!genreAngle.has(family)) genreAngle.set(family, -Math.PI / 2 + genreAngle.size * GOLDEN);
  }

  // Few saves huddle into one cell; the branches reach out as the count grows.
  const reach = 120 * clamp((n - 2) / 28, 0, 1);
  const pts = ordered.map((s) => {
    const angle = genreAngle.get(genreFamily(s.genre))! + (hash(s.id, 1) - 0.5) * 0.7;
    const rho = 6 + obscurity(s.listeners) * reach * (0.8 + 0.4 * hash(s.id, 2));
    return {
      id: s.id,
      x: Math.cos(angle) * rho,
      y: Math.sin(angle) * rho,
      r: SHAPE_BODY * (s.quick ? 1.25 : 1),
    };
  });

  // Push overlapping covers apart; the bodies still overlap and merge.
  const min = SHAPE_COVER * 1.12;
  // About 3M pair checks at most, however many saves there are.
  const rounds = clamp(Math.round(6e6 / (n * n)), 12, 80);
  for (let k = 0, moved = true; k < rounds && moved; k++) {
    moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-6) {
          const t = hash(a.id + b.id, 3) * Math.PI * 2;
          dx = Math.cos(t);
          dy = Math.sin(t);
          d = 1;
        }
        const push = (min - Math.min(d, min)) / 2 + 0.01;
        moved = true;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }

  // Fit to the canvas, centered, with room for the body's soft edge.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x - p.r * 1.4);
    y0 = Math.min(y0, p.y - p.r * 1.4);
    x1 = Math.max(x1, p.x + p.r * 1.4);
    y1 = Math.max(y1, p.y + p.r * 1.4);
  }
  const pad = 12;
  const scale = n ? Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0), SHAPE_MAX_SCALE) : 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cells = pts.map((p) => ({
    id: p.id,
    x: width / 2 + (p.x - cx) * scale,
    y: height / 2 + (p.y - cy) * scale,
    r: p.r * scale,
    d: SHAPE_COVER * scale,
  }));
  const energy = new Map(songs.map((s) => [s.id, s.energy]));
  return { width, height, cells, labels: [], buds: sprout(cells, energy, width, height) };
}

/** Songs at least this energetic sprout. */
const BUD_MIN = 0.55;

/**
 * High-energy songs throw off 1–3 small buds just outside their cell, facing
 * the way the shape grows, so a loud collection looks like it's bursting at
 * the edges. Near ones melt into the body as nubs, far ones float free. Buds
 * that would land inside another cell or off the canvas are dropped; they
 * never move the cells.
 */
function sprout(cells: Cell[], energy: Map<number, number | undefined>, width: number, height: number): Bud[] {
  const buds: Bud[] = [];
  for (const c of cells) {
    const e = energy.get(c.id);
    if (e == null || e < BUD_MIN) continue;
    const count = e >= 0.85 ? 3 : e >= 0.7 ? 2 : 1;
    const away = Math.hypot(c.x - width / 2, c.y - height / 2);
    const out = away > 1 ? Math.atan2(c.y - height / 2, c.x - width / 2) : hash(c.id, 9) * 2 * Math.PI;
    const grow = lerp(0.85, 1.15, (e - BUD_MIN) / (1 - BUD_MIN));
    for (let k = 0; k < count; k++) {
      const angle = out + (k - (count - 1) / 2) * 0.9 + (hash(c.id, 10 + k) - 0.5) * 0.5;
      const dist = c.r * (1.45 + 0.7 * hash(c.id, 20 + k));
      const r = c.r * (0.24 + 0.14 * hash(c.id, 30 + k)) * grow;
      const x = c.x + Math.cos(angle) * dist;
      const y = c.y + Math.sin(angle) * dist;
      if (x - r < 0 || x + r > width || y - r < 0 || y + r > height) continue;
      if (cells.some((o) => o !== c && Math.hypot(o.x - x, o.y - y) < o.r)) continue;
      buds.push({ parent: c.id, x, y, r });
    }
  }
  return buds;
}

// ---------- Islands (genre, listeners, color, when) ----------

type Group = { key: string; label: string; order: number; songs: FormSong[] };

const LISTENER_BANDS = [
  { min: 1_000_000, label: 'Everyone knows' },
  { min: 100_000, label: 'Known, not famous' },
  { min: 25_000, label: 'Under the radar' },
  { min: 0, label: 'Almost nobody' },
];

const HUES = [
  { to: 15, label: 'Red' },
  { to: 45, label: 'Orange' },
  { to: 70, label: 'Yellow' },
  { to: 165, label: 'Green' },
  { to: 255, label: 'Blue' },
  { to: 300, label: 'Purple' },
  { to: 345, label: 'Pink' },
  { to: 361, label: 'Red' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function groupKey(s: FormSong, mode: Mode): { key: string; label: string; order: number } {
  if (mode === 'listeners') {
    if (s.listeners == null) return { key: '?', label: 'Unknown', order: 9 };
    const i = LISTENER_BANDS.findIndex((b) => s.listeners! >= b.min);
    return { key: String(i), label: LISTENER_BANDS[i].label, order: i };
  }
  if (mode === 'color') {
    if (!s.color) return { key: '?', label: 'Loading', order: 99 };
    if (s.color.neutral) return { key: 'n', label: 'Black & white', order: 50 };
    const i = HUES.findIndex((h) => s.color!.hue < h.to);
    const label = HUES[i].label;
    return { key: label, label, order: label === 'Red' ? 0 : i };
  }
  if (mode === 'when') {
    if (!s.likedAt) return { key: '?', label: 'Earlier', order: Number.MAX_SAFE_INTEGER };
    const d = new Date(s.likedAt);
    const month = d.getFullYear() * 12 + d.getMonth();
    return {
      key: String(month),
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      order: -month,
    };
  }
  const family = genreFamily(s.genre);
  return { key: family, label: family, order: 0 };
}

function groupSongs(songs: FormSong[], mode: Mode): Group[] {
  const groups = new Map<string, Group>();
  for (const s of byLikedAt(songs)) {
    const k = groupKey(s, mode);
    const g = groups.get(k.key) ?? { ...k, songs: [] };
    g.songs.push(s);
    groups.set(k.key, g);
  }
  // Genres: biggest first. Everything else has a natural order.
  return [...groups.values()].sort((a, b) =>
    mode === 'genre' ? b.songs.length - a.songs.length || a.label.localeCompare(b.label) : a.order - b.order
  );
}

/** n points of a hex grid nearest the middle — a round honeycomb, stretched tall when it would be too wide. */
export function hexBlob(n: number, step: number, maxWidth: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const rowH = (step * Math.sqrt(3)) / 2;
  const cols = Math.ceil(Math.sqrt(n)) + 3;
  const rows = Math.ceil(n / Math.max(1, Math.floor(maxWidth / step))) + cols;
  const grid: { x: number; y: number; a: number }[] = [];
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const x = i * step + (Math.abs(j) % 2 ? step / 2 : 0);
      const y = j * rowH;
      grid.push({ x, y, a: Math.atan2(y, x) });
    }
  }
  for (let stretch = 1; ; stretch += 0.25) {
    const pick = grid
      .map((p) => ({
        ...p,
        d: Math.round(Math.hypot(p.x * stretch, p.y) * 1000),
      }))
      .sort((a, b) => a.d - b.d || a.a - b.a)
      .slice(0, n);
    const xs = pick.map((p) => p.x);
    const ys = pick.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs) + step;
    if (w <= maxWidth || stretch >= 12) {
      const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const my = (Math.max(...ys) + Math.min(...ys)) / 2;
      return pick.map((p) => ({ x: p.x - mx, y: p.y - my }));
    }
  }
}

export const LABEL_HEIGHT = 16;

function islandLayout(songs: FormSong[], mode: Mode, width: number): Form {
  const cover = songs.length > 150 ? 38 : width < 360 ? 44 : 48;
  const step = cover + 4;
  const pad = 12;
  // Wide enough that two islands' bodies never bridge (the field reaches 2r).
  const gapX = 40;
  const gapY = 28;
  const labelGap = 8;
  const maxW = width - 2 * pad;

  const blocks = groupSongs(songs, mode).map((g) => {
    const pts = hexBlob(g.songs.length, step, maxW);
    const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) + cover;
    const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) + cover;
    const text = `${g.label} · ${g.songs.length}`;
    // DM Mono at 11px is ~6.9px a character, tracked out.
    const bw = Math.min(maxW, Math.max(w, text.length * 7.8));
    return { g, pts, w, h, bw, bh: LABEL_HEIGHT + labelGap + h, text };
  });

  // Wrap islands into centered rows, each island's label on top.
  const rows: (typeof blocks)[] = [];
  for (const b of blocks) {
    const row = rows[rows.length - 1];
    const used = row ? row.reduce((s, x) => s + x.bw, 0) + gapX * row.length : Infinity;
    if (row && used + b.bw <= maxW) row.push(b);
    else rows.push([b]);
  }

  const cells: Cell[] = [];
  const labels: Label[] = [];
  let top = pad;
  for (const row of rows) {
    const rowW = row.reduce((s, x) => s + x.bw, 0) + gapX * (row.length - 1);
    let left = (width - rowW) / 2;
    for (const b of row) {
      const cx = left + b.bw / 2;
      labels.push({ text: b.text, x: cx, y: top });
      const cy = top + LABEL_HEIGHT + labelGap + b.h / 2;
      b.pts.forEach((p, i) =>
        cells.push({
          id: b.g.songs[i].id,
          x: cx + p.x,
          y: cy + p.y,
          r: cover / 2 + 6,
          d: cover,
        })
      );
      left += b.bw + gapX;
    }
    top += Math.max(...row.map((b) => b.bh)) + gapY;
  }
  return { width, height: Math.max(top - gapY + pad, 120), cells, labels, buds: [] };
}

/** Where every song sits for this mode. Shape fills a square; islands grow as tall as they need. */
export function formLayout(songs: FormSong[], mode: Mode, width: number): Form {
  return mode === 'shape' ? shapeLayout(songs, width, width) : islandLayout(songs, mode, width);
}

// ---------- The body ----------

/**
 * The outline of the living body: a metaball field (each cell a soft bump
 * reaching 2r) traced at the level where a lone cell's edge sits at r, so
 * near cells melt together and far ones stay islands. Returns an SVG path,
 * smoothed, drawn even-odd so any enclosed gap stays open.
 */
export function bodyPath(cells: Pick<Cell, 'x' | 'y' | 'r'>[], width: number, height: number, step = 4): string {
  if (!cells.length) return '';
  const nx = Math.ceil(width / step) + 1;
  const ny = Math.ceil(height / step) + 1;
  const f = new Float32Array(nx * ny);
  for (const c of cells) {
    const R = 2 * c.r;
    const R2 = R * R;
    const i0 = Math.max(1, Math.floor((c.x - R) / step));
    const i1 = Math.min(nx - 2, Math.ceil((c.x + R) / step));
    const j0 = Math.max(1, Math.floor((c.y - R) / step));
    const j1 = Math.min(ny - 2, Math.ceil((c.y + R) / step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i * step - c.x;
        const dy = j * step - c.y;
        const q = (dx * dx + dy * dy) / R2;
        if (q < 1) f[j * nx + i] += (1 - q) * (1 - q);
      }
    }
  }
  const T = 0.5625; // (1 - (r/2r)²)²
  const at = (i: number, j: number) => f[j * nx + i];

  // Marching squares. Edge ids: 2k = the edge right of grid point k, 2k+1 = the edge below it.
  const point = new Map<number, [number, number]>();
  const cross = (id: number): [number, number] => {
    const hit = point.get(id);
    if (hit) return hit;
    const k = id >> 1;
    const i = k % nx;
    const j = (k - i) / nx;
    const [i2, j2] = id & 1 ? [i, j + 1] : [i + 1, j];
    const a = at(i, j);
    const b = at(i2, j2);
    const t = (T - a) / (b - a);
    const p: [number, number] = [(i + (i2 - i) * t) * step, (j + (j2 - j) * t) * step];
    point.set(id, p);
    return p;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const top = 2 * k;
      const left = 2 * k + 1;
      const bottom = 2 * (k + nx);
      const right = 2 * (k + 1) + 1;
      const c = (at(i, j) > T ? 8 : 0) | (at(i + 1, j) > T ? 4 : 0) | (at(i + 1, j + 1) > T ? 2 : 0) | (at(i, j + 1) > T ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 > T;
      switch (c) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(left, top);
          break;
        case 5:
          if (mid) {
            link(left, top);
            link(bottom, right);
          } else {
            link(top, right);
            link(left, bottom);
          }
          break;
        case 10:
          if (mid) {
            link(top, right);
            link(left, bottom);
          } else {
            link(left, top);
            link(bottom, right);
          }
          break;
      }
    }
  }

  // Walk each closed loop, then smooth it through its midpoints.
  const used = new Set<number>();
  const fmt = (v: number) => Math.round(v * 10) / 10;
  let d = '';
  for (const start of links.keys()) {
    if (used.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = start;
    while (!used.has(cur)) {
      used.add(cur);
      loop.push(cross(cur));
      const next = (links.get(cur) ?? []).find((e) => e !== prev && !used.has(e));
      if (next == null) break;
      prev = cur;
      cur = next;
    }
    if (loop.length < 3) continue;
    const m = (a: [number, number], b: [number, number]) => [fmt((a[0] + b[0]) / 2), fmt((a[1] + b[1]) / 2)];
    const first = m(loop[loop.length - 1], loop[0]);
    d += `M${first[0]} ${first[1]}`;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = m(p, loop[(i + 1) % loop.length]);
      d += `Q${fmt(p[0])} ${fmt(p[1])} ${q[0]} ${q[1]}`;
    }
    d += 'Z';
  }
  return d;
}
