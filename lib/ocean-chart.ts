// The whole ocean as one graph: across is sound, down is how few people know it. Every fish where it swims now with a
// trail back to where you found it, and your own path through the water over time. Pure.

import type { SwipeEntry } from './discovery.ts';
import { DEPTHS, WATERS, type Place } from './ocean-map.ts';
import type { Creature, OceanLife } from './ocean-person.ts';

export type ChartDot = { creature: Creature; x: number; y: number; fromX: number; fromY: number; r: number };
export type PathPoint = { x: number; y: number; at: number; songs: number };

const unit = (seed: number, salt: number) => {
  const v = Math.sin((seed + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/** Every fish on the graph, in a plot w by h. Its own spot inside a place stays put, so trails only ever go straight up. */
export function chartDots(life: OceanLife | null, w: number, h: number): ChartDot[] {
  if (!life) return [];
  const cellW = w / WATERS.length;
  const cellH = h / DEPTHS.length;
  const out: ChartDot[] = [];
  for (const place of Object.values(life.places)) {
    const col = WATERS.indexOf(place.place.water);
    for (const c of place.creatures) {
      const x = (col + 0.1 + 0.8 * unit(c.seed, 7)) * cellW;
      const inRow = 0.14 + 0.72 * unit(c.seed, 6);
      out.push({
        creature: c,
        x,
        y: Math.max(cellH * 0.04, (c.foundRow - c.climb + inRow) * cellH),
        fromX: x,
        fromY: (c.foundRow + inRow) * cellH,
        r: 2 + c.size * 1.8,
      });
    }
  }
  return out;
}

const HEARD = new Set<SwipeEntry['action']>(['like', 'reveal', 'skip', 'genre-jump']);
const MAX_POINTS = 14;
const MIN_STEP_MS = 10 * 60_000;

/**
 * Where you've listened over time, as points from 0 to 1 across and down the graph, oldest first: the middle of what you
 * heard in each stretch of time. The stretches scale with how long you've been listening, so one evening still draws a
 * line. Songs with no sound data have no place across the graph, so they don't count.
 */
export function listeningPath(history: SwipeEntry[], placeOf: (e: SwipeEntry) => Place | null): PathPoint[] {
  const heard = history.filter((e) => HEARD.has(e.action) && e.source !== 'run' && Number.isFinite(e.timestamp));
  if (heard.length === 0) return [];
  let first = Infinity;
  let last = -Infinity;
  for (const e of heard) {
    if (e.timestamp < first) first = e.timestamp;
    if (e.timestamp > last) last = e.timestamp;
  }
  const step = Math.max(MIN_STEP_MS, (last - first) / MAX_POINTS);
  const buckets = new Map<number, { col: number; row: number; n: number; at: number }>();
  for (const e of heard) {
    const place = placeOf(e);
    if (!place) continue;
    const key = Math.floor((e.timestamp - first) / step);
    const b = buckets.get(key) ?? { col: 0, row: 0, n: 0, at: 0 };
    b.col += WATERS.indexOf(place.water);
    b.row += DEPTHS.indexOf(place.depth);
    b.at = Math.max(b.at, e.timestamp);
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => ({ x: (b.col / b.n + 0.5) / WATERS.length, y: (b.row / b.n + 0.5) / DEPTHS.length, at: b.at, songs: b.n }));
}

/** What a tap on the graph landed on: the nearest fish in reach. */
export function hitDot(dots: ChartDot[], x: number, y: number, reach = 22): ChartDot | null {
  let best: ChartDot | null = null;
  let bestD = reach;
  for (const d of dots) {
    const away = Math.hypot(d.x - x, d.y - y);
    if (away <= bestD) {
      best = d;
      bestD = away;
    }
  }
  return best;
}

/** Which place a point on the graph is in. */
export function placeAtChart(x: number, y: number, w: number, h: number): Place {
  const col = Math.max(0, Math.min(WATERS.length - 1, Math.floor((x / w) * WATERS.length)));
  const row = Math.max(0, Math.min(DEPTHS.length - 1, Math.floor((y / h) * DEPTHS.length)));
  return { water: WATERS[col], depth: DEPTHS[row] };
}

/** The line under the graph: what has moved, in plain words. */
export function chartLine(dots: ChartDot[]): string {
  if (dots.length === 0) return 'Nothing lives here yet. Save a song blind and it shows up here.';
  const climbed = dots.filter((d) => d.creature.climb > 0);
  if (climbed.length === 0) return `${dots.length} ${dots.length === 1 ? 'song' : 'songs'} so far. When more people find an artist, their fish swims up.`;
  return `${climbed.length} of your ${dots.length === 1 ? 'song has' : `${dots.length} songs have`} climbed since you found them.`;
}
