import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import { addMark, forkBranch, markSaved, migrateV2, newPiece, removeLastMark, type Piece, type PieceMark, type PieceSong, type PieceState, type V2Canvas } from '@/lib/piece';
import { recipeFor } from '@/lib/print-recipe';
import { soundFor } from '@/lib/sound-index';

// The piece in progress and the finished ones, shared by Home and the art
// screen. One copy in memory, saved to the phone after every change.
const STATE_KEY = 'art-state-v3';
const V2_CANVAS = 'art-canvas-v2';
const V2_PIECES = 'art-pieces-v2';

let state: PieceState = { piece: newPiece(1, Date.now()), finished: [] };
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function migrate(): Promise<PieceState | null> {
  const [c, p] = await Promise.all([AsyncStorage.getItem(V2_CANVAS), AsyncStorage.getItem(V2_PIECES)]);
  if (!c && !p) return null;
  const [liked, history] = await Promise.all([loadLikedTracks(), loadSwipeHistory()]);
  const songs = new Map<number, PieceSong>();
  for (const h of history) if (h.trackName && h.artistName) songs.set(h.trackId, { title: h.trackName, artist: h.artistName, artwork: '' });
  for (const t of liked) songs.set(t.id, { title: t.trackName, artist: t.artistName, artwork: t.artworkUrl100, previewUrl: t.previewUrl });
  const canvas: V2Canvas = c ? JSON.parse(c) : { number: 1, startedAt: Date.now(), marks: [] };
  const pieces: V2Canvas[] = p ? JSON.parse(p) : [];
  return migrateV2(canvas, pieces, (m) => recipeFor(m.trackId, soundFor(m.trackId), null), (id) => {
    const s = songs.get(id);
    return s ? { ...s, artwork: s.artwork || (canvas.marks.concat(...pieces.map((x) => x.marks)).find((m) => m.trackId === id)?.artwork ?? '') } : undefined;
  });
}

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(STATE_KEY);
      if (saved) state = JSON.parse(saved);
      else {
        const migrated = await migrate();
        if (migrated) {
          state = migrated;
          await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
        }
      }
    } catch {
      // start fresh
    }
    listeners.forEach((fn) => fn());
  })();
  return loaded;
}

function commit(next: PieceState) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => fn());
  AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => {});
}

/** Add a song's mark. Returns the finished piece when this was the 50th. */
export async function addToPiece(mark: Omit<PieceMark, 'branch'>): Promise<Piece | undefined> {
  await load();
  const out = addMark(state, mark, Date.now());
  commit(out.state);
  return out.finished;
}

export async function saveOnPiece(trackId: number) {
  await load();
  commit(markSaved(state, trackId));
}

/** A genre jump: the next mark starts a new branch. */
export async function forkPiece() {
  await load();
  commit(forkBranch(state));
}

export async function undoOnPiece(trackId: number) {
  await load();
  commit(removeLastMark(state, trackId));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  load();
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The piece in progress and the finished ones. Read through
 * useSyncExternalStore: the state lives outside React, and the React Compiler
 * would otherwise memoize a plain read of it and never show a new mark.
 */
export function useArt(): { piece: Piece; finished: Piece[] } {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return { piece: snapshot.piece, finished: snapshot.finished };
}
