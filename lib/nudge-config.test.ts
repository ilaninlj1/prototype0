import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NUDGE, nudgeContent } from './nudge-config.ts';

test('weekly nudge fires Sunday 6pm, reuses one id, and opens Liked', () => {
  assert.deepEqual(NUDGE.trigger, { weekday: 1, hour: 18, minute: 0 }); // expo weekly trigger: 1 = Sunday
  assert.equal(NUDGE.id, 'blindspot-called-it-weekly');
  assert.equal(NUDGE.url, '/modal');
});

test('the reminder announces a finding nobody has opened, else keeps the Called it text', () => {
  assert.deepEqual(nudgeContent({ sentence: "You don't hate Country. You hate happy Country." }), {
    title: 'New finding about your taste',
    body: "You don't hate Country. You hate happy Country.",
    url: '/decoded',
  });
  assert.deepEqual(nudgeContent(null), { title: NUDGE.title, body: NUDGE.body, url: NUDGE.url });
});
