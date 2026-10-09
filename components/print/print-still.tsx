import { lazySkia } from './lazy-skia';
import type { PrintStillProps } from './print-still-canvas';

/** A song's settled print: the same picture every time for the same recipe. */
export const PrintStill = lazySkia<PrintStillProps>(() => import('./print-still-canvas'));
