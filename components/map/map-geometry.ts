// Where the Dark Map's points sit on the canvas and on screen, zoomed about the canvas center. Worklets, so the
// gestures can use them on the UI thread. No Skia here: dark-map.tsx imports this without loading Skia.

import type { MapPoint } from '@/lib/sound-map';

/** px between the map's edge and its outermost songs. */
export const MAP_PAD = 14;
export const MAP_GROUND = '#0b1222';
export const MAP_DIM = '#3a4766';

/** A map point (0–1) on the unzoomed canvas, px. */
export function toCanvas(p: MapPoint, width: number, height: number): { x: number; y: number } {
  'worklet';
  return { x: MAP_PAD + p.x * (width - 2 * MAP_PAD), y: MAP_PAD + p.y * (height - 2 * MAP_PAD) };
}

/** Where a canvas point shows on screen at this zoom and pan. */
export function toScreen(c: { x: number; y: number }, width: number, height: number, zoom: number, panX: number, panY: number) {
  'worklet';
  return { x: width / 2 + panX + (c.x - width / 2) * zoom, y: height / 2 + panY + (c.y - height / 2) * zoom };
}

/** The map point under a screen point, or null outside the map. */
export function toMap(sx: number, sy: number, width: number, height: number, zoom: number, panX: number, panY: number): MapPoint | null {
  'worklet';
  const cx = (sx - width / 2 - panX) / zoom + width / 2;
  const cy = (sy - height / 2 - panY) / zoom + height / 2;
  const x = (cx - MAP_PAD) / (width - 2 * MAP_PAD);
  const y = (cy - MAP_PAD) / (height - 2 * MAP_PAD);
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}

/** Where a region label's text is centered: on its region, moved in just enough that the text stays on the map. */
export function labelCenter(sx: number, textWidth: number, width: number): number {
  'worklet';
  return Math.min(width - textWidth / 2, Math.max(textWidth / 2, sx));
}

/** Whether a screen point is on the map: a label whose region has slid off screen hides instead of pinning to the edge. */
export function onScreen(sx: number, sy: number, width: number, height: number): boolean {
  'worklet';
  return sx >= 0 && sx <= width && sy >= 0 && sy <= height;
}

/** px between label lines: labels closer than this vertically share a line. */
export const LABEL_LINE = 14;

/** A label's text width, roughly: 9pt DM Mono caps with 0.8 letter spacing, plus a little air. */
export function labelTextWidth(words: string): number {
  return words.length * 6.2 + 8;
}

/**
 * Whether label `i` is hidden by a more important one: `labels` are screen positions with text widths, most
 * important first. A label that overlaps a shown one hides until zooming pulls them apart; a hidden label hides
 * nothing.
 */
export function labelCovered(i: number, labels: { x: number; y: number; w: number }[]): boolean {
  'worklet';
  const shown: boolean[] = [];
  for (let k = 0; k <= i; k++) {
    let hit = false;
    for (let j = 0; j < k && !hit; j++) {
      hit = shown[j] && Math.abs(labels[k].x - labels[j].x) < (labels[k].w + labels[j].w) / 2 && Math.abs(labels[k].y - labels[j].y) < LABEL_LINE;
    }
    shown.push(!hit);
  }
  return !shown[i];
}

/** Pan limits at a zoom, so the map never slides off screen. */
export function clampPan(v: number, zoom: number, size: number): number {
  'worklet';
  const m = (size * (zoom - 1)) / 2;
  return Math.min(m, Math.max(-m, v));
}
