import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyLine, movement, parseChartFeed, pickSimilar, risers, risingBaseline, type ChartEntry } from './charts.ts';

const e = (rank: number, id: number): ChartEntry => ({ rank, id, title: `t${id}`, artist: `a${id}`, artworkUrl: '' });

test('parseChartFeed reads Apple feed results into ranked entries', () => {
  const feed = { feed: { updated: 'Wed, 30 Sep 2026 04:01:38 +0000', results: [{ id: '123', name: 'Song', artistName: 'Artist', artworkUrl100: 'u' }] } };
  assert.deepEqual(parseChartFeed(feed), {
    day: '2026-09-30',
    entries: [{ rank: 1, id: 123, title: 'Song', artist: 'Artist', artworkUrl: 'u' }],
  });
  assert.deepEqual(parseChartFeed({}), { day: null, entries: [] });
});

test('movement: climbing is positive, falling negative, missing yesterday is new', () => {
  const today = [e(1, 10), e(2, 20), e(3, 30)];
  const yesterday = [e(1, 20), e(2, 10), e(5, 99)];
  assert.deepEqual(movement(today, yesterday), {
    10: { delta: 1, isNew: false },
    20: { delta: -1, isNew: false },
    30: { delta: null, isNew: true },
  });
  assert.deepEqual(movement(today, []), {});
});

test('risers: biggest climbs first, then new entries, ignoring fallers', () => {
  const today = [e(1, 1), e(2, 2), e(3, 3), e(4, 4)];
  const yesterday = [e(9, 2), e(4, 3), e(1, 1), e(2, 4)];
  assert.deepEqual(risers(today, yesterday, 3).map((x) => x.id), [2, 3]);
  const withNew = [e(1, 7), ...today.slice(1)];
  assert.deepEqual(risers(withNew, yesterday, 5).map((x) => x.id), [2, 3, 7]);
});

test('pickSimilar skips the current artist and ones already played', () => {
  const pick = pickSimilar(['A', 'B', 'C', 'D'], 'A', new Set(['B']), () => 0);
  assert.equal(pick, 'C');
  assert.equal(pickSimilar(['A'], 'A', new Set(), () => 0), null);
});

test('rising baseline: last week when saved, otherwise yesterday', () => {
  const week = [e(9, 1)];
  const yday = [e(3, 1)];
  assert.deepEqual(risingBaseline(week, yday), { entries: week, span: 'this week' });
  assert.deepEqual(risingBaseline([], yday), { entries: yday, span: 'today' });
  assert.deepEqual(risingBaseline([], []), { entries: [], span: 'today' });
});

test('historyLine: peak, days on chart, and "at its peak"', () => {
  assert.equal(historyLine(3, { peak: 3, days: 12 }), 'at its peak · 12 days on chart');
  assert.equal(historyLine(8, { peak: 3, days: 12 }), 'peak #3 · 12 days on chart');
  assert.equal(historyLine(8, { peak: 8, days: 1 }), 'first day on chart');
  assert.equal(historyLine(8, undefined), null);
});
