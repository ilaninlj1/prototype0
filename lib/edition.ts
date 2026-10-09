// The Edition: every 5 reveals become a ~32-second full-screen reel of those
// finds, one scene each in a rotating visual family, between an intro and a
// lockup of all five prints. The reel's clock is its own (30 frames a
// second), never presented as the music's beat. Pure.

import type { PrintRecipe } from './print-recipe.ts';

export const EDITION_SIZE = 5;
export const INTRO = 2.5;
export const SCENE = 5.2;
export const LOCKUP = 4.5;
export const TOTAL = INTRO + EDITION_SIZE * SCENE + LOCKUP;
const FPS = 30;

export type EditionSong = {
  trackId: number;
  title: string;
  artist: string;
  artwork: string;
  previewUrl?: string;
  recipe: PrintRecipe;
  /** How much of it you'd heard when you revealed it, 0–1. */
  heard: number;
};
export type Edition = { number: number; createdAt: number; songs: EditionSong[] };
export type EditionsState = { pending: EditionSong[]; editions: Edition[]; unseen: number | null };
export const EMPTY_EDITIONS: EditionsState = { pending: [], editions: [], unseen: null };

export type SceneKind = 'intro' | 'flow' | 'terrain' | 'orbit' | 'orb' | 'lockup';
export type Scene = { kind: SceneKind; start: number; end: number; song?: number };

const FAMILIES: SceneKind[] = ['flow', 'terrain', 'orbit', 'orb'];

/** A reveal joins the next edition; the 5th makes it. */
export function addReveal(state: EditionsState, song: EditionSong, now: number): { state: EditionsState; made?: Edition } {
  if (state.pending.some((s) => s.trackId === song.trackId)) return { state };
  const pending = [...state.pending, song];
  if (pending.length < EDITION_SIZE) return { state: { ...state, pending } };
  const made: Edition = { number: (state.editions.at(-1)?.number ?? 0) + 1, createdAt: now, songs: pending };
  return { state: { pending: [], editions: [...state.editions, made], unseen: made.number }, made };
}

/** Undo of a reveal: out of the pending five, or out of the edition it just made (which goes back to pending). */
export function removeReveal(state: EditionsState, trackId: number): EditionsState {
  if (state.pending.at(-1)?.trackId === trackId) return { ...state, pending: state.pending.slice(0, -1) };
  const last = state.editions.at(-1);
  if (state.pending.length === 0 && last && state.unseen === last.number && last.songs.at(-1)?.trackId === trackId)
    return { pending: last.songs.slice(0, -1), editions: state.editions.slice(0, -1), unseen: null };
  return state;
}

export function timeline(e: Edition): Scene[] {
  const scenes: Scene[] = [{ kind: 'intro', start: 0, end: INTRO }];
  e.songs.forEach((_, i) => {
    const start = INTRO + i * SCENE;
    scenes.push({ kind: FAMILIES[(i + e.number) % FAMILIES.length], start, end: start + SCENE, song: i });
  });
  scenes.push({ kind: 'lockup', start: TOTAL - LOCKUP, end: TOTAL });
  return scenes;
}

/** The scene playing at t seconds, and how far into it (0–1). Past the end, the lockup holds. */
export function sceneAt(scenes: Scene[], t: number): { index: number; local: number } {
  const i = scenes.findIndex((s) => t < s.end);
  const index = i < 0 ? scenes.length - 1 : i;
  const s = scenes[index];
  return { index, local: Math.max(0, Math.min(1, (t - s.start) / (s.end - s.start))) };
}

/** The reel's own frame counter, F 0151 / 0975. */
export function frameLabel(t: number): string {
  const pad = (n: number) => String(n).padStart(4, '0');
  return `F ${pad(Math.floor(t * FPS))} / ${pad(Math.round(TOTAL * FPS))}`;
}
