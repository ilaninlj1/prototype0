// A song's age, from the day it came out. Blind, an older song's card comes in warmer and its
// colors faded; the reveal says the date.

import type { PrintRecipe } from './print-recipe.ts';

/** A song this many years old or older is as aged as it gets. */
const FULL_AGE_YEARS = 50;
/** The card ground of a fully aged song: espresso, where a new one's is navy. */
const OLD_GROUND = '#1e1710';
/** How far a fully aged song's colors fade toward grey. Fading toward grey keeps each hue, so the key still reads. */
const FADE = 0.5;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MS = 365.25 * 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** iTunes's stand-in for a date it doesn't know (Regina Belle's 1989 "Baby Come To Me" says 1900). */
const UNKNOWN_DAY = '1900-01-01';

/** The day iTunes says a song came out ("1978-03-23T08:00:00Z" → "1978-03-23"), as written, with no time zone shift. */
export function releaseDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const day = raw.slice(0, 10);
  return DAY.test(day) && day > UNKNOWN_DAY ? day : null;
}

/** 0 for a song out today, 1 at fifty years or more; null when the date is unknown. */
export function songAge(releaseDate: string | null | undefined, now = Date.now()): number | null {
  const m = releaseDate ? DAY.exec(releaseDate) : null;
  if (!m) return null;
  const years = (now - Date.UTC(+m[1], +m[2] - 1, +m[3])) / YEAR_MS;
  return Math.min(1, Math.max(0, years / FULL_AGE_YEARS));
}

/** "Mar 23, 1978"; just "1978" when the store only knows the year, which it writes as Jan 1. */
export function formatRelease(releaseDate: string | null | undefined): string | null {
  const m = releaseDate ? DAY.exec(releaseDate) : null;
  if (!m) return null;
  if (m[2] === '01' && m[3] === '01') return m[1];
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

/** The reveal's release line, "Released Mar 23, 1978 · Kaya". iTunes names singles "X - Single" and EPs "X - EP". */
export function releaseLine(releaseDate: string | null | undefined, album: string | null | undefined): string | null {
  const date = formatRelease(releaseDate);
  const name = album?.trim() ?? '';
  const release = / - Single$/i.test(name) ? 'Single' : name.replace(/ - EP$/i, ' EP');
  const parts = [date && `Released ${date}`, release].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A color faded toward the grey of its own lightness. */
function fade(hex: string, amount: number): string {
  const c = rgb(hex);
  const grey = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return toHex(mix(c, [grey, grey, grey], amount));
}

/**
 * The blind card's print for a song this old: the older, the warmer its ground and the more
 * faded its colors. The shape and motion are untouched. A new song, or one with no date, keeps
 * its print exactly, and so does every print saved to the piece.
 */
export function agedRecipe(recipe: PrintRecipe, age: number | null): PrintRecipe {
  if (age === null || age <= 0) return recipe;
  return {
    ...recipe,
    ground: toHex(mix(rgb(recipe.ground), rgb(OLD_GROUND), age)),
    ink: fade(recipe.ink, FADE * age),
    rings: recipe.rings.map((ring) => ({ ...ring, color: fade(ring.color, FADE * age) })),
  };
}
