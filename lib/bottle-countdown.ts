// The sea countdown (Bottles, 2026-10-29 mockups): a stranger's bottle appears in the sea at the bottom of Home a few
// songs before it washes up, and each song you actually listen to floats it one step toward you. Pure.

/** Songs between a bottle showing up in the sea and washing up as a card. */
export const BOTTLE_LEAD = 4;
/** A skip faster than this doesn't move the bottle, so racing to it doesn't work. */
export const COUNT_MIN_LISTEN_MS = 2000;

/** Steps left after a card leaves: one fewer for a real listen while the bottle is free to move (`counts`). */
export function stepAfterExit(stepsLeft: number, listenedMs: number, counts: boolean): number {
  if (!counts || listenedMs < COUNT_MIN_LISTEN_MS) return stepsLeft;
  return Math.max(0, stepsLeft - 1);
}

/** The bottle goes into the card queue once it's the next song. */
export function queueBottleNow(stepsLeft: number): boolean {
  return stepsLeft <= 1;
}

/** Where it rides on the sea, 1 = far right (BOTTLE_LEAD to go) to 0 = the left edge (it's next). */
export function seaPosition(stepsLeft: number): number {
  return Math.max(0, Math.min(1, (stepsLeft - 1) / (BOTTLE_LEAD - 1)));
}
