// What each place looks like, as numbers: the water's colors by water, depth and hour, the seabed's terraces, and who
// lives there wild. Pure. Everything marked 'worklet' runs each frame on the UI thread.

import type { Depth, Water } from './ocean-map.ts';

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

/** What every place's sea floor is made of, top of the sand to the bottom. Only Buried reaches it. */
export const SAND: Record<Water, [string, string]> = {
  reef: ['#f8e7bb', '#dcc08a'],
  kelp: ['#d4c791', '#9c8f60'],
  blue: ['#9db3cb', '#5f7895'],
  midnight: ['#2b3050', '#14172c'],
};

/**
 * The sea floor's height above the bottom of the screen, as a share of its height. x is in screen widths, on any scale:
 * the floor is one unbroken shape that repeats, so it runs on through every biome without a seam.
 */
export function seabedAt(x: number): number {
  'worklet';
  const tau = 6.2831853;
  return 0.14 + 0.05 * Math.sin(tau * x) + 0.03 * Math.sin(2 * tau * x + 1) + 0.012 * Math.sin(6 * tau * x + 2);
}

/** The coast: the reef's floor is shallowest, Midnight's is a trench. Fractions of the screen, for any point between biomes. */
export function floorLift(col: number): number {
  'worklet';
  const lifts = [0.14, 0.07, 0, -0.06];
  const c = col < 0 ? 0 : col > 3 ? 3 : col;
  const i = Math.min(2, Math.floor(c));
  return lifts[i] + (lifts[i + 1] - lifts[i]) * (c - i);
}

/** The sea floor under one biome, as a share of the screen's height. */
export function floorAt(col: number, x: number): number {
  'worklet';
  const y = seabedAt(x) + floorLift(col);
  return y < 0.03 ? 0.03 : y;
}

/** The reef's coral towers: center across, and how far down from the surface each tip starts, in screen heights. */
export const TOWERS = [
  { cx: 0.14, tip: 0.42 },
  { cx: 0.86, tip: 0.6 },
  { cx: 0.5, tip: 1.45 },
];

/** A tower's half width at a depth, as a share of the screen's width: 0 above its tip, knobbly, wider toward the floor. */
export function towerRadius(i: number, world: number): number {
  const tip = TOWERS[i].tip;
  if (world <= tip) return 0;
  const grown = Math.min(1, (world - tip) / 1.4);
  const round = Math.min(1, (world - tip) / 0.06);
  return Math.sqrt(round) * (0.035 + 0.075 * Math.sqrt(grown)) + 0.008 * Math.sin(world * 17 + i * 2) + 0.005 * Math.sin(world * 41 + i);
}

/** Where anemones grow on the reef's towers in a level, as shares of the screen. Clownfish nest in them. */
export function anemoneSpots(row: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  TOWERS.forEach((t, i) => {
    for (const y of [0.3, 0.62]) {
      const world = row + y;
      if (towerRadius(i, world) <= 0.02) continue;
      const side = i === 1 ? -1 : 1;
      out.push({ x: t.cx + side * towerRadius(i, world), y });
    }
  });
  return out;
}
