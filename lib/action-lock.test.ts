import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createActionLock } from './action-lock.ts';

test('one action at a time', () => {
  const lock = createActionLock();
  assert.equal(lock.take(), true);
  assert.equal(lock.take(), false); // a double tap's second press
  assert.equal(lock.held(), true);
  lock.release();
  assert.equal(lock.take(), true);
});

test('a lock held too long (a handler that threw) frees itself', () => {
  let now = 0;
  const lock = createActionLock(() => now, 4000);
  assert.equal(lock.take(), true);
  now = 3999;
  assert.equal(lock.take(), false);
  now = 4001;
  assert.equal(lock.take(), true);
});

test('release is idempotent', () => {
  const lock = createActionLock();
  lock.release();
  assert.equal(lock.take(), true);
  lock.release();
  lock.release();
  assert.equal(lock.held(), false);
});
