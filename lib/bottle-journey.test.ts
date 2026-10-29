import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bottleNews, journeySummary, keepLine, markBottlesSeen, ordinal, revealLine, routeStops } from './bottle-journey.ts';
import type { Bottle, Hop } from './bottle-rows.ts';

const hop = (city: string, kind: Hop['kind'] = 'keep', exact = true): Hop => ({
  kind,
  city,
  country: 'X',
  lat: 0,
  lng: 0,
  exact,
  tier: null,
  ring: null,
  at: '2026-10-28T12:00:00Z',
});
const bottle = (over: Partial<Bottle> = {}): Bottle => ({
  id: 'b1',
  trackId: 7,
  artistKey: 'a',
  genreTag: 'g',
  keeps: 0,
  passes: 0,
  state: 'floating',
  lastMovedAt: '',
  changedAt: '',
  hops: [hop('Dallas', 'launch')],
  ...over,
});

test('ordinals', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd', '111th']
  );
});

test('the reveal line names the launch city, or the region in lower case', () => {
  assert.equal(revealLine(bottle()), 'Washed up from Dallas');
  assert.equal(revealLine(bottle({ hops: [hop('Somewhere in Central US', 'launch', false)] })), 'Washed up from somewhere in Central US');
  assert.equal(revealLine(bottle({ hops: [] })), 'Washed up from somewhere');
});

test('the keep line counts the finder', () => {
  assert.equal(keepLine(bottle({ keeps: 0 })), "You're the 2nd person to keep this. It's floating on.");
  assert.equal(keepLine(bottle({ keeps: 5 })), "You're the 7th person to keep this. It's floating on.");
});

test('route stops collapse a city in a row and end with you', () => {
  const b = bottle({ keeps: 3, hops: [hop('Dallas', 'launch'), hop('Dallas'), hop('Lisbon'), hop('Dallas')] });
  assert.deepEqual(routeStops(b, { city: 'Seoul', country: 'KR', lat: 37.5, lng: 127, exact: true }), [
    { label: 'Dallas', count: 2, you: false },
    { label: 'Lisbon', count: 1, you: false },
    { label: 'Dallas', count: 1, you: false },
    { label: 'Seoul', count: 1, you: true },
  ]);
  assert.deepEqual(routeStops(bottle(), { city: 'Dallas', country: 'US', lat: 33, lng: -97, exact: true }), [{ label: 'Dallas', count: 2, you: true }]);
  assert.deepEqual(routeStops(bottle(), null), [{ label: 'Dallas', count: 1, you: false }]);
});

test('journey summaries for floating, sunk and retired bottles', () => {
  const three = [hop('Dallas', 'launch'), hop('Lisbon'), hop('Seoul'), hop('Lisbon')];
  assert.equal(journeySummary(bottle({ keeps: 3, hops: three })), 'Kept by 4 people in 3 cities');
  assert.equal(journeySummary(bottle({ keeps: 1, hops: [hop('Dallas', 'launch'), hop('Dallas')] })), 'Kept by 2 people in 1 city');
  assert.equal(journeySummary(bottle()), 'Floating · no stranger has kept it yet');
  assert.equal(journeySummary(bottle({ state: 'sunk', keeps: 8, hops: three })), 'Sank after 9 people kept it');
  assert.equal(journeySummary(bottle({ state: 'sunk', keeps: 0 })), 'Sank before anyone kept it');
  assert.equal(journeySummary(bottle({ state: 'retired' })), "Pulled: it wouldn't play for people");
});

const titleOf = (id: number) => (id === 7 ? 'Kaya' : null);

test('news reports new keeps on your own find once', () => {
  const seen = { b1: { keeps: 0, state: 'floating' as const, launched: true } };
  const now = bottle({ keeps: 3, hops: [hop('Dallas', 'launch'), hop('Austin'), hop('Lisbon'), hop('Seoul')] });
  const news = bottleNews([now], seen, titleOf);
  assert.equal(news.length, 1);
  assert.equal(news[0].sentence, 'Your find “Kaya” washed up in Seoul and was kept · 4 people, 4 cities.');
  assert.deepEqual(bottleNews([now], markBottlesSeen(seen, [now]), titleOf), []);
});

test('news for a bottle you kept says so', () => {
  const seen = { b1: { keeps: 1, state: 'floating' as const, launched: false } };
  const now = bottle({ keeps: 2, hops: [hop('Dallas', 'launch'), hop('Austin'), hop('Somewhere in Europe', 'keep', false)] });
  assert.equal(bottleNews([now], seen, titleOf)[0].sentence, '“Kaya”, a bottle you kept, washed up somewhere in Europe and was kept · 3 people, 3 cities.');
});

test('news reports sinking', () => {
  const seen = { b1: { keeps: 8, state: 'floating' as const, launched: true } };
  const news = bottleNews([bottle({ keeps: 8, state: 'sunk' })], seen, titleOf);
  assert.equal(news[0].sentence, '“Kaya” sank after 9 people kept it.');
});

test('news skips bottles never seen before and unknown titles', () => {
  assert.deepEqual(bottleNews([bottle({ keeps: 4 })], {}, titleOf), []);
  const seen = { b1: { keeps: 0, state: 'floating' as const, launched: true } };
  assert.deepEqual(bottleNews([bottle({ keeps: 1, trackId: 8, hops: [hop('Dallas', 'launch'), hop('Oslo')] })], seen, titleOf), []);
});

test('markBottlesSeen records every bottle, keeping who launched it', () => {
  const seen = markBottlesSeen({ b1: { keeps: 0, state: 'floating', launched: true } }, [bottle({ keeps: 2 }), bottle({ id: 'b2', keeps: 1 })]);
  assert.deepEqual(seen, {
    b1: { keeps: 2, state: 'floating', launched: true },
    b2: { keeps: 1, state: 'floating', launched: false },
  });
});
