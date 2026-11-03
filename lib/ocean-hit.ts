// Which creature a tap landed on. Motion is a pure function of time (lib/ocean-motion.ts), so the JS thread works
// out the same poses the canvas drew.

/** The smallest target, so a tiny fish can still be tapped with a finger. */
const MIN_REACH = 26;
const REACH_PER_SCALE = 24;

export function hitMember(
  x: number,
  y: number,
  members: { scale: number; look: string }[],
  poses: { x: number; y: number }[]
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < members.length; i++) {
    const reach = Math.max(MIN_REACH, members[i].scale * (members[i].look === 'manta' ? REACH_PER_SCALE * 1.5 : REACH_PER_SCALE));
    const distance = Math.hypot(poses[i].x - x, poses[i].y - y);
    if (distance <= reach && distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
