import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alphaOf, strongInk } from './strong-ink.ts';

const DARK = { text: '#111111', secondary: 'rgba(17,17,17,0.78)', frost: 'rgba(255,255,255,0.5)' };
const LIGHT = { text: '#f3ead8', secondary: 'rgba(243,234,216,0.86)', frost: 'rgba(255,255,255,0.14)' };

test('with Increase Contrast the small words are as strong as the big ones', () => {
  for (const [ink, dark] of [[DARK, true], [LIGHT, false]] as const) {
    const strong = strongInk(ink, dark);
    assert.equal(strong.secondary, strong.text);
    assert.equal(alphaOf(strong.text), 1);
  }
});

test('buttons and the panel behind the words are close to solid, where they were see-through', () => {
  for (const [ink, dark] of [[DARK, true], [LIGHT, false]] as const) {
    const strong = strongInk(ink, dark);
    assert.ok(alphaOf(strong.frost) >= 0.9 && alphaOf(strong.frost) > alphaOf(ink.frost));
    assert.ok(alphaOf(strong.backing) >= 0.8);
  }
});

test('dark words get a light panel and light words a dark one', () => {
  assert.ok(strongInk(DARK, true).backing.startsWith('rgba(255,255,255'));
  assert.ok(strongInk(LIGHT, false).backing.startsWith('rgba(6,14,36'));
});
