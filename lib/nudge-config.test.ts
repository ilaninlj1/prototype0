import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NUDGE, nudgeContent } from './nudge-config.ts';

test('weekly nudge fires Sunday 6pm, reuses one id, and opens Liked', () => {
  assert.deepEqual(NUDGE.trigger, { weekday: 1, hour: 18, minute: 0 }); // expo weekly trigger: 1 = Sunday
  assert.equal(NUDGE.id, 'blindspot-called-it-weekly');
  assert.equal(NUDGE.url, '/modal');
});

test('the reminder prefers the top unseen news item, then a finding, then the Called it text', () => {
  const news = { sentence: 'Mabe Fratti passed 50K listeners. You found them at 4.8K.' };
  const finding = { sentence: "You don't hate Country. You hate happy Country." };

  assert.deepEqual(nudgeContent(news, finding), {
    title: NUDGE.title,
    body: 'Mabe Fratti passed 50K listeners. You found them at 4.8K.',
    url: NUDGE.url,
  });

  assert.deepEqual(nudgeContent(news, null), {
    title: NUDGE.title,
    body: 'Mabe Fratti passed 50K listeners. You found them at 4.8K.',
    url: NUDGE.url,
  });

  assert.deepEqual(nudgeContent(null, finding), {
    title: 'New finding about your taste',
    body: "You don't hate Country. You hate happy Country.",
    url: '/decoded',
  });

  assert.deepEqual(nudgeContent(null, null), {
    title: NUDGE.title,
    body: NUDGE.body,
    url: NUDGE.url,
  });
});
