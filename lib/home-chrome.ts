// When Home's buttons show (Minimal UI, spec 2026-10-21): Home opens bare, only the sky, the card and its clues.
// Everything else comes on a touch and fades again after a few quiet seconds (a reveal brings it back too), and
// stays up whenever hiding it would strand you: a clip that ended, no card, a sheet, a screen reader. A line under
// the card says how to get the buttons, so a first song needs no pin.
// A phone set to big text or Reduce Motion keeps them up too: someone who needs the buttons should not have to
// find them again every 3 seconds.

export const HIDE_AFTER_MS = 3000;
export const FADE_MS = 250;
export const TOAST_MS = 4000;

export type ChromeState = {
  now: number;
  /** The last tap on empty space, button press or card tap that brought them back; -Infinity if none. */
  lastWakeAt: number;
  /** The card was tapped to put them away. */
  hiddenByTap: boolean;
  clipEnded: boolean;
  /** No card: the loading or failed panel is up. */
  feedStatusUp: boolean;
  sheetOpen: boolean;
  screenReader: boolean;
  /** The phone is set to big text or Reduce Motion: the buttons stay put. */
  steadyControls?: boolean;
};

/** Up no matter how long it's been. */
export function pinnedOpen(s: ChromeState): boolean {
  return s.clipEnded || s.feedStatusUp || s.sheetOpen || s.screenReader || !!s.steadyControls;
}

export function chromeVisible(s: ChromeState): boolean {
  return pinnedOpen(s) || (!s.hiddenByTap && s.now - s.lastWakeAt < HIDE_AFTER_MS);
}

/** A sheet closing leaves the buttons up for a moment, since you were just using them. Any other pin ending goes straight back to bare. */
export function wakesOnRelease(before: ChromeState): boolean {
  return before.sheetOpen;
}

/** How long until they fade on their own, or null when nothing is counting down. */
export function msUntilHide(s: ChromeState): number | null {
  if (pinnedOpen(s) || !chromeVisible(s)) return null;
  return HIDE_AFTER_MS - (s.now - s.lastWakeAt);
}

/** The tab bar belongs to every tab: it only fades along with Home's buttons while Home is the one showing. */
export function tabBarVisible(focusedRoute: string, homeChromeVisible: boolean): boolean {
  return focusedRoute !== 'index' || homeChromeVisible;
}
