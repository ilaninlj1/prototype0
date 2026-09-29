import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NUDGE } from './nudge-config.ts';

test('weekly nudge fires Sunday 6pm, reuses one id, and opens Liked', () => {
  assert.deepEqual(NUDGE.trigger, { weekday: 1, hour: 18, minute: 0 }); // expo weekly trigger: 1 = Sunday
  assert.equal(NUDGE.id, 'blindspot-called-it-weekly');
  assert.equal(NUDGE.url, '/modal');
});
