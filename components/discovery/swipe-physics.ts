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
  thresholds: SwipeThresholds = { horizontal: 120, vertical: 120 }
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

export const MAX_CARD_WIDTH = 320;
export const MAX_CARD_HEIGHT = 420;
const CARD_ASPECT_RATIO = MAX_CARD_WIDTH / MAX_CARD_HEIGHT;

export type CardSize = { width: number; height: number };

/**
 * Fits the card into whatever space the layout actually measured for it,
 * preserving the card's aspect ratio and never exceeding
 * MAX_CARD_WIDTH/MAX_CARD_HEIGHT — so it shrinks on a small screen (e.g.
 * iPhone SE) instead of overflowing behind the button rows or the tab bar.
 * Not a worklet — called from regular JS on layout, not from a gesture.
 */
export function computeCardSize(available: CardSize): CardSize {
  if (available.width <= 0 || available.height <= 0) {
    return { width: MAX_CARD_WIDTH, height: MAX_CARD_HEIGHT };
  }
  const heightFromMax = Math.min(MAX_CARD_HEIGHT, available.height);
  const widthFromHeight = heightFromMax * CARD_ASPECT_RATIO;
  if (widthFromHeight <= available.width) {
    return { width: widthFromHeight, height: heightFromMax };
  }
  const widthFromMax = Math.min(MAX_CARD_WIDTH, available.width);
  return { width: widthFromMax, height: widthFromMax / CARD_ASPECT_RATIO };
}
