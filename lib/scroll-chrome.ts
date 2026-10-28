// Hide-on-scroll for the scrolling screens (Library, Play, You, search), the way
// Apple Music does it: scroll down through a list and the top bar and the tab
// bar get out of the way; a short scroll back up, the top of the list or its
// end brings them back. Stays up whenever hiding would strand you: a screen
// reader, an open sheet, typing, or a list too short to scroll.
//
// Every function is a worklet so the scroll handler can run it on the UI thread.

/** Scroll down this far past the last turning point and the bars go. */
export const HIDE_AFTER_PX = 40;
/** Scroll back up this far and they return. */
export const SHOW_AFTER_PX = 24;
/** One scroll event moving up this far is a flick: they return at once. */
export const FLICK_PX = 14;
/** This close to the top, they're always up. */
export const TOP_ZONE_PX = 24;
/** This close to the end of the list, they come back. */
export const END_ZONE_PX = 32;
/** A list that scrolls less than this never hides anything. */
export const MIN_SCROLL_PX = 120;

export type ScrollChromeState = {
  shown: boolean;
  /** Where the scroll last turned around: the lowest point while shown, the highest while hidden. */
  anchorY: number;
  /** The previous event's offset, for spotting a flick. */
  lastY: number;
};

export type ScrollSample = {
  /** contentOffset.y */
  y: number;
  /** How far the list can scroll: content height minus the viewport's. */
  maxY: number;
  /** A screen reader, a sheet, the keyboard: anything that keeps the bars up. */
  pinned: boolean;
};

export const SCROLL_CHROME_START: ScrollChromeState = { shown: true, anchorY: 0, lastY: 0 };

export function scrollChromeStep(s: ScrollChromeState, { y, maxY, pinned }: ScrollSample): ScrollChromeState {
  'worklet';
  if (pinned || maxY < MIN_SCROLL_PX || y <= TOP_ZONE_PX || y >= maxY - END_ZONE_PX) return { shown: true, anchorY: y, lastY: y };
  if (s.shown) {
    const anchorY = Math.min(s.anchorY, y);
    return y - anchorY >= HIDE_AFTER_PX ? { shown: false, anchorY: y, lastY: y } : { shown: true, anchorY, lastY: y };
  }
  const anchorY = Math.max(s.anchorY, y);
  const back = anchorY - y >= SHOW_AFTER_PX || s.lastY - y >= FLICK_PX;
  return back ? { shown: true, anchorY: y, lastY: y } : { shown: false, anchorY, lastY: y };
}

/** Whether the list is too short to ever hide anything (checked on layout, when no scroll event comes). */
export function tooShortToHide(contentHeight: number, viewportHeight: number): boolean {
  'worklet';
  return contentHeight - viewportHeight < MIN_SCROLL_PX;
}

/**
 * How much of the scroll rule reaches the tab bar (0 shown, 1 hidden). On Home,
 * Home's own buttons layer owns the bar (lib/home-chrome.ts) and scrolling has no
 * say; on every other tab only scrolling does, so the two never fight.
 */
export function tabBarScrollShare(focusedRoute: string, scrollHidden: number): number {
  'worklet';
  return focusedRoute === 'index' ? 0 : scrollHidden;
}
