import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callAction, callHit, callLabel, callReceipt, nextCallChange, summarizeCalls, toggleCall, type CalledShot } from './called-shots.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 8, 12).getTime();
const call = (trackId = 1, calledAt = now, listenersAtCall: number | null = 4_800): CalledShot => ({
  trackId, trackName: `Song ${trackId}`, artistName: 'Mabe Fratti', artistId: 123, listenersAtCall, calledAt,
});

test('a call stores its own dated baseline without mutating earlier calls', () => {
  const calls: CalledShot[] = [];
  const next = toggleCall(calls, call());
  assert.deepEqual(next, [call()]);
  assert.deepEqual(calls, []);
});

test('three calls block a fourth across calendar weeks; exactly seven days releases a slot', () => {
  const calls = [call(1, now - 6 * DAY), call(2, now - DAY), call(3, now)];
  assert.equal(callAction(calls, 4, now), 'limit');
  assert.equal(toggleCall(calls, call(4)), calls);
  assert.equal(callAction(calls, 4, now + DAY - 1), 'limit');
  assert.equal(callAction(calls, 4, now + DAY), 'call');
  assert.equal(toggleCall(calls, call(4, now + DAY)).length, 4, 'old receipts remain');
});

test('take-back wins over the limit, removes only this call and frees a slot', () => {
  const calls = [call(1), call(2), call(3)];
  assert.equal(callAction(calls, 2, now + 1), 'take-back');
  const next = toggleCall(calls, call(2, now + 1));
  assert.deepEqual(next, [call(1), call(3)]);
  assert.equal(callAction(next, 4, now + 1), 'call');
  assert.equal(calls.length, 3);
});

test('take-back uses the local calendar day, not an elapsed 24 hours', () => {
  const late = new Date(2026, 9, 8, 23, 59).getTime();
  const calls = [call(1, late)];
  assert.equal(callAction(calls, 1, late + 59_999), 'take-back');
  assert.equal(callAction(calls, 1, late + 60_000), 'locked');
  assert.equal(toggleCall(calls, call(1, late + 60_000)), calls);
});

test('an older call cannot be overwritten or duplicated after its limit window expires', () => {
  const calls = [call(1, now - 8 * DAY)];
  assert.equal(callAction(calls, 1, now), 'locked');
  assert.equal(toggleCall(calls, call(1, now, 50_000)), calls);
});

test('the button refreshes at local midnight or the next rolling expiry', () => {
  const midnight = new Date(2026, 9, 9).getTime();
  assert.equal(nextCallChange([], now), midnight);
  assert.equal(nextCallChange([call(1, now - 7 * DAY + 1_000)], now), now + 1_000);
  assert.equal(nextCallChange([call(1, now - 7 * DAY)], now), midnight);
  assert.equal(nextCallChange([call(1, now)], now), midnight);
});

test('calls hit on a milestone above the baseline or substantial growth', () => {
  assert.equal(callHit(call(1, now, 9_999), 10_000), true);
  assert.equal(callHit(call(1, now, 10_000), 10_000), false);
  assert.equal(callHit(call(), 6_000), true);
  assert.equal(callHit(call(), 5_999), false);
  assert.equal(callHit(call(1, now, 40), 50), false);
  for (const baseline of [null, 0]) assert.equal(callHit(call(1, now, baseline), 50_000), false);
  assert.equal(callHit(call(), undefined), false);
});

test('summary counts calls rather than saves or unique artists; unknown counts wait', () => {
  const calls = [call(1), call(2), { ...call(3), artistName: 'Unknown' }];
  assert.deepEqual(summarizeCalls(calls, { 'Mabe Fratti': 6_000 }), { hit: 2, waiting: 1 });
  assert.deepEqual(summarizeCalls([], {}), { hit: 0, waiting: 0 });
});

test('dated labels and share receipts use the call baseline, with receipts only for hits', () => {
  const shot = call(1, new Date(2026, 9, 2, 12).getTime());
  assert.equal(callLabel(shot, 5_000), 'Called Oct 2 at 4.8K');
  assert.equal(callLabel(shot, 50_000), 'Called Oct 2 at 4.8K → 50K');
  assert.equal(callLabel({ ...shot, listenersAtCall: null }), 'Called Oct 2 · listener count unavailable');
  assert.equal(callReceipt(shot, 50_000), 'Called it blind on Oct 2 at 4,800 listeners. Now 50K. — Blindspot');
  assert.equal(callReceipt(shot, 5_000), null);
  assert.equal(callReceipt(shot, undefined), null);
  assert.equal(callReceipt({ ...shot, listenersAtCall: 0 }, 50_000), null);
});
