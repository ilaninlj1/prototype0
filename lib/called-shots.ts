import { describeListeners } from './discovery.ts';
import { crossedMilestone, grewALot } from './milestones.ts';

export type CalledShot = {
  trackId: number;
  trackName: string;
  artistName: string;
  artistId: number;
  listenersAtCall: number | null;
  calledAt: number;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
export type CallAction = 'call' | 'take-back' | 'locked' | 'limit';

export function callAction(calls: CalledShot[], trackId: number, now: number): CallAction {
  const existing = calls.find((c) => c.trackId === trackId);
  if (existing) {
    return existing.calledAt <= now && new Date(existing.calledAt).toDateString() === new Date(now).toDateString()
      ? 'take-back'
      : 'locked';
  }
  return calls.filter((c) => c.calledAt > now - WEEK).length >= 3 ? 'limit' : 'call';
}

export function nextCallChange(calls: CalledShot[], now: number): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return calls.reduce((next, c) => {
    const expiry = c.calledAt + WEEK;
    return expiry > now ? Math.min(next, expiry) : next;
  }, midnight.getTime());
}

/** A take-back keeps the saved song; older calls keep their original baseline. */
export function toggleCall(calls: CalledShot[], call: CalledShot): CalledShot[] {
  const action = callAction(calls, call.trackId, call.calledAt);
  if (action === 'take-back') return calls.filter((c) => c.trackId !== call.trackId);
  return action === 'call' ? [...calls, call] : calls;
}

export function callHit(call: CalledShot, listenersNow?: number | null): boolean {
  return crossedMilestone(call.listenersAtCall, listenersNow) != null || grewALot(call.listenersAtCall, listenersNow);
}

export function summarizeCalls(calls: CalledShot[], listenersNow: Record<string, number>): { hit: number; waiting: number } {
  const hit = calls.filter((c) => callHit(c, listenersNow[c.artistName])).length;
  return { hit, waiting: calls.length - hit };
}

function callDate(call: CalledShot): string {
  return new Date(call.calledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function callLabel(call: CalledShot, listenersNow?: number): string {
  const baseline = call.listenersAtCall == null
    ? ' · listener count unavailable'
    : ` at ${describeListeners(call.listenersAtCall).count}`;
  const hit = callHit(call, listenersNow) ? ` → ${describeListeners(listenersNow!).count}` : '';
  return `Called ${callDate(call)}${baseline}${hit}`;
}

export function callReceipt(call: CalledShot, listenersNow?: number): string | null {
  if (!callHit(call, listenersNow)) return null;
  return `Called it blind on ${callDate(call)} at ${call.listenersAtCall!.toLocaleString('en-US')} listeners. Now ${describeListeners(listenersNow!).count}. — Blindspot`;
}
