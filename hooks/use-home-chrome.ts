import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useReducedMotion } from 'react-native-reanimated';

import { useScreenReader } from '@/hooks/use-screen-reader';
import { useTextScale } from '@/hooks/use-text-scale';
import { isBigText } from '@/lib/text-scale';
import { chromeVisible, msUntilHide, pinnedOpen, wakesOnRelease, type ChromeState } from '@/lib/home-chrome';

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

type Inputs = Pick<ChromeState, 'clipEnded' | 'feedStatusUp' | 'sheetOpen'>;
type Clock = Pick<ChromeState, 'now' | 'lastWakeAt' | 'hiddenByTap'>;

/** Home opens bare: nothing has woken the buttons yet. */
const asleep = (): Clock => ({ now: Date.now(), lastWakeAt: -Infinity, hiddenByTap: false });
const woken = (): Clock => {
  const t = Date.now();
  return { now: t, lastWakeAt: t, hiddenByTap: false };
};

/**
 * Home's buttons: visible now or not (lib/home-chrome.ts), `wake` for a tap on
 * empty space or any button, `toggleFromCard` for a tap on the card. A sheet
 * closing starts the 3 s over; any other pin ending goes back to bare.
 */
export function useHomeChrome(inputs: Inputs) {
  const [clock, setClock] = useState(asleep);
  // Off on the web, which can't tell and always answers yes (that would pin the buttons for good).
  const screenReader = useScreenReader();

  // Big text or Reduce Motion: the buttons stay, and a tap on the card no longer puts them away.
  // Both hooks run every render: inside `||` the second was skipped at big text, so changing the
  // phone's text size with the app open changed Home's hook count and crashed it.
  const textScale = useTextScale();
  const reducedMotion = useReducedMotion();
  const steadyControls = isBigText(textScale) || !!reducedMotion;

  const state: ChromeState = { ...inputs, ...clock, screenReader, steadyControls };
  const visible = chromeVisible(state);
  const pinned = pinnedOpen(state);

  // When a sheet's pin lets go, the countdown starts from that moment, not from the last tap.
  const [was, setWas] = useState({ pinned, wakes: wakesOnRelease(state) });
  const wakes = wakesOnRelease(state);
  if (was.pinned !== pinned || was.wakes !== wakes) {
    setWas({ pinned, wakes });
    if (was.pinned && !pinned) setClock(was.wakes ? woken() : asleep());
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
