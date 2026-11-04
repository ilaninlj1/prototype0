// Things to find around the ocean. They're scenery, the same for everyone: muted, so your songs still hold all the color,
// and placed so they make sense where they are. Some tell a story if you follow them: a rowboat up in the Kelp forest, its
// chain hanging down, the place the chain snapped, and the anchor on the sand far below. Tapping one says a short line.

import { DEPTHS, WATERS, placeKey, type Place } from './ocean-map.ts';
import { floorAt } from './ocean-scene.ts';

export type LandmarkKind = 'chest' | 'boat' | 'chain' | 'anchor' | 'sub' | 'wreck' | 'squid';

export type Landmark = {
  kind: LandmarkKind;
  place: Place;
  /** Across the screen, 0 to 1. */
  fx: number;
  /** Down the screen, 0 to 1. Null means it lies on the sea floor, which only Buried has. */
  fy: number | null;
  /** How far from its middle a tap still counts, in art units. */
  reach: number;
  note: string;
};

export const LANDMARKS: Landmark[] = [
  { kind: 'chest', place: { water: 'reef', depth: 'buried' }, fx: 0.32, fy: null, reach: 34, note: 'A treasure chest. Empty. Whoever got here first kept quiet.' },
  { kind: 'boat', place: { water: 'kelp', depth: 'popular' }, fx: 0.72, fy: 0.17, reach: 44, note: 'A rowboat, far above you. Its anchor is gone.' },
  { kind: 'chain', place: { water: 'kelp', depth: 'deepcuts' }, fx: 0.72, fy: 0.42, reach: 28, note: 'The chain snapped here. The anchor must be further down.' },
  { kind: 'anchor', place: { water: 'kelp', depth: 'buried' }, fx: 0.62, fy: null, reach: 36, note: 'There it is. The chain broke a long way up.' },
  { kind: 'sub', place: { water: 'blue', depth: 'gems' }, fx: 0.5, fy: 0.42, reach: 34, note: 'A tiny submarine. Nobody answers.' },
  { kind: 'wreck', place: { water: 'blue', depth: 'buried' }, fx: 0.6, fy: null, reach: 64, note: 'A shipwreck. Almost nobody has been down here.' },
  { kind: 'squid', place: { water: 'midnight', depth: 'gems' }, fx: 0.62, fy: 0.42, reach: 34, note: 'A squid. It has no idea what you are listening to.' },
];

export function landmarksAt(place: Place): Landmark[] {
  return LANDMARKS.filter((l) => placeKey(l.place) === placeKey(place));
}

/** Where a still landmark sits on screen: where it says, or on the sand of its own biome. */
export function landmarkSpot(l: Landmark, w: number, h: number): { x: number; y: number } {
  const col = WATERS.indexOf(l.place.water);
  return { x: l.fx * w, y: l.fy == null ? h - floorAt(col, l.fx) * h : l.fy * h };
}

/** What a tap landed on: the nearest landmark in reach, given where each one is right now. */
export function hitLandmark(x: number, y: number, list: Landmark[], spots: { x: number; y: number }[], k: number): Landmark | null {
  let best: Landmark | null = null;
  let bestD = Infinity;
  list.forEach((l, i) => {
    const d = Math.hypot(spots[i].x - x, spots[i].y - y);
    if (d <= l.reach * k && d < bestD) {
      best = l;
      bestD = d;
    }
  });
  return best;
}

export const CHAIN_LEVELS = DEPTHS.slice(0, 2);
