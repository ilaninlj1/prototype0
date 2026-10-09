import { lazySkia } from './lazy-skia';
import type { LivePrintProps } from './live-print-canvas';

/** The print in motion: `clock` is the song's position in seconds; `gather` 0 flows, 1 settles onto the rings. */
export const LivePrint = lazySkia<LivePrintProps>(() => import('./live-print-canvas'));
