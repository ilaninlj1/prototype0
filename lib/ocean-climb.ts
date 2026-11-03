// A fish swims up as more people find its song. Depth means how many people know a song, so a rise in listeners is a
// rise in the water: every fourfold rise since you saved it is one level. Pure.

export const LEVEL_RISE = 4;
/** Below this it hasn't really moved: under about a 15% rise is everyday noise in a listener count. */
const NOTICEABLE = 0.1;

/** How many levels it has climbed since you found it, never negative. Unknown counts mean it hasn't moved. */
export function climbLevels(found: number | null | undefined, now: number | null | undefined): number {
  if (!found || !now || found <= 0 || now <= found) return 0;
  const levels = Math.log(now / found) / Math.log(LEVEL_RISE);
  return levels < NOTICEABLE ? 0 : levels;
}

/** Where it swims now, given the level you found it at (0 Popular to 3 Buried): the level, and how far up inside it (0 to 1). */
export function climbedRow(foundRow: number, levels: number): { row: number; rise: number } {
  const up = Math.floor(levels);
  const row = foundRow - up;
  if (row <= 0) return { row: 0, rise: foundRow - levels <= 0 ? 1 : levels - up };
  return { row, rise: levels - up };
}

export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
