import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fail, IDLE, isSlow, panel, SLOW_MS, start, stop, succeed } from './feed-load.ts';

test('a load waits, then succeeds back to idle', () => {
  const w = start(IDLE, 'Amapiano', 0);
  assert.equal(w.phase, 'waiting');
  assert.equal(succeed().phase, 'idle');
});

test('slow after 6 seconds of waiting', () => {
  const w = start(IDLE, 'Amapiano', 1000);
  assert.equal(isSlow(w, 1000 + SLOW_MS - 1), false);
  assert.equal(isSlow(w, 1000 + SLOW_MS), true);
  assert.equal(isSlow(IDLE, 99999), false);
});

test('retrying the same load counts attempts; a new label starts over', () => {
  let s = start(IDLE, 'Jazz', 0);
  s = fail(s, 'offline');
  assert.equal(s.phase === 'failed' && s.attempt, 1);
  s = start(s, 'Jazz', 10);
  assert.equal(s.phase === 'waiting' && s.attempt, 2);
  s = fail(s, 'offline');
  assert.equal(s.phase === 'failed' && s.attempt, 2);
  assert.equal(start(s, 'Funk', 20).phase === 'waiting' && (start(s, 'Funk', 20) as { attempt: number }).attempt, 1);
});

test('stop only stops a load in progress', () => {
  assert.equal(stop(start(IDLE, 'Jazz', 0)).phase, 'stopped');
  assert.equal(stop(IDLE), IDLE);
});

test('the panel says what is happening in plain words, with the right buttons', () => {
  const w = start(IDLE, 'Amapiano', 0);
  assert.deepEqual(panel(w, 0), { title: 'FINDING SONGS · AMAPIANO', body: '', actions: ['cancel'] });
  assert.match(panel(w, SLOW_MS)!.body, /longer than usual/);
  const off = fail(w, 'offline');
  assert.deepEqual(panel(off, 0)!.actions, ['retry', 'another']);
  assert.match(panel(off, 0)!.body, /connection/);
  const again = fail(start(off, 'Amapiano', 1), 'offline');
  assert.match(panel(again, 1)!.body, /2 tries/);
  const empty = fail(w, 'empty');
  assert.equal(panel(empty, 0)!.title, 'NO SONGS LEFT IN AMAPIANO');
  assert.deepEqual(panel(empty, 0)!.actions, ['another']);
  assert.deepEqual(panel(stop(w), 0)!.actions, ['retry', 'another']);
  assert.equal(panel(IDLE, 0), null);
});

test('the test network: off passes through, offline fails, slow waits first', async () => {
  const { simulate } = await import('./feed-load.ts');
  const waits: number[] = [];
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  assert.equal(await simulate('off', async () => 7, sleep), 7);
  await assert.rejects(simulate('offline', async () => 7, sleep));
  assert.equal(await simulate('slow', async () => 7, sleep), 7);
  assert.deepEqual(waits, [8000]);
});
