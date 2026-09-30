// Pose of a card on the Play orbit, from its distance to the center in
// "card widths" (0 = focused, ±1 = neighbours). The cards ride a circle:
// the focused one at the top, full size; the rest shrink, drop down the
// arc and tilt away, but never disappear, so every mode stays visible.

const ARC_DEG = 16; // degrees of the orbit per card
const RADIUS = 520; // px — the orbit's size; bigger = flatter arc
const MIN_SCALE = 0.45;
const MIN_OPACITY = 0.3;

// Declared before orbitPose: Reanimated captures a worklet's helpers when the
// worklet is created, so a helper defined later is still uninitialized then.
function round(n: number): number {
  'worklet';
  return Math.round(n * 1000) / 1000;
}

export function orbitPose(offset: number): { scale: number; translateY: number; rotate: number; opacity: number } {
  'worklet';
  const d = Math.abs(offset);
  const angle = (Math.min(d, 4) * ARC_DEG * Math.PI) / 180;
  const scale = Math.max(MIN_SCALE, 1 - 0.28 * Math.min(d, 1) - 0.1 * Math.max(0, Math.min(d, 4) - 1));
  const opacity = Math.max(MIN_OPACITY, 1 - 0.45 * Math.min(d, 1) - 0.1 * Math.max(0, d - 1));
  const translateY = Math.round(RADIUS * (1 - Math.cos(angle)));
  const rotate = Math.sign(offset) * Math.min(d, 4) * ARC_DEG * 0.6;
  return { scale: round(scale), translateY: translateY === 0 ? 0 : translateY, rotate: rotate === 0 ? 0 : round(rotate), opacity: round(opacity) };
}
