import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MILE_M,
  MAX_ACCURACY_M,
  MAX_SPEED_MS,
  createPaceTracker,
  formatClock,
  formatMiles,
  formatPace,
  haversineM,
  paceOver,
} from './run-pace.ts';
import type { Fix } from './run-types.ts';

const START = 1700000000000;

function fix(seconds: number, meters = seconds * 3, accuracy: number | null = 5): Fix {
  return { t: START + seconds * 1000, lat: meters / 111320, lng: 0, accuracy };
}

function line(start: number, end: number, speed = 3): Fix[] {
  return Array.from({ length: end - start + 1 }, (_, i) => fix(start + i, (start + i) * speed));
}

test('a straight 3 m/s line reads 5:33/km ± 3 s', () => {
  const fixes = line(0, 90);
  const tracker = createPaceTracker();
  for (const f of fixes) assert.equal(tracker.push(f), true);
  const pace = paceOver(fixes, START + 90000);
  assert.ok(pace !== null);
  assert.ok(Math.abs(pace - 1000 / 3) <= 3);
  assert.equal(tracker.pace(START + 90000), pace);
  assert.ok(Math.abs(tracker.distanceM() - 270) < 1);
  assert.deepEqual(tracker.last(), fixes[90]);
  assert.deepEqual(tracker.fixes(), fixes);
});

test('a 100 m jump in 1 s is dropped', () => {
  const tracker = createPaceTracker();
  assert.equal(MAX_SPEED_MS, 8);
  assert.equal(tracker.push(fix(0)), true);
  assert.equal(tracker.push(fix(1, 100)), false);
  assert.equal(tracker.distanceM(), 0);
  assert.deepEqual(tracker.last(), fix(0));
  assert.equal(tracker.push(fix(2)), true);
  assert.deepEqual(tracker.fixes(), [fix(0), fix(2)]);
  assert.ok(Math.abs(tracker.distanceM() - 6) < 0.1);
});

test('poor-accuracy fixes are dropped', () => {
  const tracker = createPaceTracker();
  assert.equal(MAX_ACCURACY_M, 25);
  assert.equal(tracker.push(fix(0, 0, 26)), false);
  assert.equal(tracker.last(), null);
  assert.equal(tracker.push(fix(0, 0, 25)), true);
  assert.equal(tracker.push(fix(1, 100, 50)), false);
  assert.equal(tracker.push(fix(2, 6, null)), true);
  assert.deepEqual(tracker.fixes(), [fix(0, 0, 25), fix(2, 6, null)]);
  assert.ok(Math.abs(tracker.distanceM() - 6) < 0.1);
});

test('20 s of fixes reads null', () => {
  const tracker = createPaceTracker();
  const fixes = line(0, 20);
  for (const f of fixes) tracker.push(f);
  assert.equal(paceOver(fixes, START + 20000), null);
  assert.equal(tracker.pace(START + 20000), null);
});

test('a 40 s gap then fixes reads null until 30 s of new span', () => {
  const tracker = createPaceTracker();
  for (const f of line(0, 90)) tracker.push(f);
  assert.notEqual(tracker.pace(START + 90000), null);
  assert.equal(tracker.pace(START + 130000), null);
  for (const f of line(130, 159)) {
    assert.equal(tracker.push(f), true);
    assert.equal(tracker.pace(f.t), null);
    assert.equal(paceOver(tracker.fixes(), f.t), null);
  }
  assert.equal(tracker.push(fix(160)), true);
  const pace = tracker.pace(START + 160000);
  assert.ok(pace !== null);
  assert.ok(Math.abs(pace - 1000 / 3) <= 3);
  assert.equal(tracker.fixes().length, 122);
  assert.ok(Math.abs(tracker.distanceM() - 480) < 1);
});

test('formatPace(372.8) is "10:00"', () => {
  assert.equal(formatPace(372.8), '10:00');
  assert.equal(formatPace(300), '8:03');
  assert.equal(formatPace(0), '0:00');
  for (const pace of [null, NaN, Infinity, -Infinity]) {
    assert.equal(formatPace(pace), '—');
  }
});

test('formatMiles(3862) is "2.4 mi"', () => {
  assert.equal(MILE_M, 1609.344);
  assert.equal(formatMiles(3862), '2.4 mi');
  assert.equal(formatMiles(0), '0.0 mi');
  assert.equal(formatMiles(0.04999 * MILE_M), '0.0 mi');
  assert.equal(formatMiles(0.05 * MILE_M), '0.1 mi');
});

test('formatClock(1450000) is "24:10"', () => {
  assert.equal(formatClock(1450000), '24:10');
  assert.equal(formatClock(3723000), '1:02:03');
  assert.equal(formatClock(5000), '0:05');
  assert.equal(formatClock(59999), '0:59');
  assert.equal(formatClock(3600000), '1:00:00');
  assert.equal(formatClock(0), '0:00');
});

test('haversine measures 1 degree of latitude as 111.2 km ± 0.5 km', () => {
  const origin = { lat: 0, lng: 0 };
  const north = { lat: 1, lng: 0 };
  assert.ok(Math.abs(haversineM(origin, north) - 111200) <= 500);
  assert.equal(haversineM(origin, origin), 0);
  assert.equal(haversineM(origin, north), haversineM(north, origin));
  assert.ok(Math.abs(haversineM(origin, { lat: 0, lng: 1 }) - 111200) <= 500);
});

test('duplicate and older timestamps do not change kept fixes', () => {
  const tracker = createPaceTracker();
  assert.equal(tracker.last(), null);
  assert.equal(tracker.distanceM(), 0);
  assert.deepEqual(tracker.fixes(), []);
  assert.equal(tracker.pace(START), null);
  assert.equal(tracker.push(fix(1)), true);
  assert.equal(tracker.push(fix(1, 4)), false);
  assert.equal(tracker.push(fix(0)), false);
  assert.deepEqual(tracker.fixes(), [fix(1)]);
  assert.equal(tracker.distanceM(), 0);
  assert.equal(tracker.push(fix(2)), true);
});

test('pace requires both 30 seconds and 20 meters', () => {
  assert.equal(paceOver([], START), null);
  assert.equal(paceOver([fix(0)], START), null);
  assert.equal(paceOver(line(0, 29), START + 29000), null);
  assert.notEqual(paceOver(line(0, 30), START + 30000), null);
  assert.equal(paceOver(line(0, 60, 0), START + 60000), null);
  assert.equal(paceOver(line(0, 60, 0.3), START + 60000), null);
});

test('pace only uses fixes inside the requested window ending at now', () => {
  const recent = line(30, 90);
  const fixes = [fix(29, -100), ...recent, fix(91, 1000)];
  const expected = paceOver(recent, START + 90000);
  assert.equal(paceOver(fixes, START + 90000), expected);
  assert.equal(paceOver(fixes, START + 90000, 20000), null);
  assert.notEqual(paceOver(fixes, START + 90000, 30000), null);
  assert.equal(paceOver(recent, START + 151000), null);
});

test('tracker keeps a full hour and protects its stored fixes from mutation', () => {
  const tracker = createPaceTracker();
  const fixes = line(0, 3600);
  for (const f of fixes) assert.equal(tracker.push(f), true);
  assert.equal(tracker.fixes().length, 3601);
  assert.ok(Math.abs(tracker.distanceM() - 10800) < 15);
  const latest = tracker.last();
  assert.ok(latest !== null);
  latest.lat = 99;
  fixes[3600].t = 0;
  const snapshot = tracker.fixes();
  snapshot[0].lat = 99;
  snapshot.pop();
  assert.deepEqual(tracker.last(), fix(3600));
  assert.deepEqual(tracker.fixes()[0], fix(0));
  assert.equal(tracker.fixes().length, 3601);
});
