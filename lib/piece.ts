// A listening session grows into a strip of song prints.
// Pure piece state, branch-aware undo, migration and placement.

import type { PrintRecipe } from './print-recipe.ts';

export const PIECE = { width: 1000, height: 240, slots: 50 } as const;

export type PieceSong = { title: string; artist: string; artwork: string; previewUrl?: string };

export type PieceMark = {
  trackId: number;
  kind: 'reveal' | 'skip';
  saved: boolean;
  branch: number;
  recipe: PrintRecipe;
  song?: PieceSong;
  /** How much of the song you'd heard when you swiped, 0–1: a close listen draws a crisp print. Older marks have none (fully heard). */
  heard?: number;
};

export type Piece = {
  number: number;
  startedAt: number;
  marks: PieceMark[];
  pendingFork: boolean;
  finishedAt?: number;
};

export type PieceState = { piece: Piece; finished: Piece[] };

export type V2Mark = { trackId: number; kind: 'bold' | 'ghost'; saved: boolean; artwork: string };

export type V2Canvas = { number: number; startedAt: number; marks: V2Mark[]; finishedAt?: number };

export type Placed = { x: number; y: number; size: number };

export function newPiece(number: number, now: number, pendingFork = false): Piece {
  return { number, startedAt: now, marks: [], pendingFork };
}

export function addMark(
  state: PieceState,
  mark: Omit<PieceMark, 'branch'>,
  now: number,
): { state: PieceState; finished?: Piece } {
  if (state.piece.marks.some((existing) => existing.trackId === mark.trackId)) return { state };
  const branch = (state.piece.marks.at(-1)?.branch ?? 0) + (state.piece.pendingFork ? 1 : 0);
  const piece: Piece = {
    ...state.piece,
    marks: [...state.piece.marks, { ...mark, branch }],
    pendingFork: false,
  };
  if (piece.marks.length === PIECE.slots) {
    const finished = { ...piece, finishedAt: now };
    return {
      state: { piece: newPiece(piece.number + 1, now), finished: [...state.finished, finished] },
      finished,
    };
  }
  return { state: { ...state, piece } };
}

export function markSaved(state: PieceState, trackId: number): PieceState {
  const save = (piece: Piece): Piece => {
    if (!piece.marks.some((mark) => mark.trackId === trackId && !mark.saved)) return piece;
    return {
      ...piece,
      marks: piece.marks.map((mark) => mark.trackId === trackId ? { ...mark, saved: true } : mark),
    };
  };
  const piece = save(state.piece);
  const finished = state.finished.map(save);
  if (piece === state.piece && finished.every((item, i) => item === state.finished[i])) return state;
  return { piece, finished };
}

export function forkBranch(state: PieceState): PieceState {
  if (state.piece.pendingFork) return state;
  return { ...state, piece: { ...state.piece, pendingFork: true } };
}

export function removeLastMark(state: PieceState, trackId: number): PieceState {
  let { piece, finished } = state;
  if (piece.marks.length === 0) {
    const last = finished.at(-1);
    if (last === undefined || last.marks.at(-1)?.trackId !== trackId) return state;
    piece = { ...last };
    delete piece.finishedAt;
    finished = finished.slice(0, -1);
  }
  const removed = piece.marks.at(-1);
  if (removed === undefined || removed.trackId !== trackId) return state;
  const marks = piece.marks.slice(0, -1);
  return {
    piece: { ...piece, marks, pendingFork: removed.branch > (marks.at(-1)?.branch ?? 0) },
    finished,
  };
}

export function migrateV2(
  canvas: V2Canvas,
  pieces: V2Canvas[],
  recipeOf: (m: V2Mark) => PrintRecipe,
  songOf: (trackId: number) => PieceSong | undefined,
): PieceState {
  const migrate = (source: V2Canvas): Piece => ({
    ...source,
    marks: source.marks.map((mark) => ({
      trackId: mark.trackId,
      kind: mark.kind === 'bold' ? 'reveal' : 'skip',
      saved: mark.saved,
      branch: 0,
      recipe: recipeOf(mark),
      song: mark.kind === 'bold' ? songOf(mark.trackId) : undefined,
    })),
    pendingFork: false,
  });
  return { piece: migrate(canvas), finished: pieces.map(migrate) };
}

export function piecePositions(marks: PieceMark[]): Placed[] {
  const usable = PIECE.width - 2 * 24;
  const step = usable / Math.max(marks.length, 4);
  const size = Math.min(140, step * 1.3, PIECE.height - 24);
  const lanes = [0, -50, 50, -80, 80];
  return marks.map((mark, i) => {
    const lane = 120 + lanes[mark.branch % 5];
    const y = lane + 12 * Math.sin(i * 0.9);
    return {
      x: 24 + step * (i + 0.5),
      y: Math.max(size / 2, Math.min(PIECE.height - size / 2, y)),
      size,
    };
  });
}
