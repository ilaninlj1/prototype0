import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { addLink, emptyCoral, parseCoral, removeLink, setLinkStart, setLinkType } from '@/lib/coral';
import type { CoralSong, CoralState, LinkType } from '@/lib/coral-types';

const STATE_KEY = 'coral:v1';
let state = emptyCoral();
let loaded: Promise<void> | undefined;
let saving = Promise.resolve();
const listeners = new Set<() => void>();

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      state = parseCoral(await AsyncStorage.getItem(STATE_KEY));
    } catch {
      // Storage is best effort; the garden still works in memory.
    }
    listeners.forEach((fn) => fn());
  })();
  return loaded;
}

function commit(next: CoralState): Promise<void> {
  if (next === state) return saving;
  state = next;
  listeners.forEach((fn) => fn());
  // Keep rapid edits in order so an older write cannot overwrite the latest one.
  saving = saving.then(async () => {
    try {
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
    } catch {
      // A failed save must not block later edits.
    }
  });
  return saving;
}

export async function linkSongs(a: CoralSong, b: CoralSong, type: LinkType): Promise<void> {
  await load();
  await commit(addLink(state, a, b, type, Date.now()));
}

export async function unlink(linkId: string): Promise<void> {
  await load();
  await commit(removeLink(state, linkId));
}

export async function changeLinkType(linkId: string, type: LinkType): Promise<void> {
  await load();
  await commit(setLinkType(state, linkId, type));
}

export async function changeLinkStart(linkId: string, end: 'a' | 'b', seconds: number): Promise<void> {
  await load();
  await commit(setLinkStart(state, linkId, end, seconds));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  void load();
  return () => { listeners.delete(fn); };
}

const snapshot = () => state;

export function useCoral(): CoralState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
