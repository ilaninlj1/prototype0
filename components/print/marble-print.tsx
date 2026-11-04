import { lazySkia } from './lazy-skia';
import type { MarblePrintProps } from './marble-print-canvas';

/** The print as marbles: the particles swing when the card moves, bounce off its edges and shake loose (lib/marbles.ts). */
export const MarblePrint = lazySkia<MarblePrintProps>(() => import('./marble-print-canvas'));
