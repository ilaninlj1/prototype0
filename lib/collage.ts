// The cover collage: every swiped song gets a tile of its real album cover,
// sharp if you revealed it, blurred if you skipped it. Each new song splits
// the biggest tile, so the piece looks finished at 1 swipe and dense at 50.
// Pure — the drawing is components/art/art-piece.tsx.

export const ART = { width: 1000, height: 240, slots: 50 } as const;

export type Mark = { trackId: number; kind: 'bold' | 'ghost'; saved: boolean; artwork: string };
export type ArtCanvas = { number: number; startedAt: number; marks: Mark[]; finishedAt?: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Tile i belongs to the i-th song. Depends only on how many songs there are, so a piece redraws the same way. */
export function collageRects(n: number): Rect[] {
  if (n <= 0) return [];
  const rects: Rect[] = [{ x: 0, y: 0, w: ART.width, h: ART.height }];
  for (let k = 1; k < n; k++) {
    let j = 0;
    for (let i = 1; i < rects.length; i++) if (rects[i].w * rects[i].h > rects[j].w * rects[j].h + 0.01) j = i;
    const r = rects[j];
    // Off-center cuts (38–62%) so it reads as a collage, not a spreadsheet.
    const t = 0.5 + (((k * 0.6180339887) % 1) - 0.5) * 0.24;
    if (r.w >= r.h) {
      rects[j] = { ...r, w: r.w * t };
      rects.push({ x: r.x + r.w * t, y: r.y, w: r.w * (1 - t), h: r.h });
    } else {
      rects[j] = { ...r, h: r.h * t };
      rects.push({ x: r.x, y: r.y + r.h * t, w: r.w, h: r.h * (1 - t) });
    }
  }
  return rects;
}

export function addMark(canvas: ArtCanvas, mark: Mark, now: number): { canvas: ArtCanvas; finished?: ArtCanvas } {
  if (canvas.marks.some((m) => m.trackId === mark.trackId)) return { canvas };
  const marks = [...canvas.marks, mark];
  if (marks.length < ART.slots) return { canvas: { ...canvas, marks } };
  return {
    canvas: { number: canvas.number + 1, startedAt: now, marks: [] },
    finished: { ...canvas, marks, finishedAt: now },
  };
}

export function markSaved(canvas: ArtCanvas, trackId: number): ArtCanvas {
  if (!canvas.marks.some((m) => m.trackId === trackId && !m.saved)) return canvas;
  return { ...canvas, marks: canvas.marks.map((m) => (m.trackId === trackId ? { ...m, saved: true } : m)) };
}

/** Undo: take back the newest tile, but only if it belongs to the song being undone. */
export function removeLastMark(canvas: ArtCanvas, trackId: number): ArtCanvas {
  const last = canvas.marks[canvas.marks.length - 1];
  return last?.trackId === trackId ? { ...canvas, marks: canvas.marks.slice(0, -1) } : canvas;
}
