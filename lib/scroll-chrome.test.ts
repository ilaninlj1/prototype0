import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  END_ZONE_PX,
  FLICK_PX,
  HIDE_AFTER_PX,
  MIN_SCROLL_PX,
  SCROLL_CHROME_START,
  scrollChromeStep,
  SHOW_AFTER_PX,
  tabBarScrollShare,
  tooShortToHide,
  TOP_ZONE_PX,
  type ScrollChromeState,
} from './scroll-chrome.ts';

const MAX = 2000;

/** Scrolls through the offsets in small steps, like a finger would, and returns the final state. */
function scroll(path: number[], from: ScrollChromeState = SCROLL_CHROME_START, over: { maxY?: number; pinned?: boolean } = {}) {
  let s = from;
  let y = s.lastY;
  for (const target of path) {
    const step = target > y ? 4 : -4;
    while (y !== target) {
      y = Math.abs(target - y) < 4 ? target : y + step;
      s = scrollChromeStep(s, { y, maxY: over.maxY ?? MAX, pinned: over.pinned ?? false });
    }
  }
  return s;
}

test('the bars start up and stay up near the top', () => {
  assert.equal(SCROLL_CHROME_START.shown, true);
  assert.equal(scroll([TOP_ZONE_PX]).shown, true);
});

test('scrolling down past the threshold hides them; a little less does not', () => {
  const upAt200: ScrollChromeState = { shown: true, anchorY: 200, lastY: 200 };
  assert.equal(scroll([200 + HIDE_AFTER_PX - 4], upAt200).shown, true);
  assert.equal(scroll([200 + HIDE_AFTER_PX], upAt200).shown, false);
  // Down a bit, back up to 150, down again: the turning point is 150, not 200.
  assert.equal(scroll([230, 150, 150 + HIDE_AFTER_PX - 4], upAt200).shown, true);
  assert.equal(scroll([230, 150, 150 + HIDE_AFTER_PX], upAt200).shown, false);
  // A steady scroll down from the top hides them once past the top zone and the threshold.
  assert.equal(scroll([TOP_ZONE_PX + HIDE_AFTER_PX + 8]).shown, false);
});

test('while hidden, scrolling further down keeps them hidden', () => {
  const hidden = scroll([600]);
  assert.equal(hidden.shown, false);
  assert.equal(scroll([1200], hidden).shown, false);
});

test('a short scroll up brings them back, not a full screen', () => {
  const hidden = scroll([800]);
  assert.equal(scroll([800 - SHOW_AFTER_PX + 4], hidden).shown, false);
  assert.equal(scroll([800 - SHOW_AFTER_PX], hidden).shown, true);
});

test('a flick up brings them back in one event', () => {
  const hidden = scroll([800]);
  const flick = scrollChromeStep(hidden, { y: 800 - FLICK_PX, maxY: MAX, pinned: false });
  assert.equal(flick.shown, true);
  const nudge = scrollChromeStep(hidden, { y: 800 - FLICK_PX + 2, maxY: MAX, pinned: false });
  assert.equal(nudge.shown, false);
});

test('the top and the end of the list bring them back', () => {
  const hidden = scroll([800]);
  assert.equal(scrollChromeStep(hidden, { y: TOP_ZONE_PX, maxY: MAX, pinned: false }).shown, true);
  assert.equal(scrollChromeStep(hidden, { y: -30, maxY: MAX, pinned: false }).shown, true);
  assert.equal(scroll([MAX - END_ZONE_PX], hidden).shown, true);
  assert.equal(scrollChromeStep(hidden, { y: MAX + 40, maxY: MAX, pinned: false }).shown, true);
});

test('a list too short to scroll never hides them', () => {
  assert.equal(scroll([MIN_SCROLL_PX - 1], SCROLL_CHROME_START, { maxY: MIN_SCROLL_PX - 1 }).shown, true);
  assert.equal(tooShortToHide(900, 800), true);
  assert.equal(tooShortToHide(800 + MIN_SCROLL_PX, 800), false);
});

test('pinned (screen reader, sheet, typing) keeps them up anywhere', () => {
  assert.equal(scroll([900], SCROLL_CHROME_START, { pinned: true }).shown, true);
  const hidden = scroll([900]);
  assert.equal(scrollChromeStep(hidden, { y: 904, maxY: MAX, pinned: true }).shown, true);
});

test('Home owns the tab bar on Home; scrolling owns it everywhere else', () => {
  assert.equal(tabBarScrollShare('index', 1), 0);
  assert.equal(tabBarScrollShare('library', 1), 1);
  assert.equal(tabBarScrollShare('explore', 0.4), 0.4);
  assert.equal(tabBarScrollShare('play', 0), 0);
});
