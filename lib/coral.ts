// Coral's model: the links you made, the coral they grow into, and where a finger is on it. Pure, so the same links
// always draw the same coral and all of it runs under Node's test runner.

import {
  MAX_LINKS,
  MAX_START,
  type CoralLink,
  type CoralSong,
  type CoralState,
  type CoralTouch,
  type GardenBranch,
  type GardenLayout,
  type GardenNode,
  type LinkType,
  type Point,
} from './coral-types.ts';

// ---------------------------------------------------------------------------------------------------------------
// Links

export function emptyCoral(): CoralState {
  return { version: 1, links: [] };
}

const isType = (v: unknown): v is LinkType => v === 'fade' || v === 'cut';
const clampStart = (s: number) => (Number.isFinite(s) ? Math.max(0, Math.min(MAX_START, s)) : 0);
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// Keep only the fields the garden needs, so a whole DiscoveryTrack passed in doesn't end up in storage.
function cleanSong(v: unknown): CoralSong | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.trackId !== 'number' || !Number.isFinite(s.trackId)) return null;
  if (typeof s.trackName !== 'string' || typeof s.artistName !== 'string') return null;
  if (typeof s.previewUrl !== 'string' || typeof s.color !== 'string') return null;
  return { trackId: s.trackId, trackName: s.trackName, artistName: s.artistName, previewUrl: s.previewUrl, color: s.color };
}

function cleanLink(v: unknown): CoralLink | null {
  if (!v || typeof v !== 'object') return null;
  const l = v as Record<string, unknown>;
  const a = cleanSong(l.a);
  const b = cleanSong(l.b);
  if (!a || !b || a.trackId === b.trackId) return null;
  if (typeof l.id !== 'string' || !l.id || !isType(l.type)) return null;
  if (typeof l.createdAt !== 'number' || !Number.isFinite(l.createdAt)) return null;
  return {
    id: l.id,
    a,
    b,
    type: l.type,
    startA: clampStart(typeof l.startA === 'number' ? l.startA : 0),
    startB: clampStart(typeof l.startB === 'number' ? l.startB : 0),
    createdAt: l.createdAt,
  };
}

/** What was saved, made safe. Never throws: unreadable data is an empty coral, and a broken link is dropped alone. */
export function parseCoral(raw: string | null): CoralState {
  if (!raw) return emptyCoral();
  try {
    const data = JSON.parse(raw) as { version?: unknown; links?: unknown } | null;
    if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.links)) return emptyCoral();
    const links: CoralLink[] = [];
    const pairs = new Set<string>();
    const ids = new Set<string>();
    for (const item of data.links) {
      const link = cleanLink(item);
      if (!link) continue;
      const key = pairKey(link.a.trackId, link.b.trackId);
      if (pairs.has(key) || ids.has(link.id)) continue;
      pairs.add(key);
      ids.add(link.id);
      links.push(link);
      if (links.length === MAX_LINKS) break;
    }
    return { version: 1, links };
  } catch {
    return emptyCoral();
  }
}

/** Whether two songs can be joined, and if not, why. */
export function canLink(state: CoralState, a: CoralSong, b: CoralSong): 'ok' | 'same' | 'linked' | 'full' {
  if (a.trackId === b.trackId) return 'same';
  const key = pairKey(a.trackId, b.trackId);
  if (state.links.some((l) => pairKey(l.a.trackId, l.b.trackId) === key)) return 'linked';
  if (state.links.length >= MAX_LINKS) return 'full';
  return 'ok';
}

/** Join two songs. The id comes from the pair and the time, so the same call always makes the same link. */
export function addLink(state: CoralState, a: CoralSong, b: CoralSong, type: LinkType, now: number): CoralState {
  if (canLink(state, a, b) !== 'ok') return state;
  const songA = cleanSong(a);
  const songB = cleanSong(b);
  if (!songA || !songB || !isType(type)) return state;
  const link: CoralLink = {
    id: `${pairKey(a.trackId, b.trackId)}-${now}`,
    a: songA,
    b: songB,
    type,
    startA: 0,
    startB: 0,
    createdAt: now,
  };
  return { version: 1, links: [...state.links, link] };
}

export function removeLink(state: CoralState, linkId: string): CoralState {
  if (!state.links.some((l) => l.id === linkId)) return state;
  return { version: 1, links: state.links.filter((l) => l.id !== linkId) };
}

// One link changed, the rest untouched. The same state back when nothing changed, so the store can skip a save.
function patchLink(state: CoralState, linkId: string, patch: (l: CoralLink) => CoralLink): CoralState {
  let changed = false;
  const links = state.links.map((l) => {
    if (l.id !== linkId) return l;
    const next = patch(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { version: 1, links } : state;
}

export function setLinkType(state: CoralState, linkId: string, type: LinkType): CoralState {
  if (!isType(type)) return state;
  return patchLink(state, linkId, (l) => (l.type === type ? l : { ...l, type }));
}

/** Where one end's song comes in, kept inside 0..MAX_START. */
export function setLinkStart(state: CoralState, linkId: string, end: 'a' | 'b', seconds: number): CoralState {
  const s = clampStart(seconds);
  return patchLink(state, linkId, (l) => {
    if (end === 'a') return l.startA === s ? l : { ...l, startA: s };
    return l.startB === s ? l : { ...l, startB: s };
  });
}

/** How much of song b is heard at t along a branch. Fade follows the finger; cut switches at the middle. */
export function mixFor(type: LinkType, t: number): number {
  const c = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  if (type === 'cut') return c < 0.5 ? 0 : 1;
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// Layout

/** Nodes keep at least this far from the edge of the box, measured from their rim. */
export const GARDEN_MARGIN = 12;
/** How many points each branch is drawn with. */
export const BRANCH_POINTS = 24;

/** The y of the sea floor in a box this tall. Every colony's root sits on it, or just above when roots are crowded. */
export function gardenFloor(height: number): number {
  // Leave room for the largest root's 23.4 point radius.
  return height - Math.max(GARDEN_MARGIN + 24, height * 0.1);
}

const unit = (seed: number, salt: number) => {
  const v = Math.sin(((seed % 9973) + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

const UP = -Math.PI / 2;
const LENGTHS = [1, 0.8, 1.25, 0.62, 1.55];
const TURNS: number[] = [0];
for (let d = 0.25; d <= 3.01; d += 0.25) TURNS.push(d, -d);

type Grow = {
  trackId: number;
  color: string;
  links: number;
  parent: number;
  kids: number[];
  depth: number;
  colony: number;
  x: number;
  y: number;
  r: number;
  heading: number;
  placed: boolean;
};

type Tree = { grows: Grow[]; roots: number[]; sizes: number[]; loops: Set<number>; sorted: CoralLink[] };

// Split the links into colonies. Each colony is rooted at its oldest song and spreads through its links oldest
// first; a link between two songs already in the colony closes a loop.
function buildTree(links: CoralLink[]): Tree {
  const sorted = links
    .filter((l) => l.a.trackId !== l.b.trackId)
    .sort((p, q) => p.createdAt - q.createdAt || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const index = new Map<number, number>();
  const grows: Grow[] = [];
  const next: { other: number; link: number }[][] = [];
  const nodeFor = (s: CoralSong) => {
    let i = index.get(s.trackId);
    if (i === undefined) {
      i = grows.length;
      index.set(s.trackId, i);
      grows.push({ trackId: s.trackId, color: s.color, links: 0, parent: -1, kids: [], depth: 0, colony: -1, x: 0, y: 0, r: 0, heading: UP, placed: false });
      next.push([]);
    }
    return i;
  };
  sorted.forEach((l, li) => {
    const a = nodeFor(l.a);
    const b = nodeFor(l.b);
    grows[a].links += 1;
    grows[b].links += 1;
    next[a].push({ other: b, link: li });
    next[b].push({ other: a, link: li });
  });
  const roots: number[] = [];
  const sizes: number[] = [];
  const inTree = new Set<number>();
  for (let i = 0; i < grows.length; i++) {
    if (grows[i].colony >= 0) continue;
    const colony = roots.length;
    roots.push(i);
    grows[i].colony = colony;
    let size = 1;
    const queue = [i];
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q];
      for (const { other, link } of next[at]) {
        if (grows[other].colony >= 0) continue;
        grows[other].colony = colony;
        grows[other].parent = at;
        grows[other].depth = grows[at].depth + 1;
        grows[at].kids.push(other);
        inTree.add(link);
        queue.push(other);
        size += 1;
      }
    }
    sizes.push(size);
  }
  const loops = new Set<number>();
  sorted.forEach((_, li) => {
    if (!inTree.has(li)) loops.add(li);
  });
  return { grows, roots, sizes, loops, sorted };
}

function segDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * f), py - (ay + dy * f));
}

// One try at growing every colony at this size. False when something would not fit, so the caller can go smaller.
function grow(tree: Tree, width: number, height: number, margin: number, shrink: number): boolean {
  const { grows, roots, sizes } = tree;
  const n = grows.length;
  const room = Math.sqrt((width * height) / n);
  const r0 = Math.max(8, Math.min(18, room * 0.16)) * shrink;
  const gap = Math.max(3, r0 * 0.35);
  const reachLen = Math.max(r0 * 3.4, Math.min(room * 0.95, height * 0.34, 160)) * shrink;
  const floor = gardenFloor(height);
  for (const g of grows) {
    // A song with more branches is a slightly bigger polyp.
    g.r = r0 * (1 + 0.1 * Math.min(3, g.links - 1));
    g.placed = false;
  }
  const rMax = r0 * 1.3;
  const placed: Grow[] = [];

  const inside = (x: number, y: number, r: number) =>
    x >= margin + r && x <= width - margin - r && y >= margin + r && y <= floor;
  const clear = (x: number, y: number, r: number, extra: number) => {
    for (const o of placed) if (Math.hypot(o.x - x, o.y - y) < o.r + r + gap + extra) return false;
    return true;
  };
  // Roomy: the new branch doesn't run through another song, and the new song doesn't sit on another branch.
  const roomy = (from: Grow, x: number, y: number, r: number) => {
    for (const o of placed) {
      if (o !== from && segDistance(o.x, o.y, from.x, from.y, x, y) < o.r + gap) return false;
      if (o.parent >= 0 && o !== from) {
        const p = grows[o.parent];
        if (p !== from && segDistance(x, y, p.x, p.y, o.x, o.y) < r + gap) return false;
      }
    }
    return true;
  };

  // Roots: each colony gets a share of the floor by its size. Crowded roots step up in rows so they don't touch.
  const left = margin + rMax;
  const span = width - 2 * left;
  if (span <= 0 || floor < margin + rMax) return false;
  const weights = sizes.map((s) => Math.pow(s, 0.7));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const tightest = (span * Math.min(...weights)) / total;
  const need = 2 * rMax + gap;
  const rows = roots.length === 1 || tightest >= need ? 1 : tightest * 2 >= need ? 2 : 3;
  let x0 = left;
  for (let c = 0; c < roots.length; c++) {
    const g = grows[roots[c]];
    const share = (span * weights[c]) / total;
    const wiggle = roots.length === 1 ? span * 0.12 : Math.max(0, share - need) * 0.25;
    g.x = x0 + share / 2 + (unit(g.trackId, 1) - 0.5) * 2 * wiggle;
    g.y = floor - (c % rows) * need;
    g.heading = UP + (unit(g.trackId, 2) - 0.5) * 0.3;
    x0 += share;
    if (g.x < margin + g.r || g.x > width - margin - g.r || g.y < margin + g.r || !clear(g.x, g.y, g.r, 0)) return false;
    g.placed = true;
    placed.push(g);
  }

  // Grow outward a level at a time across every colony, so no colony takes all the water before the others start.
  const queue = [...roots];
  for (let q = 0; q < queue.length; q++) {
    const from = grows[queue[q]];
    const k = from.kids.length;
    const fan = Math.min(from.parent < 0 ? 2.6 : 1.9, 0.62 * (k - 1));
    for (let i = 0; i < k; i++) {
      const g = grows[from.kids[i]];
      const off = k === 1 ? (unit(g.trackId, 3) - 0.5) * 0.9 : -fan / 2 + (fan * i) / (k - 1) + (unit(g.trackId, 3) - 0.5) * 0.2;
      // Lean every branch a little back toward straight up, and never start one pointing down.
      let want = from.heading + off;
      want += (UP - want) * 0.3;
      want = Math.max(-Math.PI + 0.2, Math.min(-0.2, want));
      const len = reachLen * (k > 4 ? [1, 0.7, 1.3][i % 3] : 1) * (0.85 + 0.3 * unit(g.trackId, 4)) * Math.max(0.6, Math.pow(0.93, g.depth - 1));
      const flip = unit(g.trackId, 5) < 0.5 ? 1 : -1;
      let done = false;
      for (let pass = 0; pass < 2 && !done; pass++) {
        for (let li = 0; li < LENGTHS.length && !done; li++) {
          for (let ti = 0; ti < TURNS.length && !done; ti++) {
            const ang = want + TURNS[ti] * flip;
            const d = len * LENGTHS[li];
            const x = from.x + Math.cos(ang) * d;
            const y = from.y + Math.sin(ang) * d;
            if (!inside(x, y, g.r)) continue;
            if (pass === 0) {
              // First choice: up off the floor, not drooping, with room around it.
              if (y > floor - g.r || y > from.y + d * 0.3) continue;
              if (!clear(x, y, g.r, gap) || !roomy(from, x, y, g.r)) continue;
            } else if (!clear(x, y, g.r, 0)) continue;
            g.x = x;
            g.y = y;
            done = true;
          }
        }
      }
      if (!done) {
        // Nothing near the parent: take the closest free spot anywhere in the water.
        let best = Infinity;
        const step = Math.max(4, g.r);
        for (let y = margin + g.r; y <= floor; y += step) {
          for (let x = margin + g.r; x <= width - margin - g.r; x += step) {
            const away = Math.hypot(x - from.x, y - from.y);
            if (away >= best || !clear(x, y, g.r, 0)) continue;
            best = away;
            g.x = x;
            g.y = y;
            done = true;
          }
        }
      }
      if (!done) return false;
      g.heading = Math.atan2(g.y - from.y, g.x - from.x);
      g.placed = true;
      placed.push(g);
      queue.push(from.kids[i]);
    }
  }
  return true;
}

// A curve from p to q bent through c, as evenly spaced points. The ends are exactly p and q.
function curvePoints(p: Point, c: Point, q: Point): Point[] {
  const DENSE = 72;
  const dense: Point[] = [];
  const run: number[] = [0];
  for (let i = 0; i <= DENSE; i++) {
    const t = i / DENSE;
    const u = 1 - t;
    dense.push({ x: u * u * p.x + 2 * u * t * c.x + t * t * q.x, y: u * u * p.y + 2 * u * t * c.y + t * t * q.y });
    if (i > 0) run.push(run[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  const total = run[DENSE];
  const out: Point[] = [{ x: p.x, y: p.y }];
  let at = 1;
  for (let i = 1; i < BRANCH_POINTS - 1; i++) {
    const want = (total * i) / (BRANCH_POINTS - 1);
    while (at < DENSE && run[at] < want) at++;
    const piece = run[at] - run[at - 1];
    const f = piece > 0 ? (want - run[at - 1]) / piece : 0;
    out.push({ x: dense[at - 1].x + (dense[at].x - dense[at - 1].x) * f, y: dense[at - 1].y + (dense[at].y - dense[at - 1].y) * f });
  }
  out.push({ x: q.x, y: q.y });
  return out;
}

/**
 * The coral for these links in a box width by height. Each connected group of songs is a colony rooted on the floor
 * at its oldest song; the rest branch up and out from it, and a link that closes a loop arches between its two songs.
 * The order of `links` doesn't matter: the same set always gives the same coral.
 */
export function layoutGarden(links: CoralLink[], width: number, height: number): GardenLayout {
  const empty: GardenLayout = { width, height, nodes: [], branches: [] };
  if (!(width > 0) || !(height > 0)) return empty;
  const tree = buildTree(links);
  if (tree.grows.length === 0) return empty;
  const margin = Math.min(GARDEN_MARGIN, Math.min(width, height) / 8);

  // Go smaller until everything fits. A phone-sized box fits at full size; the loop is for tiny boxes.
  let shrink = 1;
  let fits = false;
  for (let attempt = 0; attempt < 40 && !fits; attempt++) {
    fits = grow(tree, width, height, margin, shrink);
    if (!fits) shrink *= 0.88;
  }
  if (!fits) return empty;

  const { grows, roots, loops, sorted } = tree;
  const byId = new Map<number, Grow>();
  for (const g of grows) byId.set(g.trackId, g);
  const hold = (v: number, max: number) => Math.max(margin, Math.min(max - margin, v));

  const branches: GardenBranch[] = sorted.map((link, li) => {
    const a = byId.get(link.a.trackId)!;
    const b = byId.get(link.b.trackId)!;
    const seed = a.trackId + b.trackId;
    let from = a;
    let to = b;
    let bend: number;
    const loop = loops.has(li);
    if (!loop && grows[a.parent] === b) {
      from = b;
      to = a;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // The two ways to bend: (nx, ny) and its opposite.
    let nx = -dy / len;
    let ny = dx / len;
    if (loop) {
      // An arch: over the top, or away from the colony's root when the two songs sit one above the other.
      const root = grows[roots[a.colony]];
      const flip = Math.abs(ny) > 0.3 ? ny > 0 : nx * ((from.x + to.x) / 2 - root.x) < 0;
      if (flip) {
        nx = -nx;
        ny = -ny;
      }
      bend = Math.max(28, Math.min(130, len * 0.45));
    } else {
      // A branch: sets off sideways and turns up, the way coral grows toward light.
      const flip = Math.abs(ny) > 0.2 ? ny < 0 : unit(seed, 6) < 0.5;
      if (flip) {
        nx = -nx;
        ny = -ny;
      }
      bend = len * (0.14 + 0.14 * unit(seed, 7));
    }
    const control = { x: hold((from.x + to.x) / 2 + nx * bend, width), y: hold((from.y + to.y) / 2 + ny * bend, height) };
    const points = curvePoints({ x: a.x, y: a.y }, control, { x: b.x, y: b.y });
    return { linkId: link.id, a: a.trackId, b: b.trackId, type: link.type, points };
  });

  const nodes: GardenNode[] = grows.map((g) => ({ trackId: g.trackId, x: g.x, y: g.y, r: g.r, color: g.color, links: g.links }));
  return { width, height, nodes, branches };
}

// ---------------------------------------------------------------------------------------------------------------
// Touch

// The closest point on a branch to (x, y): how far along it is, and how far away.
function project(branch: GardenBranch, x: number, y: number): { t: number; away: number } {
  const pts = branch.points;
  const last = pts.length - 1;
  if (last < 1) return { t: 0, away: pts.length ? Math.hypot(pts[0].x - x, pts[0].y - y) : Infinity };
  let best = Infinity;
  let t = 0;
  for (let i = 0; i < last; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len2 = dx * dx + dy * dy;
    const f = len2 > 0 ? Math.max(0, Math.min(1, ((x - pts[i].x) * dx + (y - pts[i].y) * dy) / len2)) : 0;
    const away = Math.hypot(x - (pts[i].x + dx * f), y - (pts[i].y + dy * f));
    if (away < best) {
      best = away;
      t = (i + f) / last;
    }
  }
  return { t, away: best };
}

/** What a touch landed on: the nearest branch within reach, and how far along it. */
export function hitBranch(layout: GardenLayout, x: number, y: number, reach: number): CoralTouch | null {
  let best: CoralTouch | null = null;
  let bestAway = reach;
  for (const branch of layout.branches) {
    const p = project(branch, x, y);
    if (p.away <= bestAway) {
      bestAway = p.away;
      best = { linkId: branch.linkId, t: p.t };
    }
  }
  return best;
}

/** The song a touch landed on: the nearest one within reach of its middle. A touch on the polyp itself always counts. */
export function hitNode(layout: GardenLayout, x: number, y: number, reach: number): number | null {
  let best: number | null = null;
  let bestAway = Infinity;
  for (const node of layout.nodes) {
    const away = Math.hypot(node.x - x, node.y - y);
    if (away <= Math.max(reach, node.r) && away < bestAway) {
      bestAway = away;
      best = node.trackId;
    }
  }
  return best;
}

/** How close to an end counts as being at that song. */
export const TRACE_END = 0.08;
// A finger at a junction is about as close to every branch there. It has to be this much closer to change branch.
const TRACE_SWITCH = 2;

/**
 * Where a moving finger is now. It stays on its branch while within reach. At an end it can carry on into another
 * branch that shares that song, landing on that branch's matching end, so the shared song is the one playing through
 * the change. It never jumps to a branch that doesn't share the song: that gives null, like leaving the coral.
 */
export function traceStep(layout: GardenLayout, prev: CoralTouch | null, x: number, y: number, reach: number): CoralTouch | null {
  const current = prev ? layout.branches.find((b) => b.linkId === prev.linkId) : undefined;
  if (!current) return hitBranch(layout, x, y, reach);
  const here = project(current, x, y);
  const atA = here.t < TRACE_END;
  const atB = here.t > 1 - TRACE_END;
  if (atA || atB) {
    const song = atA ? current.a : current.b;
    let best: CoralTouch | null = null;
    // Still on this branch: another has to be clearly closer. Off it: any branch at this song within reach will do.
    let bestAway = here.away <= reach ? Math.min(reach, here.away - TRACE_SWITCH) : reach;
    for (const other of layout.branches) {
      if (other === current || (other.a !== song && other.b !== song)) continue;
      const p = project(other, x, y);
      if (p.away <= bestAway) {
        bestAway = p.away;
        best = { linkId: other.linkId, t: other.a === song ? 0 : 1 };
      }
    }
    if (best) return best;
  }
  return here.away <= reach ? { linkId: current.linkId, t: here.t } : null;
}

/** Where a touch sits on its branch, for the glow under the finger. */
export function touchPoint(layout: GardenLayout, touch: CoralTouch): Point {
  const branch = layout.branches.find((b) => b.linkId === touch.linkId);
  if (!branch || branch.points.length === 0) return { x: 0, y: 0 };
  const pts = branch.points;
  const last = pts.length - 1;
  const at = Math.max(0, Math.min(1, Number.isFinite(touch.t) ? touch.t : 0)) * last;
  const i = Math.min(last - 1, Math.floor(at));
  if (last < 1) return { x: pts[0].x, y: pts[0].y };
  const f = at - i;
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
}

/** A pull shorter than this is a wobble, not a stretch. */
export const PULL_SLACK = 12;
/** A pull this long reaches the latest start point. */
export const PULL_FULL = 170;

/** Which end of which branch a pulled song stretches, and the start point that pull means. */
export type CoralPull = { linkId: string; end: 'a' | 'b'; seconds: number; stretch: number };

/**
 * Pulling a song away from the coral stretches the branch it is pulled against, like a rubber band, and the length of
 * the stretch is where that song comes in on that branch. A song on several branches stretches the one most opposite
 * the pull, so each branch can bring the same song in at a different part.
 */
export function pullStart(layout: GardenLayout, trackId: number, x: number, y: number): CoralPull | null {
  const node = layout.nodes.find((n) => n.trackId === trackId);
  if (!node) return null;
  const dx = x - node.x;
  const dy = y - node.y;
  const length = Math.hypot(dx, dy);
  let best: { linkId: string; end: 'a' | 'b'; against: number } | null = null;
  for (const b of layout.branches) {
    const end = b.a === trackId ? 'a' : b.b === trackId ? 'b' : null;
    if (!end || b.points.length < 2) continue;
    const last = b.points.length - 1;
    const step = Math.min(4, last);
    const near = end === 'a' ? b.points[step] : b.points[last - step];
    const bx = near.x - node.x;
    const by = near.y - node.y;
    const along = Math.hypot(bx, by) || 1;
    // 1 when the finger pulls straight away from the branch, -1 when it pushes along it.
    const against = length > 0 ? -(dx * bx + dy * by) / (length * along) : 0;
    if (!best || against > best.against) best = { linkId: b.linkId, end, against };
  }
  if (!best) return null;
  const stretch = Math.max(0, Math.min(1, (length - PULL_SLACK) / (PULL_FULL - PULL_SLACK)));
  return { linkId: best.linkId, end: best.end, seconds: Math.round(stretch * MAX_START * 2) / 2, stretch };
}

/** Where on its branch a start point's bud sits: just in from that song's end, further in the later it starts. */
export function budPoint(layout: GardenLayout, linkId: string, end: 'a' | 'b', seconds: number): Point {
  const along = 0.08 + 0.3 * Math.max(0, Math.min(1, seconds / MAX_START));
  return touchPoint(layout, { linkId, t: end === 'a' ? along : 1 - along });
}

// ---------------------------------------------------------------------------------------------------------------
// The shore: past the Sunny reef the sand climbs out of the water, and your coral grows on that slope.

/** Where the water's surface is on the shore, as a share of the screen's height. */
export const SHORE_WATERLINE = 0.22;
/** The coral's left edge on the shore, as a share of the width: left of it the sand is too close to the surface. */
export const SHORE_START = 0.36;
const SHORE_RISE = 0.74;

/** The y of the top of the sand at x: a low beach on the left, a slope down through the middle, sea floor on the right. */
export function shoreSand(x: number, width: number, height: number): number {
  const s = width > 0 ? x / width : 1;
  const t = Math.max(0, Math.min(1, (s - 0.05) / 0.7));
  const fallen = t * t * (3 - 2 * t);
  return height - Math.max(26, height * 0.06) - SHORE_RISE * height * (1 - fallen);
}

/** The highest coral may reach: a little under the surface. */
export function shoreTop(height: number): number {
  return (SHORE_WATERLINE + 0.04) * height;
}

/**
 * The coral for these links, grown on the shore. It is laid out as a garden on a flat floor, then pressed onto the
 * slope: roots stand on the sand wherever they are, and coral nearer the beach is shorter, because the water is.
 */
export function shoreGarden(links: CoralLink[], width: number, height: number): GardenLayout {
  const empty: GardenLayout = { width, height, nodes: [], branches: [] };
  if (!(width > 0) || !(height > 0)) return empty;
  const left = SHORE_START * width;
  const top = shoreTop(height);
  const boxHeight = height - top;
  const flat = layoutGarden(links, width - left, boxHeight);
  const floorIn = gardenFloor(boxHeight);
  // Roots sit just above the drawn sand, as they do on a flat floor.
  const share = (x: number) => Math.max(0.05, (shoreSand(x, width, height) - 0.03 * height - top) / floorIn);
  const place = (p: Point): Point => ({ x: p.x + left, y: top + p.y * share(p.x + left) });
  return {
    width,
    height,
    nodes: flat.nodes.map((n) => ({ ...n, ...place(n), r: n.r * (0.6 + 0.4 * Math.min(1, share(n.x + left))) })),
    branches: flat.branches.map((b) => ({ ...b, points: b.points.map(place) })),
  };
}
