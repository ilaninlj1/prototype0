import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { addMark, markSaved, removeLastMark, type ArtCanvas, type Mark } from '@/lib/collage';

// The piece in progress and the finished ones, shared by Home and the art
// screen. One copy in memory, saved to the phone after every change.

const CANVAS_KEY = 'art-canvas-v2'; // v1 held the old shape prints
const PIECES_KEY = 'art-pieces-v2';

let canvas: ArtCanvas = { number: 1, startedAt: Date.now(), marks: [] };
let pieces: ArtCanvas[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const [c, p] = await Promise.all([AsyncStorage.getItem(CANVAS_KEY), AsyncStorage.getItem(PIECES_KEY)]);
      if (c) canvas = JSON.parse(c);
      if (p) pieces = JSON.parse(p);
    } catch {
      // start fresh
    }
    listeners.forEach((fn) => fn());
  })();
  return loaded;
}

function commit(next: ArtCanvas) {
  if (next === canvas) return;
  canvas = next;
  listeners.forEach((fn) => fn());
  AsyncStorage.setItem(CANVAS_KEY, JSON.stringify(canvas)).catch(() => {});
}

/** Add a swiped song's mark. Returns the finished piece when this was the 50th. */
export async function addToCanvas(mark: Mark): Promise<ArtCanvas | undefined> {
  await load();
  const out = addMark(canvas, mark, Date.now());
  if (out.finished) {
    pieces = [...pieces, out.finished];
    AsyncStorage.setItem(PIECES_KEY, JSON.stringify(pieces)).catch(() => {});
  }
  commit(out.canvas);
  return out.finished;
}

export async function saveOnCanvas(trackId: number) {
  await load();
  commit(markSaved(canvas, trackId));
}

export async function undoOnCanvas(trackId: number) {
  await load();
  commit(removeLastMark(canvas, trackId));
}

/** The piece in progress, and the finished ones (oldest first). */
export function useArt(): { canvas: ArtCanvas; pieces: ArtCanvas[] } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    load();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { canvas, pieces };
}
