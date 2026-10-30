// The Sea (Bottles phase 2, spec docs/superpowers/specs/2026-10-28-bottles-design.md): a dotted globe that turns,
// with each of your bottles as an arc of light from stop to stop, and a pulse running along it in the order of its
// hops. Pure, and the per-frame parts are worklets (app/sea.tsx, components/sea/sea-canvas.tsx).

import type { Bottle, Hop } from './bottle-rows.ts';

export type V3 = [number, number, number];
/** yaw turns the globe about its poles, pitch tilts it toward you; radians. */
export type Spin = { yaw: number; pitch: number };
/** A bottle's path in 3D: one run of points per hop to hop, lifted off the surface; length ≥ 1. */
export type SeaArc = { bottleId: string; trackId: number; segments: V3[][]; stops: V3[] };

const RAD = Math.PI / 180;
/** Points along each hop. */
export const ARC_STEPS = 24;
/** Below this, two stops count as the same place (coordinates are rounded to 0.5° anyway). */
const SAME_PLACE = 0.6 * RAD;
export const PITCH_LIMIT = 1.25;

export function toVec(lat: number, lng: number): V3 {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lng * RAD), Math.sin(lat * RAD), c * Math.cos(lng * RAD)];
}

/** The spin that turns a place to face you. */
export function facing(lat: number, lng: number): Spin {
  return { yaw: -lng * RAD, pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, lat * RAD)) };
}

/** A point turned by the globe's spin: z toward you. */
export function turn(v: V3, yaw: number, pitch: number): V3 {
  'worklet';
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x = v[0] * cy + v[2] * sy;
  const z1 = -v[0] * sy + v[2] * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp];
}

/** Whether a turned point shows: in front of the globe, or lifted far enough out to be seen past its edge. */
export function shows(t: V3): boolean {
  'worklet';
  return t[2] > 0 || t[0] * t[0] + t[1] * t[1] > 1;
}

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const scale = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * One hop as points: a great circle between two places, lifted into an arch (higher for longer trips). Between two
 * stops in the same place (testers in one city) it's a small petal instead, turned by `petal` so repeats fan out.
 */
export function hopPoints(a: V3, b: V3, petal: number): V3[] {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  const out: V3[] = [];
  if (angle < SAME_PLACE) {
    const ref: V3 = Math.abs(a[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(a, ref));
    const w = cross(a, u);
    const dir = add(scale(u, Math.cos(petal)), scale(w, Math.sin(petal)));
    const side = add(scale(u, -Math.sin(petal)), scale(w, Math.cos(petal)));
    for (let i = 0; i <= ARC_STEPS; i++) {
      const t = i / ARC_STEPS;
      const out1 = Math.sin(Math.PI * t) * 0.07;
      const wide = Math.sin(2 * Math.PI * t) * 0.025;
      out.push(scale(norm(add(add(a, scale(dir, out1)), scale(side, wide))), 1 + 0.03 * Math.sin(Math.PI * t)));
    }
    return out;
  }
  const lift = 0.05 + 0.3 * (angle / Math.PI);
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const p = add(scale(a, Math.sin((1 - t) * angle)), scale(b, Math.sin(t * angle)));
    out.push(scale(norm(p), 1 + lift * Math.sin(Math.PI * t)));
  }
  return out;
}

/** Every bottle as arcs, newest-changed first, at most `max` (the canvas draws one path each). */
export function seaArcs(bottles: Bottle[], max = 40): SeaArc[] {
  return [...bottles]
    .filter((b) => b.hops.length > 0)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, max)
    .map((b) => {
      const stops = b.hops.map((h: Hop) => toVec(h.lat, h.lng));
      const segments = stops.slice(1).map((s, i) => hopPoints(stops[i], s, 0.4 + i * 1.3));
      return { bottleId: b.id, trackId: b.trackId, segments, stops };
    });
}

/** How long a pulse takes over one hop, and the rest before it starts again from where the bottle was found. */
export const HOP_MS = 1400;
export const REST_MS = 1800;

/** Where the pulse is on a bottle at time t: which hop and how far along it (0–1), or null while it rests. */
export function pulseAt(hops: number, t: number, offset: number): { hop: number; along: number } | null {
  'worklet';
  if (hops === 0) return null;
  const cycle = hops * HOP_MS + REST_MS;
  const into = (((t + offset) % cycle) + cycle) % cycle;
  if (into >= hops * HOP_MS) return null;
  const hop = Math.floor(into / HOP_MS);
  return { hop, along: (into - hop * HOP_MS) / HOP_MS };
}

/** A steady offset per bottle, so the pulses don't all leave at once. */
export function pulseOffset(bottleId: string): number {
  let h = 0;
  for (let i = 0; i < bottleId.length; i++) h = (h * 31 + bottleId.charCodeAt(i)) >>> 0;
  return h % 10000;
}

/** Which bottle a tap is on: the arc or stop nearest the finger, within `reach` px; null if none. */
export function pickArc(
  tap: { x: number; y: number },
  arcs: SeaArc[],
  spin: Spin,
  globe: { cx: number; cy: number; r: number },
  reach = 26
): number | null {
  let best: number | null = null;
  let bestD = reach;
  arcs.forEach((arc, i) => {
    for (const p of [...arc.stops, ...arc.segments.flat()]) {
      const t = turn(p, spin.yaw, spin.pitch);
      if (!shows(t)) continue;
      const d = Math.hypot(globe.cx + globe.r * t[0] - tap.x, globe.cy - globe.r * t[1] - tap.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/** The count line under the title: bottles, the cities they've reached, and the strangers who kept them. */
export function seaCountLine(bottles: Bottle[]): string {
  const cities = new Set(bottles.flatMap((b) => b.hops.map((h) => `${h.city}|${h.country}`)));
  const keeps = bottles.reduce((n, b) => n + b.keeps, 0);
  const p = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [p(bottles.length, 'bottle', 'bottles'), p(cities.size, 'city', 'cities'), p(keeps, 'keep', 'keeps')].join(' · ');
}

let dotsCache: V3[] | null = null;
/** The globe's land (assets/sea-dots.json, scripts/build-sea-dots.ts) as points on the unit sphere. */
export function loadSeaDots(): V3[] {
  if (dotsCache) return dotsCache;
  const raw = typeof require === 'function' ? (require('../assets/sea-dots.json') as { dots: number[] }).dots : [];
  const out: V3[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) out.push(toVec(raw[i], raw[i + 1]));
  dotsCache = out;
  return out;
}
