// Coral: songs you chose to join. Each link is a branch between two saved songs, and dragging along it fades one
// into the other. These types are the contract between the model (lib/coral.ts), the sound (lib/coral-mix.ts) and
// the screen (app/coral.tsx, components/coral/). Spec: docs/superpowers/specs/2026-11-15-coral-design.md.

/** How two songs join. Fade follows the finger; cut switches at the middle of the branch. */
export type LinkType = 'fade' | 'cut';

/** Everything the garden needs to draw and play a song without looking it up again. */
export type CoralSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl: string;
  /** The song's own color, as a hex string, from the app's existing per-song color. */
  color: string;
};

export type CoralLink = {
  id: string;
  a: CoralSong;
  b: CoralSong;
  type: LinkType;
  /** Seconds into each clip where that song comes in, 0 to MAX_START. */
  startA: number;
  startB: number;
  createdAt: number;
};

export type CoralState = { version: 1; links: CoralLink[] };

export const MAX_LINKS = 16;
export const MAX_START = 24;

export type Point = { x: number; y: number };

export type GardenNode = { trackId: number; x: number; y: number; r: number; color: string; links: number };

/** A branch as drawn: `points` run from song a (first) to song b (last), evenly spaced along the curve. */
export type GardenBranch = { linkId: string; a: number; b: number; type: LinkType; points: Point[] };

export type GardenLayout = { width: number; height: number; nodes: GardenNode[]; branches: GardenBranch[] };

/** Where a finger is on the coral: which branch, and how far from a (0) to b (1). */
export type CoralTouch = { linkId: string; t: number };

/** What the sound should be for a touch: the two songs and how much of b is heard, 0 to 1. */
export type CoralBlend = { link: CoralLink; mix: number };
