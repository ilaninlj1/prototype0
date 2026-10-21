// When Home's buttons show (Minimal UI, spec 2026-10-21): while you listen,
// only the card and its clues stay. Everything else comes back on a touch and
// fades again after a few quiet seconds, and stays up whenever hiding it would
// strand you: your first songs, a clip that ended, no card, a sheet, a screen reader.

export const HIDE_AFTER_MS = 3000;
export const FADE_MS = 250;
export const LEARNING_SONGS = 5;
export const TOAST_MS = 4000;

export type ChromeState = {
  now: number;
  /** The last tap on empty space, button press or card tap that brought them back; -Infinity if none. */
  lastWakeAt: number;
  /** The card was tapped to put them away. */
  hiddenByTap: boolean;
  /** Songs swiped so far, ever (the swipe history's length). */
  songsDecided: number;
  clipEnded: boolean;
  /** No card: the loading or failed panel is up. */
  feedStatusUp: boolean;
  sheetOpen: boolean;
  screenReader: boolean;
};

/** Up no matter how long it's been. */
export function pinnedOpen(s: ChromeState): boolean {
  return s.songsDecided < LEARNING_SONGS || s.clipEnded || s.feedStatusUp || s.sheetOpen || s.screenReader;
}

export function chromeVisible(s: ChromeState): boolean {
  return pinnedOpen(s) || (!s.hiddenByTap && s.now - s.lastWakeAt < HIDE_AFTER_MS);
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
