import type { AccelSample } from './run-types.ts';

export const WALK_MAX_SPM = 135;

function magnitudes(samples: AccelSample[]): number[] {
  return samples.map(({ x, y, z }) => Math.sqrt(x * x + y * y + z * z));
}

function prefixSum(values: number[]): number[] {
  const sums = [0];
  for (const value of values) sums.push(sums[sums.length - 1] + value);
  return sums;
}

/** Footstrikes from locally significant, smoothed peaks at least 250 ms apart. */
export function detectSteps(samples: AccelSample[]): number[] {
  const sums = prefixSum(magnitudes(samples));
  const smoothed = samples.map((_, i) => {
    const start = Math.max(0, i - 2);
    const end = Math.min(samples.length, i + 3);
    return (sums[end] - sums[start]) / (end - start);
  });
  const totals = prefixSum(smoothed);
  const squares = prefixSum(smoothed.map(value => value * value));
  const peaks: number[] = [];
  let left = 0;
  let right = 0;

  // Full five-sample averages on both sides keep endpoint peaks provisional.
  for (let i = 3; i < samples.length - 3; i++) {
    while (samples[left].t < samples[i].t - 1000) left++;
    while (right < samples.length && samples[right].t <= samples[i].t + 1000) right++;
    if (smoothed[i] < smoothed[i - 1] || smoothed[i] <= smoothed[i + 1]) continue;

    const count = right - left;
    const mean = (totals[right] - totals[left]) / count;
    const variance = (squares[right] - squares[left]) / count - mean * mean;
    const threshold = mean + Math.max(0.15, 0.6 * Math.sqrt(Math.max(0, variance)));
    if (smoothed[i] <= threshold) continue;

    const previous = peaks[peaks.length - 1];
    if (previous !== undefined && samples[i].t - samples[previous].t < 250) {
      if (smoothed[i] > smoothed[previous]) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }

  return peaks.map(i => samples[i].t);
}

/** Uses the observed intervals within the window; requires at least six steps. */
export function cadence(stepTimes: number[], now: number, windowMs = 10000): number | null {
  let count = 0;
  let first = Infinity;
  let last = -Infinity;
  for (const time of stepTimes) {
    if (time < now - windowMs || time > now) continue;
    count++;
    first = Math.min(first, time);
    last = Math.max(last, time);
  }
  return count >= 6 && last > first ? (count - 1) * 60000 / (last - first) : null;
}

type Spike = { t: number; strong: boolean; narrow: boolean };

function spikes(samples: AccelSample[]): Spike[] {
  const magnitude = magnitudes(samples);
  const groups: { start: number; end: number; strong: boolean }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const jerk = Math.abs(magnitude[i] - magnitude[i - 1]);
    // Weaker impulses can veto a noisy triple, but can never count as a knock.
    if (jerk <= 0.6) continue;
    const previous = groups[groups.length - 1];
    if (previous && samples[i].t - samples[previous.end].t <= 30) {
      previous.end = i;
      previous.strong ||= jerk > 0.8;
    } else {
      groups.push({ start: i, end: i, strong: jerk > 0.8 });
    }
  }

  return groups.map(({ start, end, strong }) => {
    let peak = start - 1;
    for (let i = start; i <= end; i++) {
      if (magnitude[i] > magnitude[peak]) peak = i;
    }
    const spike = { t: samples[peak].t, strong, narrow: false };
    if (start < 6 || samples[end].t - samples[start].t > 30) return spike;

    // Leave out the sample before the jerk: it may be the impulse's falling edge.
    let baseline = 0;
    for (let i = start - 6; i < start - 1; i++) baseline += magnitude[i] / 5;
    if (magnitude[peak] - baseline < 0.3) return spike;
    const settled = (i: number) => Math.abs(magnitude[i] - baseline) < 0.3;

    let onset = peak;
    while (onset > 0 && !settled(onset - 1)) onset--;
    let recovery = peak + 1;
    while (recovery < samples.length && samples[recovery].t - samples[start].t <= 40) {
      if (settled(recovery)) break;
      recovery++;
    }
    if (onset === 0 || recovery + 1 >= samples.length) return spike;

    // A falling footstrike can have large jerk and settle quickly; its full width cannot.
    spike.narrow = samples[recovery].t - samples[start].t <= 40
      && samples[recovery].t - samples[onset].t <= 20
      && settled(recovery)
      && settled(recovery + 1);
    return spike;
  });
}

/** Returns second-knock times only after the complete third-spike exclusion window. */
export function detectDoubleKnocks(samples: AccelSample[], stepTimes: number[]): number[] {
  if (samples.length === 0) return [];
  const candidates = spikes(samples).filter(spike => spike.strong || spike.narrow);
  const doubles: number[] = [];
  const now = samples[samples.length - 1].t;
  for (let i = 0; i + 1 < candidates.length; i++) {
    const first = candidates[i];
    const second = candidates[i + 1];
    const gap = second.t - first.t;
    if (!first.strong || !second.strong || !first.narrow || !second.narrow) continue;
    if (gap < 120 || gap > 450) continue;
    // An extra 40 ms also reveals a third impulse whose qualifying jerk is its fall.
    if (first.t - samples[0].t < 450 || now - second.t < 440) continue;
    if (i > 0 && first.t - candidates[i - 1].t <= 450) continue;
    if (i + 2 < candidates.length && candidates[i + 2].t - second.t <= 400) continue;
    if (stepTimes.some(t => Math.abs(t - first.t) <= 60 || Math.abs(t - second.t) <= 60)) continue;
    doubles.push(second.t);
  }
  return doubles;
}

/** Retains 15 s, checks knocks every ten samples, and reports each confirmed pair once. */
export function createMotionTracker(): {
  push(s: AccelSample): { knock: boolean };
  spm(now: number): number | null;
  steps(): number[];
} {
  const samples: AccelSample[] = [];
  let stepTimes: number[] = [];
  let dirty = false;
  let pending = 0;
  let lastKnock = -Infinity;

  function refreshSteps(): void {
    if (!dirty) return;
    stepTimes = detectSteps(samples);
    dirty = false;
  }

  return {
    push(s) {
      samples.push({ ...s });
      while (samples.length && samples[0].t < s.t - 15000) samples.shift();
      dirty = true;
      if (++pending < 10) return { knock: false };
      pending = 0;
      refreshSteps();
      const detected = detectDoubleKnocks(samples, stepTimes);
      const fresh = detected.filter(t => t > lastKnock);
      if (fresh.length === 0) return { knock: false };
      lastKnock = fresh[fresh.length - 1];
      return { knock: true };
    },
    spm(now) {
      refreshSteps();
      return cadence(stepTimes, now);
    },
    steps() {
      refreshSteps();
      return [...stepTimes];
    },
  };
}
