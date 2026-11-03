// What each place looks like, as numbers: the water's colors by water, depth and hour, the seabed's terraces, and who
// lives there wild. Pure. Everything marked 'worklet' runs each frame on the UI thread.

import type { Depth, Place, Species, Water } from './ocean-map.ts';

export type DayMix = { night: number; warm: number };
export type WaterStops = { top: string; mid: string; bot: string; ray: number };
export type Rgb = [number, number, number];

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Night runs 21:00 to 04:30; warm light peaks around 06:30 and 19:00. */
export function dayMixAt(hour: number): DayMix {
  const h = ((hour % 24) + 24) % 24;
  const night = h < 12 ? 1 - smooth(4.5, 7.5, h) : smooth(17.5, 21, h);
  const warm = Math.max(0, 1 - Math.abs(h - 6.5) / 1.75, 1 - Math.abs(h - 19) / 2);
  return { night, warm };
}

export function hexToRgb(hex: string): Rgb {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

const BASE: Record<Water, { top: string; mid: string; bot: string; ray: number }> = {
  reef: { top: '#8be8e6', mid: '#27b0cf', bot: '#0e76a8', ray: 0.55 },
  kelp: { top: '#a9e6b8', mid: '#2f9a7c', bot: '#0f5b55', ray: 0.48 },
  blue: { top: '#b7e2ff', mid: '#2f83dc', bot: '#0b3d91', ray: 0.38 },
  midnight: { top: '#3f6aa8', mid: '#17336b', bot: '#050d2b', ray: 0.14 },
};
/** How far each depth has gone toward the abyss, per stop. */
const DARKEN: Record<Depth, [number, number, number]> = {
  popular: [0, 0, 0],
  deepcuts: [0.42, 0.36, 0.3],
  gems: [0.72, 0.68, 0.62],
  buried: [0.93, 0.92, 0.9],
};
const RAY: Record<Depth, number> = { popular: 1, deepcuts: 0.55, gems: 0.14, buried: 0 };
const ABYSS: Record<Water, Rgb> = { reef: [2, 14, 34], kelp: [2, 18, 22], blue: [2, 10, 38], midnight: [1, 5, 18] };
const NIGHT: Rgb = [6, 18, 50];
const WARM: Rgb = [255, 170, 110];

export function waterStops(water: Water, depth: Depth, day: DayMix): WaterStops {
  const base = BASE[water];
  const dark = DARKEN[depth];
  const stop = (hex: string, i: number, warmth: number): string => {
    let c = mixRgb(hexToRgb(hex), ABYSS[water], dark[i]);
    c = mixRgb(c, NIGHT, day.night * 0.72);
    c = mixRgb(c, WARM, day.warm * warmth * (1 - dark[i]));
    return toHex(c);
  };
  return {
    top: stop(base.top, 0, 0.28),
    mid: stop(base.mid, 1, 0.12),
    bot: stop(base.bot, 2, 0),
    ray: base.ray * RAY[depth] * (1 - 0.68 * day.night),
  };
}

/** A color down the water column, f from 0 at the top to 1 at the bottom. */
export function gradientAt(stops: { top: Rgb; mid: Rgb; bot: Rgb }, f: number): Rgb {
  'worklet';
  const v = f < 0 ? 0 : f > 1 ? 1 : f;
  return v < 0.45 ? mixRgb(stops.top, stops.mid, v / 0.45) : mixRgb(stops.mid, stops.bot, (v - 0.45) / 0.55);
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The water on Home: its shallows, the color at the bottom of the phone, foam's tint, and which ink reads on it. */
export function surfaceWater(water: Water, depth: Depth, day: DayMix, reach = 96, screen = 844): { top: string; low: string; foam: string; ink: 'dark' | 'light' } {
  const s = waterStops(water, depth, day);
  const rgb = { top: hexToRgb(s.top), mid: hexToRgb(s.mid), bot: hexToRgb(s.bot) };
  const low = gradientAt(rgb, reach / screen);
  return { top: s.top, low: toHex(low), foam: toHex(mixRgb(rgb.mid, [2, 30, 45], 0.25)), ink: luminance(low) < 0.18 ? 'light' : 'dark' };
}

/**
 * The seabed's height above the bottom of the screen, as a share of the screen's height: stepped terraces with soft
 * edges and a drop-off to one side. xFrac is 0 to 1 across. Each depth has its own shape.
 */
export function seabedAt(depthIndex: number, xFrac: number): number {
  'worklet';
  const shelves = depthIndex === 0 ? [0.1, 0.16, 0.24] : depthIndex === 1 ? [0.22, 0.14, 0.11] : depthIndex === 2 ? [0.12, 0.2, 0.15] : [0.17, 0.11, 0.21];
  const edges = depthIndex === 0 ? [0.42, 0.74] : depthIndex === 1 ? [0.3, 0.68] : depthIndex === 2 ? [0.36, 0.8] : [0.26, 0.58];
  const step = (edge: number) => {
    const t = (xFrac - (edge - 0.045)) / 0.09;
    const v = t < 0 ? 0 : t > 1 ? 1 : t;
    return v * v * (3 - 2 * v);
  };
  const a = shelves[0] + (shelves[1] - shelves[0]) * step(edges[0]);
  const b = a + (shelves[2] - shelves[1]) * step(edges[1]);
  return b + Math.sin(xFrac * 13 + depthIndex * 2) * 0.004;
}

export type WildLook = 'clown' | 'tang' | 'neon' | 'silver' | 'turtle' | 'jelly' | 'puffer' | 'whale' | 'angler' | 'crab' | 'starfish';
export type WildFish = { id: string; look: WildLook; species: Species | null; band: number; x: number; speed: number; scale: number; seed: number; school: number };

const SPECIES_OF: Partial<Record<WildLook, Species>> = { neon: 'darter', clown: 'clown', tang: 'clown', turtle: 'turtle', jelly: 'jelly', puffer: 'puffer' };

const WATER_LOOKS: Record<Water, WildLook[]> = {
  reef: ['neon', 'clown', 'tang', 'turtle', 'puffer', 'clown', 'tang'],
  kelp: ['silver', 'turtle', 'neon', 'jelly', 'silver', 'clown', 'turtle'],
  blue: ['silver', 'neon', 'whale', 'jelly', 'puffer', 'silver', 'turtle'],
  midnight: ['jelly', 'angler', 'jelly', 'neon', 'turtle', 'puffer', 'jelly'],
};
const SPEEDS: Record<WildLook, number> = { neon: 26, clown: 15, tang: 18, silver: 21, turtle: 10, jelly: 3, puffer: 8, whale: 9, angler: 8, crab: 0, starfish: 0 };

/** Who lives in a place when none of your songs do. Always the same, always several kinds of song close at hand. */
export function wildRoster(p: Place): WildFish[] {
  const depthIndex = ['popular', 'deepcuts', 'gems', 'buried'].indexOf(p.depth);
  const looks = [...WATER_LOOKS[p.water]];
  if (depthIndex >= 2) looks[1] = 'angler';
  if (depthIndex === 3) looks[0] = 'jelly';
  const out: WildFish[] = looks.map((look, i) => {
    const seed = (p.water.length * 7919 + depthIndex * 104729 + i * 15485863) % 2147483647;
    const dir = i % 2 === 0 ? 1 : -1;
    return {
      id: `${p.water}:${p.depth}:${i}`,
      look,
      species: SPECIES_OF[look] ?? null,
      band: 0.12 + ((i * 0.137 + depthIndex * 0.09) % 0.62),
      x: (seed % 1000) / 1000,
      speed: SPEEDS[look] * dir,
      scale: look === 'whale' ? 0.92 : 0.95 + (seed % 5) * 0.08,
      seed,
      school: look === 'neon' || (look === 'silver' && i % 3 === 0) ? 5 : 0,
    };
  });
  out.push({ id: `${p.water}:${p.depth}:crab`, look: depthIndex % 2 ? 'starfish' : 'crab', species: null, band: 1, x: 0.22 + depthIndex * 0.14, speed: 0, scale: 1, seed: depthIndex + 3, school: 0 });
  if (p.water !== 'midnight') out.push({ id: `${p.water}:${p.depth}:star`, look: 'starfish', species: null, band: 1, x: 0.76 - depthIndex * 0.1, speed: 0, scale: 0.8, seed: depthIndex + 9, school: 0 });
  return out;
}
