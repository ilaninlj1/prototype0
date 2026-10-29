import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickStatus, statusText } from './status-line.ts';
import type { StatusInputs } from './status-line.ts';

const all: StatusInputs = {
  failedOffline: true,
  editionReady: 2,
  newsCount: 3,
  mapWords: 'warm · slow',
  moreLabel: 'Brutha',
  sortedText: 'slow, calm',
};

test('a failed load takes priority over every other status', () => {
  assert.deepEqual(pickStatus(all), { kind: 'failed' });
});

test('a ready edition comes next, then news, map, more and sorted', () => {
  const edition = { ...all, failedOffline: false };
  assert.deepEqual(pickStatus(edition), { kind: 'edition', n: 2 });
  const news = { ...edition, editionReady: null };
  assert.deepEqual(pickStatus(news), { kind: 'news', count: 3 });
  const map = { ...news, newsCount: 0 };
  assert.deepEqual(pickStatus(map), { kind: 'map', words: 'warm · slow' });
  const more = { ...map, mapWords: null };
  assert.deepEqual(pickStatus(more), { kind: 'more', label: 'Brutha' });
  assert.deepEqual(pickStatus({ ...more, moreLabel: null }), { kind: 'sorted', text: 'slow, calm' });
});

test('no status is shown when nothing is set', () => {
  assert.equal(pickStatus({
    failedOffline: false,
    editionReady: null,
    newsCount: 0,
    mapWords: null,
    moreLabel: null,
    sortedText: null,
  }), null);
});

test('the status line puts each item in words', () => {
  assert.equal(statusText({ kind: 'failed' }), "Couldn't load more songs · Try again");
  assert.equal(statusText({ kind: 'edition', n: 2 }), 'Edition No. 2 is ready · Play');
  assert.equal(statusText({ kind: 'news', count: 1 }), 'While you were gone: 1 update');
  assert.equal(statusText({ kind: 'news', count: 3 }), 'While you were gone: 3 updates');
  assert.equal(statusText({ kind: 'map', words: 'warm · slow' }), 'In the dark · warm · slow ✕');
  assert.equal(statusText({ kind: 'more', label: 'Brutha' }), 'More like this: Brutha');
  assert.equal(statusText({ kind: 'sorted', text: 'slow, calm' }), 'Sorted: slow, calm');
});

test('a sound deck shows after the map, with its name and a way out', () => {
  const base = { failedOffline: false, editionReady: null, newsCount: 0, mapWords: null, moreLabel: null, sortedText: null };
  assert.deepEqual(pickStatus({ ...base, deckLabel: 'Quiet and sparse' }), { kind: 'deck', label: 'Quiet and sparse' });
  assert.equal(pickStatus({ ...base, deckLabel: 'Quiet and sparse', mapWords: 'dark' })?.kind, 'map');
  assert.equal(statusText({ kind: 'deck', label: 'Quiet and sparse' }), 'Swiping: Quiet and sparse ✕');
});
