import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useScreenReader } from '@/hooks/use-screen-reader';
import { chromeVisible, msUntilHide, pinnedOpen, type ChromeState } from '@/lib/home-chrome';

// Home writes, the tab bar reads: the bar lives outside Home but fades with its buttons.
let shown = true;
const listeners = new Set<() => void>();

export function setHomeChromeVisible(v: boolean) {
  if (v === shown) return;
  shown = v;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useHomeChromeVisible(): boolean {
  return useSyncExternalStore(subscribe, () => shown);
}

type Inputs = Pick<ChromeState, 'songsDecided' | 'clipEnded' | 'feedStatusUp' | 'sheetOpen'>;
type Clock = Pick<ChromeState, 'now' | 'lastWakeAt' | 'hiddenByTap'>;

const woken = (): Clock => {
  const t = Date.now();
  return { now: t, lastWakeAt: t, hiddenByTap: false };
};

/**
 * Home's buttons: visible now or not (lib/home-chrome.ts), `wake` for a tap on
 * empty space or any button, `toggleFromCard` for a tap on the card. A pin
 * ending (a sheet closing, the fifth song) starts the 3 s over.
 */
export function useHomeChrome(inputs: Inputs) {
  const [clock, setClock] = useState(woken);
  // Off on the web, which can't tell and always answers yes (that would pin the buttons for good).
  const screenReader = useScreenReader();

  const state: ChromeState = { ...inputs, ...clock, screenReader };
  const visible = chromeVisible(state);
  const pinned = pinnedOpen(state);

  // When a pin lets go, the countdown starts from that moment, not from the last tap.
  const [wasPinned, setWasPinned] = useState(pinned);
  if (wasPinned !== pinned) {
    setWasPinned(pinned);
    if (!pinned) setClock(woken());
  }

  // One timer for the fade: it moves the clock to when they should go.
  const wait = msUntilHide(state);
  useEffect(() => {
    if (wait == null) return;
    const t = setTimeout(() => setClock((c) => ({ ...c, now: Date.now() })), wait);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => setHomeChromeVisible(visible), [visible]);
  useEffect(() => () => setHomeChromeVisible(true), []);

  const wake = useCallback(() => setClock(woken()), []);
  const toggleFromCard = useCallback(() => {
    if (visible && !pinned) setClock((c) => ({ ...c, now: Date.now(), hiddenByTap: true }));
    else setClock(woken());
  }, [visible, pinned]);

  return { visible, wake, toggleFromCard };
}
