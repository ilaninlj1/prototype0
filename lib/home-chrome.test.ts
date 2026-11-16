import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chromeVisible, HIDE_AFTER_MS, msUntilHide, pinnedOpen, tabBarVisible, wakesOnRelease, type ChromeState } from './home-chrome.ts';

const base: ChromeState = {
  now: 10000,
  lastWakeAt: 10000,
  hiddenByTap: false,
  clipEnded: false,
  feedStatusUp: false,
  sheetOpen: false,
  screenReader: false,
};
const at = (ms: number, over: Partial<ChromeState> = {}): ChromeState => ({ ...base, ...over, now: base.now + ms });

test('a wake keeps the buttons up for 3 seconds, then they hide', () => {
  assert.equal(HIDE_AFTER_MS, 3000);
  assert.equal(chromeVisible(at(0)), true);
  assert.equal(chromeVisible(at(2999)), true);
  assert.equal(chromeVisible(at(3000)), false);
});

test('Home opens bare: with no touch yet the buttons are hidden, even on a first song', () => {
  assert.equal(chromeVisible(at(0, { lastWakeAt: -Infinity })), false);
  assert.equal(pinnedOpen(at(0, { lastWakeAt: -Infinity })), false);
});

test('only a sheet closing leaves the buttons up for a moment', () => {
  assert.equal(wakesOnRelease(at(0, { sheetOpen: true })), true);
  assert.equal(wakesOnRelease(at(0, { feedStatusUp: true })), false);
  assert.equal(wakesOnRelease(at(0, { clipEnded: true })), false);
});

test('a clip ending, the feed status, a sheet or a screen reader pin them up', () => {
  for (const over of [{ clipEnded: true }, { feedStatusUp: true }, { sheetOpen: true }, { screenReader: true }]) {
    assert.equal(chromeVisible(at(60000, over)), true, JSON.stringify(over));
    assert.equal(pinnedOpen(at(60000, over)), true);
  }
  assert.equal(pinnedOpen(at(0)), false);
});

test('tapping the card hides them at once, unless they are pinned', () => {
  assert.equal(chromeVisible(at(0, { hiddenByTap: true })), false);
  assert.equal(chromeVisible(at(0, { hiddenByTap: true, screenReader: true })), true);
});

test('msUntilHide counts down a wake and is null when pinned or hidden', () => {
  assert.equal(msUntilHide(at(1000)), 2000);
  assert.equal(msUntilHide(at(1000, { sheetOpen: true })), null);
  assert.equal(msUntilHide(at(5000)), null);
  assert.equal(msUntilHide(at(0, { hiddenByTap: true })), null);
});

test('the tab bar only hides on Home', () => {
  assert.equal(tabBarVisible('play', false), true);
  assert.equal(tabBarVisible('index', false), false);
  assert.equal(tabBarVisible('index', true), true);
});
