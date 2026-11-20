import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HINT_AFTER_S, hintShowing, hintWanted } from './swipe-hint.ts';

test('a fresh start gets the hint; someone who has already swiped never does, until Tune brings it back', () => {
  assert.equal(hintWanted(null, 0), true);
  assert.equal(hintWanted(null, 12), false);
  assert.equal(hintWanted('done', 0), false);
  assert.equal(hintWanted('armed', 12), true);
});

test('the finger shows only on a blind card that has played a few seconds', () => {
  const on = { wanted: true, hasCard: true, revealed: false, position: HINT_AFTER_S };
  assert.equal(hintShowing(on), true);
  assert.equal(hintShowing({ ...on, position: HINT_AFTER_S - 0.1 }), false, 'still waiting for the tap to play');
  assert.equal(hintShowing({ ...on, revealed: true }), false);
  assert.equal(hintShowing({ ...on, hasCard: false }), false);
  assert.equal(hintShowing({ ...on, wanted: false }), false);
  // Paused after it showed: the position stays put, so the hint does too.
  assert.equal(hintShowing({ ...on, position: 20 }), true);
});
