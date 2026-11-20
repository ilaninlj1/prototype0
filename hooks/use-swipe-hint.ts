import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { HINT_KEY, type HintStored } from '@/lib/swipe-hint';

// One copy for the whole app, so Tune's reset reaches Home at once. `undefined` until storage has answered.
let stored: HintStored | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function load() {
  loading ??= AsyncStorage.getItem(HINT_KEY).then(
    (v) => {
      if (stored !== undefined) return;
      stored = v === 'done' || v === 'armed' ? v : null;
      emit();
    },
    () => {
      if (stored !== undefined) return;
      stored = null;
      emit();
    }
  );
  return loading;
}

function save(v: 'done' | 'armed') {
  if (stored === v) return;
  stored = v;
  emit();
  AsyncStorage.setItem(HINT_KEY, v).catch(() => {});
}

/** The first swipe: the hint has done its job. */
export const finishSwipeHint = () => save('done');
/** Tune → More: show it again, for the next person to pick up the phone. */
export const rearmSwipeHint = () => save('armed');

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSwipeHintStored(): HintStored | undefined {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => stored);
}
