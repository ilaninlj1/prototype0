import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { addReveal, EMPTY_EDITIONS, removeReveal, type Edition, type EditionSong, type EditionsState } from '@/lib/edition';

// Editions: the reveals waiting to make the next one, the ones made, and
// which is ready but not watched yet. One copy in memory, saved after every
// change, read through useSyncExternalStore (the React Compiler would
// memoize a plain read of module state).
const KEY = 'blindspot:editions:v1';

let state: EditionsState = EMPTY_EDITIONS;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved) state = { ...EMPTY_EDITIONS, ...JSON.parse(saved) };
    } catch {
      // start fresh
    }
    listeners.forEach((fn) => fn());
  })();
  return loaded;
}

function commit(next: EditionsState) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => fn());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

/** A reveal joins the next edition. Returns the edition when this was the 5th. */
export async function addRevealToEditions(song: EditionSong): Promise<Edition | undefined> {
  await load();
  const out = addReveal(state, song, Date.now());
  commit(out.state);
  return out.made;
}

export async function undoRevealInEditions(trackId: number) {
  await load();
  commit(removeReveal(state, trackId));
}

export async function markEditionSeen(number: number) {
  await load();
  if (state.unseen === number) commit({ ...state, unseen: null });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  load();
  return () => {
    listeners.delete(fn);
  };
}

export function useEditions(): EditionsState {
  return useSyncExternalStore(subscribe, () => state);
}
