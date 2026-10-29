// The words around a bottle: where it washed up from, the reward line when you keep one, its
// route, a one-line summary, and Finds News items about bottles you launched or kept. Counts
// only ever reach the screen after a verdict (spec: herding). Pure.

import type { Bottle, BottleState, Hop, Place } from './bottle-rows.ts';

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "Lisbon", or "somewhere in Central US" for a time-zone region, ready to follow a preposition. */
const placeWords = (city: string, exact: boolean) => (exact ? city : city.charAt(0).toLowerCase() + city.slice(1));
const people = (b: Bottle) => 1 + b.keeps; // the finder, then every stranger who kept it
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cities = (hops: Hop[]) => new Set(hops.map((h) => h.city)).size;

export function revealLine(b: Bottle): string {
  const launch = b.hops.find((h) => h.kind === 'launch') ?? b.hops[0];
  return launch ? `Washed up from ${placeWords(launch.city, launch.exact)}` : 'Washed up from somewhere';
}

/** Shown the moment you keep it: you're after the finder and everyone who kept it before you. */
export function keepLine(b: Bottle): string {
  return `You're the ${ordinal(people(b) + 1)} person to keep this. It's floating on.`;
}

export type RouteStop = { label: string; count: number; you: boolean };

/** The chain as stops, a city in a row counted once ("Dallas ×2"), with you at the end when given. */
export function routeStops(b: Bottle, you: Place | null): RouteStop[] {
  const labels = b.hops.map((h) => h.city);
  const stops: RouteStop[] = [];
  const add = (label: string, isYou: boolean) => {
    const last = stops[stops.length - 1];
    if (last && last.label === label) {
      last.count += 1;
      last.you ||= isYou;
    } else stops.push({ label, count: 1, you: isYou });
  };
  labels.forEach((l) => add(l, false));
  if (you) add(you.city, true);
  return stops;
}

export function journeySummary(b: Bottle): string {
  if (b.state === 'retired') return "Pulled: it wouldn't play for people";
  if (b.state === 'sunk') return b.keeps === 0 ? 'Sank before anyone kept it' : `Sank after ${plural(people(b), 'person', 'people')} kept it`;
  if (b.keeps === 0) return 'Floating · no stranger has kept it yet';
  return `Kept by ${plural(people(b), 'person', 'people')} in ${plural(cities(b.hops), 'city', 'cities')}`;
}

/** What you last knew about each bottle you launched or kept. A bottle not in here is a baseline, not news. */
export type BottleSeen = Record<string, { keeps: number; state: BottleState; launched: boolean }>;

export type BottleNewsItem = { id: string; bottleId: string; trackId: number; sentence: string };

export function bottleNews(mine: Bottle[], seen: BottleSeen, titleOf: (trackId: number) => string | null): BottleNewsItem[] {
  const items: BottleNewsItem[] = [];
  for (const b of mine) {
    const before = seen[b.id];
    const title = titleOf(b.trackId);
    if (!before || !title) continue;
    const quoted = `“${title}”`;
    if (b.state === 'sunk' && before.state !== 'sunk') {
      items.push({ id: `bottle:${b.id}:sunk`, bottleId: b.id, trackId: b.trackId, sentence: `${quoted} sank after ${plural(people(b), 'person', 'people')} kept it.` });
    } else if (b.keeps > before.keeps) {
      const lastKeep = [...b.hops].reverse().find((h) => h.kind === 'keep');
      if (!lastKeep) continue;
      const where = lastKeep.exact ? `in ${lastKeep.city}` : placeWords(lastKeep.city, false);
      const subject = before.launched ? `Your find ${quoted}` : `${quoted}, a bottle you kept,`;
      const tally = `${plural(people(b), 'person', 'people')}, ${plural(cities(b.hops), 'city', 'cities')}`;
      items.push({ id: `bottle:${b.id}:${b.keeps}`, bottleId: b.id, trackId: b.trackId, sentence: `${subject} washed up ${where} and was kept · ${tally}.` });
    }
  }
  return items;
}

export function markBottlesSeen(seen: BottleSeen, mine: Bottle[]): BottleSeen {
  const next = { ...seen };
  for (const b of mine) next[b.id] = { keeps: b.keeps, state: b.state, launched: seen[b.id]?.launched ?? false };
  return next;
}
