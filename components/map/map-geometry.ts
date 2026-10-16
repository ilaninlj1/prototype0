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

/** A region label's left edge: centered on its region, kept inside the map so edge regions stay readable. */
export function labelLeft(sx: number, labelWidth: number, width: number): number {
  'worklet';
  return Math.min(width - labelWidth, Math.max(0, sx - labelWidth / 2));
}

/** Whether a screen point is on the map: a label whose region has slid off screen hides instead of pinning to the edge. */
export function onScreen(sx: number, sy: number, width: number, height: number): boolean {
  'worklet';
  return sx >= 0 && sx <= width && sy >= 0 && sy <= height;
}

/** Pan limits at a zoom, so the map never slides off screen. */
export function clampPan(v: number, zoom: number, size: number): number {
  'worklet';
  const m = (size * (zoom - 1)) / 2;
  return Math.min(m, Math.max(-m, v));
}
