// Goal pace and steering for Run mode. Paces are s/km: a smaller number is faster.
// The talk test stands in for heart rate (Persinger, Foster et al. 2004), and beginners
// mostly run too hard, so a first run only ever eases you off.

import type { Goal, RunPoint, RunProfile, Steer, TalkAnswer } from './run-types.ts';

export const GOAL_FACTOR: Record<Goal, number> = { easy: 1, steady: 0.92, push: 0.85 };
export const GOAL_NAMES: Record<Goal, string> = { easy: 'Easy', steady: 'Steady', push: 'Push' };

const BAND = 0.05;
const NUDGE = 0.02;
const SPM_RANGE = 0.06;
const TALK_FACTOR: Record<TalkAnswer, number> = { yes: 0.98, mostly: 1, no: 1.04 };

/** A typed pace wins; otherwise the learned Easy pace scaled to the goal; null before any learning. */
export function goalPace(profile: RunProfile, goal: Goal, typedPace: number | null): number | null {
  if (typedPace) return typedPace;
  return profile.easyPace ? profile.easyPace * GOAL_FACTOR[goal] : null;
}

/** The median pace from minutes 2 to 4, once at least a minute of speeds exists there. */
export function settledPace(points: RunPoint[]): number | null {
  const speeds = points
    .filter((p) => p.t >= 120_000 && p.t <= 240_000 && p.speed != null && p.speed > 0.3)
    .map((p) => p.speed!)
    .sort((a, b) => a - b);
  if (speeds.length < 12) return null;
  const mid = speeds.length / 2;
  const median = speeds.length % 2 ? speeds[Math.floor(mid)] : (speeds[mid - 1] + speeds[mid]) / 2;
  return 1000 / median;
}

/** More than 5 % faster than the goal eases; more than 5 % slower lifts, except on a first run. */
export function steerFor(pace: number | null, goal: number | null, opts: { firstRun: boolean }): Steer {
  if (pace == null || goal == null) return 'hold';
  if (pace < goal * (1 - BAND)) return 'ease';
  if (pace > goal * (1 + BAND)) return opts.firstRun ? 'hold' : 'lift';
  return 'hold';
}

/** The step rate the next songs aim for: a 2 % nudge, never more than 6 % from your natural rate. */
export function targetSpm(natural: number, current: number, steer: Steer): number {
  const aim = steer === 'ease' ? current * (1 - NUDGE) : steer === 'lift' ? current * (1 + NUDGE) : current;
  return Math.min(natural * (1 + SPM_RANGE), Math.max(natural * (1 - SPM_RANGE), aim));
}

/** Next Easy pace from a finished run: the Easy pace it implies, 2 % faster for "yes", 4 % slower for "no". */
export function learnEasyPace(profile: RunProfile, run: { avgPace: number | null; goal: Goal; talk: TalkAnswer | null }): number | null {
  if (run.avgPace == null || run.talk == null) return profile.easyPace;
  return (run.avgPace / GOAL_FACTOR[run.goal]) * TALK_FACTOR[run.talk];
}

export function goalLine(steer: Steer | null, goal: Goal, calibrating: boolean): string {
  if (calibrating) return 'Finding your stride';
  if (steer == null) return 'Finding your pace';
  if (steer === 'ease') return 'A bit fast, easing off';
  if (steer === 'lift') return 'Picking it up';
  return `On pace · ${GOAL_NAMES[goal]}`;
}
