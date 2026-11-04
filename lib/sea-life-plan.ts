// When something comes up, and what it looks like under this sky. Runs on the JS thread when a sighting starts.

import { hexToRgb, mixRgb, type Rgb } from './ocean-scene.ts';
import { toHex, type SkyLook } from './home-sky.ts';
import { FLY_PASS_S, WHALES, type SeaLifeKind, type Sighting } from './sea-life.ts';

/** Many small fish rise at dusk, stay up all night, and go back down around dawn. */
export const fishAreUp = (hour: number) => hour >= 19 || hour < 5.75;
/** Spinner dolphins rest by day and feed at night, so they travel in leaps from dusk on. */
export const dolphinsAwake = (hour: number) => hour >= 18 || hour < 6;

/** Far and rare for the big whales, more often for what's close. Small fish only from dusk to dawn. */
export function pickKind(hour: number, rand: () => number): SeaLifeKind {
  const table: [SeaLifeKind, number][] = [['fly', 3], ['pod', 3], ['hump', 3], ['seal', 2], ['blue', 1], ['sperm', 1]];
  if (fishAreUp(hour)) table.push(['bait', 3]);
  let r = rand() * table.reduce((sum, row) => sum + row[1], 0);
  for (const [kind, weight] of table) {
    r -= weight;
    if (r <= 0) return kind;
  }
  return 'fly';
}

/** Seconds until the next one. A sighting every song or two, so it stays a surprise. */
export const nextGap = (rand: () => number) => 30 + rand() * 45;

export function makeSighting(kind: SeaLifeKind, o: { width: number; screenH: number; horizon: number; hour: number; wind: number; rand?: () => number; forceBreach?: boolean; forceLeap?: boolean }): Sighting {
  const rand = o.rand ?? Math.random;
  const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
  const between = (a: number, b: number) => a + rand() * (b - a);
  const base = { kind, width: o.width, screenH: o.screenH, horizon: o.horizon, dir, leap: false, n: 1, gap: 0, ending: 'dive' as Sighting['ending'], wind: o.wind, members: 0 };
  if (kind === 'hump' || kind === 'blue' || kind === 'sperm') {
    const w = WHALES[kind];
    // Real runs of breaths are longer and further apart. On Home they're shortened, or you'd swipe past them.
    const n = kind === 'sperm' ? 4 : 3;
    const gap = kind === 'blue' ? 8.5 : kind === 'hump' ? 6 : 4.5;
    const lucky = kind === 'hump' && (o.forceBreach || rand() < 0.12 + 0.6 * o.wind);
    const ending: Sighting['ending'] = lucky ? 'breach' : rand() < (kind === 'blue' ? 0.55 : 0.85) ? 'fluke' : 'dive';
    const start = kind === 'sperm' ? 1.4 + (n - 1) * gap + 2.6 : n * gap;
    const leave = ending === 'breach' ? 4 : w.roll * 1.25 + (ending === 'fluke' ? 5.2 + 3 : 1);
    return { ...base, z: w.z, x: between(0.26, 0.74) * o.width, n, gap, ending, duration: start + leave + 1 };
  }
  if (kind === 'pod') {
    const leap = o.forceLeap ?? dolphinsAwake(o.hour);
    const z = between(15, 19);
    const v = leap ? 5.5 : 1.8;
    const margin = 110;
    const span = o.width + margin * 2;
    return { ...base, z, leap, x: dir > 0 ? -margin : o.width + margin, members: Math.round(between(3, 5.4)), duration: Math.min(span / (v * (300 / z)), 26) };
  }
  if (kind === 'seal') return { ...base, z: between(7.6, 8.6), x: between(0.14, 0.86) * o.width, duration: 10.2 };
  if (kind === 'bait') return { ...base, z: between(6.8, 9), x: between(0.2, 0.8) * o.width, members: Math.round(between(10, 16)), duration: 3.4 };
  return { ...base, z: 45, x: between(-5, 5), members: Math.round(between(1, 2.4)), duration: FLY_PASS_S + 3 };
}

export type SeaLifeColors = { back: string; belly: string; wing: string; puff: string; shade: string; drop: string; pupil: string };

const LOOKS: Record<SeaLifeKind, { back: string; belly: string }> = {
  blue: { back: '#5f7890', belly: '#5f7890' },
  hump: { back: '#2c3239', belly: '#dfe6ea' },
  sperm: { back: '#55585c', belly: '#55585c' },
  pod: { back: '#5b7182', belly: '#dbe3e8' },
  seal: { back: '#67594c', belly: '#8a7a6a' },
  bait: { back: '#dfe7ec', belly: '#dfe7ec' },
  fly: { back: '#1f436b', belly: '#dbe4ea' },
};

export function colorsFor(s: Sighting, look: SkyLook): SeaLifeColors {
  const { day, hor, mid, zen } = look;
  // Dimmer at night, warmer at sunset, and hazed toward the horizon the further away it is.
  const tone = (hex: string, z: number): Rgb => {
    let c = mixRgb(hexToRgb(hex), [9, 16, 38], day.night * 0.66);
    c = mixRgb(c, [255, 165, 110], day.warm * 0.14);
    c = mixRgb(c, [50, 58, 74], look.weather.dark * 0.3);
    return mixRgb(c, hor, Math.min(1, z / 150) * 0.6);
  };
  const z = s.kind === 'fly' ? 10 : s.z;
  const puff = mixRgb(mixRgb([255, 255, 255], hor, 0.12), mid, day.night * 0.42);
  return {
    back: toHex(tone(LOOKS[s.kind].back, z)),
    belly: toHex(tone(LOOKS[s.kind].belly, z)),
    wing: toHex(tone('#7fa6c9', z)),
    puff: toHex(puff),
    shade: toHex(mixRgb(mixRgb(mid, [70, 88, 112], 0.55), zen, day.night * 0.5)),
    drop: toHex(mixRgb(puff, [255, 255, 255], 0.5)),
    pupil: '#0a0d14',
  };
}
