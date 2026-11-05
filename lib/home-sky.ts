// The sky over Home. The clock sets the sky and the song sets the weather. The water below mirrors the sky at the
// horizon and goes to its own color close to you, so it always looks like it belongs under this sky. Pure. Runs on the
// JS thread when the hour or the song changes; lib/home-sky-motion.ts holds what runs every frame.

import type { Depth, Water } from './ocean-map.ts';
import { dayMixAt, hexToRgb, mixRgb, waterStops, type DayMix, type Rgb } from './ocean-scene.ts';
import type { SoundFeatures } from './sound.ts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export function luminance(c: Rgb): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
const scale = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];

/** Mixes in Oklab, so a sunset passes through pink and not mud. */
export function okMix(a: Rgb, b: Rgb, t: number): Rgb {
  const lab = (c: Rgb) => {
    const [r, g, bl] = [channel(c[0]), channel(c[1]), channel(c[2])];
    const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * bl);
    const m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * bl);
    const s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.63 * bl);
    return [0.2105 * l + 0.7936 * m - 0.0041 * s, 1.978 * l - 2.4286 * m + 0.4506 * s, 0.0259 * l + 0.7828 * m - 0.8087 * s];
  };
  const A = lab(a);
  const B = lab(b);
  const L = lerp(A[0], B[0], t);
  const M = lerp(A[1], B[1], t);
  const S = lerp(A[2], B[2], t);
  const l = (L + 0.3963 * M + 0.2158 * S) ** 3;
  const m = (L - 0.1056 * M - 0.0639 * S) ** 3;
  const s = (L - 0.0895 * M - 1.2915 * S) ** 3;
  const out = (v: number) => {
    const u = clamp01(v);
    return 255 * (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
  };
  return [out(4.0767 * l - 3.3077 * m + 0.231 * s), out(-1.2684 * l + 2.6098 * m - 0.3413 * s), out(-0.0041 * l - 0.7034 * m + 1.7076 * s)];
}

/** Top of the sky, middle, horizon, then a cloud's lit side and shaded side, through the day. */
const KEYS = (
  [
    [0, '#060b20', '#0b1633', '#1a2b52', '#2c3a5e', '#0e152c'],
    [4.6, '#070c24', '#0d1a3a', '#1d2e58', '#2e3b64', '#0f172f'],
    [5.75, '#161f4b', '#403c78', '#c97a8e', '#8f6c8e', '#2d2b58'],
    [6.5, '#33508f', '#9685b8', '#ffb27e', '#ffd4ac', '#7b6392'],
    [7.5, '#4284d2', '#8cbdea', '#ffe6c9', '#fff5e8', '#adb7cf'],
    [9.5, '#3183dc', '#80bff2', '#d9f0fb', '#ffffff', '#bac9dc'],
    [13, '#2279da', '#66b4f2', '#d2f0fd', '#ffffff', '#b4c6da'],
    [16.5, '#2d73cc', '#7cb5e8', '#f5e8cb', '#fff7e5', '#aeb8cc'],
    [18.25, '#3d5ea9', '#b892ab', '#ffc27e', '#ffdba4', '#8d6f8f'],
    [19, '#2c3c84', '#b3628d', '#ff8d50', '#ffa06e', '#604277'],
    [19.75, '#181f56', '#533c7c', '#dc647e', '#935578', '#2c2553'],
    [20.75, '#0b1338', '#1d2558', '#423c74', '#3e3c6a', '#14193d'],
    [22, '#060b20', '#0b1633', '#1a2b52', '#2c3a5e', '#0e152c'],
    [24, '#060b20', '#0b1633', '#1a2b52', '#2c3a5e', '#0e152c'],
  ] as const
).map(([hour, ...colors]) => ({ hour, colors: colors.map(hexToRgb) }));

export type SkyWeather = { wind: number; cover: number; soft: number; dark: number; rain: number; storm: boolean; label: 'clear' | 'windy' | 'rain' | 'storm' | 'calm' };

/** A song we can't hear yet gets a plain, gentle sky. */
export const CALM_WEATHER: SkyWeather = { wind: 0.25, cover: 0.3, soft: 0.18, dark: 0, rain: 0, storm: false, label: 'calm' };

/** Energy drives the wind, the same number the sea's swell uses. Low mood brings cloud, then rain, then a storm. */
export function weatherOf(sound: SoundFeatures | null): SkyWeather {
  if (!sound) return CALM_WEATHER;
  const drive = clamp01(sound.energy * (1 - 0.45 * sound.acousticness));
  const gloom = clamp01((0.5 - sound.valence) / 0.35);
  const storm = gloom > 0.6 && drive > 0.7;
  const rain = gloom * (drive > 0.6 ? 0.8 : 0.55);
  return {
    wind: 0.1 + 0.9 * drive,
    cover: clamp01(0.14 + 0.42 * drive + 0.42 * gloom),
    soft: 0.13 + 0.3 * gloom,
    dark: gloom * (0.3 + 0.6 * drive),
    rain,
    storm,
    label: storm ? 'storm' : rain > 0.3 ? 'rain' : drive > 0.5 ? 'windy' : 'clear',
  };
}

export type SkyLook = { zen: Rgb; mid: Rgb; hor: Rgb; lit: Rgb; shade: Rgb; day: DayMix; weather: SkyWeather };

export function skyAt(hour: number, weather: SkyWeather): SkyLook {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.hour) / (b.hour - a.hour);
  const [zen, mid, hor, lit, shade] = a.colors.map((c, j) => okMix(c, b.colors[j], t));
  const day = dayMixAt(h);
  const storm = mixRgb([40, 46, 62], [66, 74, 94], 1 - day.night);
  const grey = (c: Rgb, d = weather.dark) => mixRgb(c, storm, d * 0.85);
  return { zen: grey(zen), mid: grey(mid), hor: grey(hor, weather.dark * 0.9), lit: grey(lit), shade: grey(shade), day, weather };
}

export type SkyBody = { x: number; y: number; up: boolean; low: number };

/** The sun rises at 6:30 on the right and sets at 7:00 on the left, the same hours the water warms up. */
export function sunAt(hour: number, width: number, horizon: number): SkyBody {
  const h = ((hour % 24) + 24) % 24;
  const t = (h - 6.5) / 12.5;
  const a = Math.PI * t;
  const k = width / 390;
  return { x: width / 2 + k * (135 * Math.cos(a) + 105 * Math.sin(a)), y: horizon - (horizon - 36) * Math.sin(a), up: t > -0.06 && t < 1.06, low: 1 - clamp01(Math.sin(a) / 0.4) };
}

/** The moon spends most of the night high in the top left, above the genre button and clear of the island. */
export function moonAt(hour: number, width: number, horizon: number, highest = 32): SkyBody {
  const h = ((hour % 24) + 24) % 24;
  const t = ((h - 20.4 + 24) % 24) / 9.2;
  const a = Math.PI * t;
  const k = width / 390;
  return { x: width / 2 - k * (60 * Math.cos(a) + 125 * Math.sin(a)), y: horizon - (horizon - highest) * Math.pow(Math.max(0, Math.sin(a)), 0.03), up: t < 1.04, low: 0 };
}

/** Makes `c` no brighter than `most` of `than`. */
function below(c: Rgb, than: Rgb, most: number): Rgb {
  const r = (most * luminance(than)) / Math.max(luminance(c), 1e-4);
  return r < 1 ? scale(c, Math.pow(r, 1 / 2.2)) : c;
}

/** Pushes a color away from the middling band where neither black nor white reads well on it. */
function steer(c: Rgb): Rgb {
  const l = luminance(c);
  if (l <= 0.1 || l >= 0.26) return c;
  const t = (l - 0.1) / 0.16;
  const v = 0.1 + 0.16 * t * t * t * (t * (6 * t - 15) + 10);
  return scale(c, Math.pow(v / l, 1 / 2.2));
}

/** What the tab bar draws on the water (components/tab-bar.tsx WATER_INK). */
export const TAB_INK: Record<'dark' | 'light', Rgb> = { dark: [6, 34, 43], light: [255, 255, 255] };

export type MatchedWater = { top: string; mid: string; midAt: number; low: string; far: string; foam: string; line: string; lineOpacity: number; mist: string; ink: 'dark' | 'light'; inkContrast: number };

export const MID_AT = 0.26;

export function matchedWater(water: Water, depth: Depth, look: SkyLook): MatchedWater {
  const { zen, mid, hor, day } = look;
  const dk = look.weather.dark;
  const s = waterStops(water, depth, day);
  const [top0, mid0, bot0] = [hexToRgb(s.top), hexToRgb(s.mid), hexToRgb(s.bot)];
  const top = below(okMix(okMix(top0, mid0, 0.55), hor, 0.3 + 0.3 * day.warm + 0.25 * dk), hor, 0.74);
  let m = below(okMix(mid0, mid, 0.26 + 0.3 * day.warm + 0.3 * dk), top, 0.82);
  let low = below(okMix(okMix(mid0, bot0, 0.5), zen, 0.22 + 0.3 * dk), m, 0.72);
  low = steer(low);
  m = below(steer(m), low, 1.25);
  // The tab bar sits on this stretch, its icons near the top and its labels near the bottom.
  const at = (f: number): Rgb => (f < MID_AT ? mixRgb(top, m, f / MID_AT) : mixRgb(m, low, (f - MID_AT) / (1 - MID_AT)));
  const worst = (ink: Rgb) => Math.min(contrast(ink, at(0.34)), contrast(ink, at(0.76)));
  const dark = worst(TAB_INK.dark);
  const light = worst(TAB_INK.light);
  return {
    top: toHex(top),
    mid: toHex(m),
    midAt: MID_AT,
    low: toHex(low),
    far: toHex(below(okMix(top, hor, 0.4), hor, 0.92)),
    foam: toHex(mixRgb(m, [2, 30, 45], 0.25)),
    line: toHex(mixRgb([255, 255, 255], hor, 0.22 + 0.3 * day.night)),
    lineOpacity: lerp(0.92, 0.62, Math.max(day.night, dk)),
    mist: toHex(hor),
    ink: dark >= light ? 'dark' : 'light',
    inkContrast: Math.max(dark, light),
  };
}

const CREAM: Rgb = [243, 234, 216];
const BLACK: Rgb = [17, 17, 17];

/** The sky behind Home's words and buttons. */
export function textBand(look: SkyLook): Rgb {
  return mixRgb(look.mid, look.hor, 0.62);
}

/** Dark words or light ones. A margin keeps them from flickering when the sky sits right between the two. */
export function wordsAreDark(look: SkyLook, wereDark: boolean): boolean {
  const band = textBand(look);
  return contrast(BLACK, band) > contrast(CREAM, band) * (wereDark ? 0.9 : 1.1);
}

/**
 * A soft haze behind the words, only as strong as the sky needs: none on a clear pale sky, more when the sky sits in the
 * middling band where neither black nor cream reads well. Close to the horizon, a haze just looks like weather.
 */
export function wordsVeil(look: SkyLook, dark: boolean): { color: Rgb; opacity: number } {
  const band = textBand(look);
  const color: Rgb = dark ? [255, 255, 255] : [12, 20, 44];
  const before = contrast(dark ? BLACK : CREAM, band);
  return { color, opacity: clamp01((6 - before) / 2.4) * 0.42 };
}

export type IslandColors = { rock: string; grass: string; post: string; sign: string; signText: string; white: string };

export function islandColors(look: SkyLook): IslandColors {
  const navy: Rgb = [19, 33, 63];
  const dim = (hex: string, k: number) => toHex(mixRgb(hexToRgb(hex), navy, look.day.night * k));
  return { rock: dim('#7a6553', 0.32), grass: dim('#55a361', 0.32), post: dim('#3a2f28', 0.2), sign: dim('#b98a5e', 0.3), signText: '#fff7e6', white: '#f7f3ea' };
}

/** Everything the sky's shader needs, flat, so the UI thread can blend one look into the next. */
export function lookVector(look: SkyLook, sun: SkyBody, moon: SkyBody): number[] {
  const n = (c: Rgb) => [c[0] / 255, c[1] / 255, c[2] / 255];
  const w = look.weather;
  return [
    ...n(look.zen),
    ...n(look.mid),
    ...n(look.hor),
    ...n(look.lit),
    ...n(look.shade),
    w.cover,
    w.soft,
    sun.x,
    sun.y,
    sun.up ? 1 - w.dark * 0.75 : 0,
    sun.low,
    moon.x,
    moon.y,
    moon.up ? Math.max(0, Math.min(1, (look.day.night - 0.3) / 0.5)) * (1 - w.dark * 0.6) : 0,
  ];
}

/** How long one sky takes to become the next. */
export const SKY_FADE_MS = 2200;
/** Words and the tab bar change here, when the sky is about halfway and either ink reads about as well. */
export const INK_SWITCH_MS = SKY_FADE_MS / 2;
export const easeOfSky = (t: number) => t * t * (3 - 2 * t);

/** One set of water colors partway to the next. Hex colors and numbers blend; anything else takes the next value. */
export function mixWater<T extends Record<string, unknown>>(a: T, b: T, t: number): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'string' && typeof y === 'string' && /^#[0-9a-f]{6}$/i.test(x) && /^#[0-9a-f]{6}$/i.test(y)) out[k] = toHex(mixRgb(hexToRgb(x), hexToRgb(y), t));
    else if (typeof x === 'number' && typeof y === 'number') out[k] = x + (y - x) * t;
    else out[k] = y;
  }
  return out as T;
}

export type SkyTest = 'clock' | 'dawn' | 'noon' | 'dusk' | 'night';
/** Tune's test control: look at any time of day without waiting for it. */
export const SKY_TEST_HOURS: Record<Exclude<SkyTest, 'clock'>, number> = { dawn: 6.6, noon: 12.5, dusk: 18.7, night: 22.5 };
