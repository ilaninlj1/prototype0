// Run mode's guards against a pocket: touches only count after a half-second hold, and the lock screen's
// jump buttons (expo-audio offers ±10 s seeks, not next/previous) are read from the clip's position.

export const HOLD_MS = 500;
export const AWAKE_MS = 5000;
const SKIP_S = 6;
const BACK_S = 3;
const MAX_WALL_MS = 2500;

/** Whether touches count: during a hold of at least HOLD_MS, or until awakeUntil after one. */
export function gateAwake(holdStartedAt: number | null, now: number, awakeUntil: number): boolean {
  return now < awakeUntil || (holdStartedAt != null && now - holdStartedAt >= HOLD_MS);
}

/** A forward jump well past normal play is a skip; any real jump back is back. Positions in seconds. */
export function seekJump(prevPos: number, pos: number, wallMs: number): 'skip' | 'back' | null {
  if (wallMs > MAX_WALL_MS) return null;
  const ahead = pos - prevPos - wallMs / 1000;
  if (ahead >= SKIP_S) return 'skip';
  if (pos < prevPos - BACK_S) return 'back';
  return null;
}
