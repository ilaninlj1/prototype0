// Follow the Sound: pick a direction after a reveal and the feed heads that way from that song, one step at a time, so
// you travel instead of filtering. Every word is backed by a number we really have: energy for Calmer and Harder,
// valence for Brighter and Darker, popularity for Deeper. Pure; lib/decks.ts runs it as a deck.

import type { DeckCandidate } from './decks.ts';
import type { DiscoveryTrack } from './discovery.ts';
import { DEPTHS, type Depth } from './ocean-map.ts';
import { pickNeighbors, soundDistance } from './sound-neighbors.ts';
import type { SoundFeatures } from './sound.ts';

export const DIRECTIONS = ['calmer', 'harder', 'brighter', 'darker', 'deeper'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_WORD: Record<Direction, string> = {
  calmer: 'Calmer',
  harder: 'Harder',
  brighter: 'Brighter',
  darker: 'Darker',
  deeper: 'Deeper',
};

export type FollowFrom = { trackId: number; label: string; artist: string; sound: SoundFeatures; depth: Depth };

// How far a song has to move to count as a step. Under the low end you wouldn't hear it; over the high end it's a leap.
const STEP = { low: 0.08, aim: 0.15, high: 0.35 };

/** How far `to` moved from `from` in this direction. Negative means the wrong way. Not meaningful for Deeper. */
export function followStep(dir: Direction, from: SoundFeatures, to: SoundFeatures): number {
  switch (dir) {
    case 'calmer':
      return from.energy - to.energy;
    case 'harder':
      return to.energy - from.energy;
    case 'brighter':
      return to.valence - from.valence;
    case 'darker':
      return from.valence - to.valence;
    case 'deeper':
      return 0;
  }
}

const deeperThan = (depth: Depth): Depth | null => DEPTHS[DEPTHS.indexOf(depth) + 1] ?? null;

function isStep(dir: Direction, from: FollowFrom, c: DeckCandidate): boolean {
  if (dir === 'deeper') return c.depth === deeperThan(from.depth);
  const moved = followStep(dir, from.sound, c.sound);
  return moved >= STEP.low && moved <= STEP.high;
}

/** What the next song should sound like: this one, nudged. */
function aimFor(dir: Direction, s: SoundFeatures): SoundFeatures {
  if (dir === 'calmer') return { ...s, energy: s.energy - STEP.aim };
  if (dir === 'harder') return { ...s, energy: s.energy + STEP.aim };
  if (dir === 'brighter') return { ...s, valence: s.valence + STEP.aim };
  if (dir === 'darker') return { ...s, valence: s.valence - STEP.aim };
  return s;
}

// Sound distance leaves mood out, so without this, Harder also wanders happier or sadder at random.
const followDistance = (a: SoundFeatures, b: SoundFeatures) => soundDistance(a, b) + 0.2 * Math.abs(a.valence - b.valence);

/** The next songs this way: a real step, closest in everything else, one per artist, never the artist you just heard. */
export function pickFollow(pool: DeckCandidate[], dir: Direction, from: FollowFrom, n: number): DiscoveryTrack[] {
  const open = pool.filter((c) => c.track.id !== from.trackId && isStep(dir, from, c));
  return pickNeighbors(aimFor(dir, from.sound), from.artist, open.map((c) => ({ item: c.track, artist: c.artist, sound: c.sound })), n, followDistance);
}

/** The words that have somewhere to go from here. */
export function directionsOpen(pool: DeckCandidate[], from: FollowFrom): Direction[] {
  return DIRECTIONS.filter((dir) => pool.some((c) => c.track.id !== from.trackId && c.artist !== from.artist && isStep(dir, from, c)));
}

export const followLabel = (dir: Direction, title: string) => `${DIRECTION_WORD[dir]} than “${title}”`;

/** Said plainly when the way you've been heading has run out. */
export function followEndLine(heading: Direction | null, open: readonly Direction[]): string | null {
  return heading && !open.includes(heading) ? `Nothing ${heading} from here` : null;
}
