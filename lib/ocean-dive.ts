// How the dive settles and how a drag moves you around the ocean. Pure and worklet-safe: Home's gesture reads these
// on the UI thread, and the tests read them in Node.

/** How far up a drag has to get before it finishes on its own. */
export const DIVE_FINISH = 0.2;
/** Points per second that count as a flick. */
const FLICK = 500;
export const PLACE_MAX = 3;

/** Where a released dive ends: 1 is under the water, 0 is back at the surface. velocityY is negative going up. */
export function settleDive(progress: number, velocityY: number): 0 | 1 {
  'worklet';
  if (velocityY <= -FLICK) return 1;
  if (velocityY >= FLICK) return 0;
  return progress > DIVE_FINISH ? 1 : 0;
}

/** Up (direction -1) sinks a level, down (1) rises one, and rising from the top goes to the surface. */
export function depthDragResult(depth: number, direction: number): { depth: number; surface: boolean } {
  'worklet';
  if (direction > 0 && depth <= 0) return { depth: 0, surface: true };
  const next = direction < 0 ? depth + 1 : direction > 0 ? depth - 1 : depth;
  return { depth: Math.max(0, Math.min(PLACE_MAX, next)), surface: false };
}

/** Dragging left (direction -1) moves to the next water, dragging right to the one before. */
export function waterDragResult(water: number, direction: number): number {
  'worklet';
  const next = direction < 0 ? water + 1 : direction > 0 ? water - 1 : water;
  return Math.max(0, Math.min(PLACE_MAX, next));
}

export function nearestPlaceIndex(position: number): number {
  'worklet';
  return Math.max(0, Math.min(PLACE_MAX, Math.round(position)));
}

/** How visible the ocean's buttons and the tab bar are, 0–1, at a point in the dive. */
export function showsAt(dive: number): { ui: number; tabBar: number } {
  'worklet';
  return {
    ui: dive >= 1 ? 1 : Math.max(0, Math.min(1, (dive - 0.8) / 0.2)), // floating point stops just short of 1
    tabBar: Math.max(0, Math.min(1, 1 - dive / 0.12)),
  };
}
