export type SwipeDirection = 'left' | 'right' | 'down';

export type SwipeThresholds = {
  horizontal: number;
  vertical: number;
};

export const DEFAULT_SWIPE_THRESHOLDS: SwipeThresholds = {
  horizontal: 120,
  vertical: 120,
};

/**
 * Resolves a completed drag gesture to a commit direction, or null to spring back.
 * A predominantly-downward drag past its threshold wins over horizontal movement,
 * so a diagonal down-right drag reads as "down" rather than "right".
 */
export function resolveSwipeDirection(
  translationX: number,
  translationY: number,
  thresholds: SwipeThresholds = DEFAULT_SWIPE_THRESHOLDS
): SwipeDirection | null {
  'worklet';
  if (translationY > thresholds.vertical && translationY > Math.abs(translationX)) {
    return 'down';
  }
  if (translationX > thresholds.horizontal) return 'right';
  if (translationX < -thresholds.horizontal) return 'left';
  return null;
}

/** Tilt angle in degrees for the Tinder-style rotation, proportional to horizontal drag. */
export function rotationForDrag(translateX: number, cardWidth: number): number {
  'worklet';
  const maxRotation = 12; // degrees
  const ratio = Math.max(-1, Math.min(1, translateX / cardWidth));
  return ratio * maxRotation;
}
