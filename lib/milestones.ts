import { describeListeners } from './discovery.ts';

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
type Count = number | null | undefined;

function known(count: Count): count is number {
  return count != null && Number.isFinite(count) && count > 0;
}

export function crossedMilestone(before: Count, now: Count): number | null {
  if (!known(before) || !known(now)) return null;
  return MILESTONES.findLast((m) => before < m && m <= now) ?? null;
}

export function grewALot(before: Count, now: Count): boolean {
  return known(before) && known(now) && now >= before * 1.25 && now - before >= 1_000;
}

/** foundAt is the count when the song was saved; before can be a later checkpoint. */
export function describeMilestone(artistName: string, before: Count, now: Count, foundAt: Count = before): string | null {
  const milestone = crossedMilestone(before, now);
  if (milestone == null && !grewALot(before, now)) return null;
  const change = milestone != null
    ? `passed ${describeListeners(milestone).count}`
    : `grew to ${describeListeners(now!).count}`;
  const found = known(foundAt) ? foundAt : before!;
  return `${artistName} ${change} listeners. You found them at ${describeListeners(found).count}.`;
}
