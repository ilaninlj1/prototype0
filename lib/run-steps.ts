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

/**
 * Impulses measured as vectors, not as the size of the acceleration: a pocket tap pushes an upright phone
 * sideways, across gravity, which barely changes the size (1 g with a 0.5 g side push is still 1.12 g).
 */
function spikes(samples: AccelSample[]): Spike[] {
  const groups: { start: number; end: number; strong: boolean }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[i - 1];
    const jerk = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
    // Leave out the sample before the jerk: it may be the impulse's falling edge.
    const from = Math.max(0, start - 6);
    const to = Math.max(from + 1, start - 1);
    const base = { x: 0, y: 0, z: 0 };
    for (let i = from; i < to; i++) {
      base.x += samples[i].x / (to - from);
      base.y += samples[i].y / (to - from);
      base.z += samples[i].z / (to - from);
    }
    const away = (i: number) => Math.hypot(samples[i].x - base.x, samples[i].y - base.y, samples[i].z - base.z);

    let peak = start - 1;
    for (let i = start; i <= end; i++) {
      if (away(i) > away(peak)) peak = i;
    }
    const spike = { t: samples[peak].t, strong, narrow: false };
    if (start < 6 || samples[end].t - samples[start].t > 30) return spike;
    if (away(peak) < 0.3) return spike;
    const settled = (i: number) => away(i) < 0.3;

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

/** Times of the sharp, narrow taps a knock is made of, whether or not they make a like. */
export function detectTaps(samples: AccelSample[]): number[] {
  return spikes(samples).filter(spike => spike.strong && spike.narrow).map(spike => spike.t);
}

/**
 * The last tap of every quick burst of 2 or 3 knocks (each 120–450 ms after the one before), reported only once
 * nothing has followed it for 490 ms. Four or more, a weak impulse in the burst, or a footstrike within 60 ms of
 * any of them is not a like.
 */
export function detectKnocks(samples: AccelSample[], stepTimes: number[]): number[] {
  if (samples.length === 0) return [];
  const candidates = spikes(samples).filter(spike => spike.strong || spike.narrow);
  const knocks: number[] = [];
  const now = samples[samples.length - 1].t;
  for (let i = 0; i < candidates.length; ) {
    let j = i;
    while (j + 1 < candidates.length && candidates[j + 1].t - candidates[j].t <= 450) j++;
    const burst = candidates.slice(i, j + 1);
    i = j + 1;
    if (burst.length < 2 || burst.length > 3) continue;
    if (!burst.every(spike => spike.strong && spike.narrow)) continue;
    if (burst.some((spike, k) => k > 0 && spike.t - burst[k - 1].t < 120)) continue;
    const last = burst[burst.length - 1].t;
    // An extra 40 ms also reveals a following impulse whose qualifying jerk is its fall.
    if (burst[0].t - samples[0].t < 450 || now - last < 490) continue;
    // Standing still, the step finder reads the knock itself as a step; only steps in a stride can veto.
    const striding = stepTimes.filter(t => Math.abs(t - last) <= 5000).length >= 6;
    if (striding && burst.some(spike => stepTimes.some(t => Math.abs(t - spike.t) <= 60))) continue;
    knocks.push(last);
  }
  return knocks;
}

/** Retains 15 s, checks knocks every ten samples, and reports each tap and each confirmed burst once. */
export function createMotionTracker(): {
  push(s: AccelSample): { knock: boolean; tap: boolean };
  spm(now: number): number | null;
  steps(): number[];
} {
  const samples: AccelSample[] = [];
  let stepTimes: number[] = [];
  let dirty = false;
  let pending = 0;
  let lastKnock = -Infinity;
  let lastTap = -Infinity;

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
      if (++pending < 10) return { knock: false, tap: false };
      pending = 0;
      refreshSteps();
      const taps = detectTaps(samples).filter(t => t > lastTap);
      if (taps.length) lastTap = taps[taps.length - 1];
      const fresh = detectKnocks(samples, stepTimes).filter(t => t > lastKnock);
      if (fresh.length) lastKnock = fresh[fresh.length - 1];
      return { knock: fresh.length > 0, tap: taps.length > 0 };
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
