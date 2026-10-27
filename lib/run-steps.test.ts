import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WALK_MAX_SPM, cadence, createMotionTracker, detectKnocks, detectSteps } from './run-steps.ts';
import type { AccelSample } from './run-types.ts';

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function signal({
  duration = 60000,
  hz = 0,
  amplitude = 1.6,
  knocks = [],
  seed = 0xdecafbad,
}: {
  duration?: number;
  hz?: number;
  amplitude?: number;
  knocks?: number[];
  seed?: number;
} = {}): AccelSample[] {
  const random = mulberry32(seed);
  const noise = () => (random() - 0.5) * 0.1;
  const samples: AccelSample[] = [];
  const knockTimes = new Set(knocks);
  for (let t = 0; t <= duration; t += 10) {
    let z = 1;
    if (hz > 0) {
      const period = 1000 / hz;
      const nearest = Math.round((t - 500) / period);
      for (let step = Math.max(0, nearest - 1); step <= nearest + 1; step++) {
        const offset = t - (500 + step * period);
        z += amplitude * Math.exp(-((offset / 25) ** 2));
        z += amplitude * 0.18 * Math.exp(-(((offset - 90) / 18) ** 2));
      }
    }
    samples.push({ t, x: noise() + (knockTimes.has(t) ? 1.5 : 0), y: noise(), z: z + noise() });
  }
  return samples;
}

function assertCadence(actual: number | null, expected: number): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= 3, `Expected ${expected} ± 3 spm, got ${actual}`);
}

test('running at 2.75 Hz reads 165 ± 3 spm', () => {
  const samples = signal({ hz: 2.75 });
  const steps = detectSteps(samples);
  assertCadence(cadence(steps, 60000), 165);
  assert.ok(steps.every((t, i) => i === 0 || t - steps[i - 1] >= 250));
  assert.equal(WALK_MAX_SPM, 135);
  assert.equal(cadence([0, 500, 1000, 1500, 2000, 2500, 10001], 10000), 120);
  assert.equal(cadence([0, 500, 1000, 1500, 2000, 2500], 2500, 2000), null);
  const tracker = createMotionTracker();
  for (const sample of samples) tracker.push(sample);
  assertCadence(tracker.spm(60000), 165);
  assert.ok(tracker.steps().every(t => t >= 45000));
  const copy = tracker.steps();
  copy.length = 0;
  assert.ok(tracker.steps().length > 0);
});

test('walking at 1.8 Hz reads 108 ± 3', () => {
  const samples = signal({ hz: 1.8, amplitude: 0.6 });
  assertCadence(cadence(detectSteps(samples), 60000), 108);
});

test('standing still reads null', () => {
  const samples = signal();
  assert.deepEqual(detectSteps(samples), []);
  assert.equal(cadence(detectSteps(samples), 60000), null);
  assert.equal(cadence([], 0), null);
  const tracker = createMotionTracker();
  assert.equal(tracker.spm(0), null);
  for (const sample of samples) assert.equal(tracker.push(sample).knock, false);
  assert.equal(tracker.spm(60000), null);
});

test('a double knock on top of running is found once', () => {
  const knocks = [10220, 10470];
  const samples = signal({ hz: 2.75, knocks });
  const steps = detectSteps(samples);
  assert.ok(knocks.every(t => steps.every(step => Math.abs(step - t) > 60)));
  // A sideways 1.5 g impulse is near the magnitude-jerk cutoff; check this fixture clears it.
  for (const t of knocks) {
    const i = t / 10;
    const magnitude = (s: AccelSample) => Math.hypot(s.x, s.y, s.z);
    const peak = magnitude(samples[i]);
    assert.ok(Math.max(peak - magnitude(samples[i - 1]), peak - magnitude(samples[i + 1])) > 0.8);
  }
  assert.deepEqual(detectKnocks(samples, steps), [knocks[1]]);
  const tracker = createMotionTracker();
  const reported: number[] = [];
  for (const sample of samples) {
    if (tracker.push(sample).knock) reported.push(sample.t);
  }
  assert.equal(reported.length, 1);
  assert.ok(reported[0] >= knocks[1] + 400);
  assert.ok(reported[0] <= knocks[1] + 590);
  assertCadence(tracker.spm(60000), 165);
  assert.deepEqual(detectKnocks(samples, [...steps, knocks[0] + 60]), []);
  assert.deepEqual(detectKnocks(samples, [...steps, knocks[1] - 60]), []);
});

test('60 s of running alone finds no knocks', () => {
  for (const amplitude of [1.6, 3.2, 5]) {
    const samples = signal({ hz: 2.75, amplitude });
    assert.deepEqual(detectKnocks(samples, detectSteps(samples)), []);
    // Wide impacts must be rejected even when no footstrike veto is available.
    assert.deepEqual(detectKnocks(samples, []), []);
    const tracker = createMotionTracker();
    for (const sample of samples) assert.equal(tracker.push(sample).knock, false);
  }
});

test('two or three quick knocks are one like', () => {
  for (const knocks of [[8000, 8250], [8000, 8250, 8500], [8000, 8250, 8650], [7800, 8250, 8500]]) {
    const samples = signal({ duration: 10000, knocks });
    assert.deepEqual(detectKnocks(samples, detectSteps(samples)), [knocks[knocks.length - 1]]);
    const tracker = createMotionTracker();
    let likes = 0;
    for (const sample of samples) if (tracker.push(sample).knock) likes++;
    assert.equal(likes, 1, `knocks at ${knocks}`);
  }
});

test('knocks between strides count while walking or running', () => {
  for (const [hz, knocks] of [[1.8, [10100, 10330]], [2.75, [10220, 10470, 10850]]] as [number, number[]][]) {
    const samples = signal({ hz, knocks });
    const steps = detectSteps(samples);
    assert.deepEqual(detectKnocks(samples, steps), [knocks[knocks.length - 1]], `${hz} Hz`);
  }
});

test('four knocks are not a like', () => {
  const samples = signal({ duration: 10000, knocks: [7500, 7750, 8000, 8250] });
  assert.deepEqual(detectKnocks(samples, detectSteps(samples)), []);
  const tracker = createMotionTracker();
  for (const sample of samples) assert.equal(tracker.push(sample).knock, false);
});

test('the tracker reports each tap it feels, even ones that are not a like', () => {
  const samples = signal({ duration: 10000, knocks: [6000, 8000] });
  const tracker = createMotionTracker();
  let taps = 0;
  for (const sample of samples) if (tracker.push(sample).tap) taps++;
  assert.equal(taps, 2);
});

test('two knocks 700 ms apart are not a double', () => {
  const samples = signal({ duration: 10000, knocks: [8000, 8700] });
  assert.deepEqual(detectKnocks(samples, detectSteps(samples)), []);
  const tracker = createMotionTracker();
  for (const sample of samples) assert.equal(tracker.push(sample).knock, false);
});
