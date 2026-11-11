import assert from 'node:assert/strict';
import { test } from 'node:test';

import { within } from './within.ts';

test('a request that answers in time gives its answer', async () => {
  assert.equal(await within(Promise.resolve('songs'), 50, 'deck'), 'songs');
});

test('a request that never answers fails after the time limit instead of spinning forever', async () => {
  const never = new Promise<string>(() => {});
  await assert.rejects(within(never, 20, 'people_deck'), /people_deck took longer than 0\.02s/);
});

test('a request that fails on its own keeps its own error', async () => {
  await assert.rejects(within(Promise.reject(new Error('offline')), 50, 'deck'), /offline/);
});
