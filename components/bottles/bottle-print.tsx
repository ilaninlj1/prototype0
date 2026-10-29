import { lazySkia } from '@/components/print/lazy-skia';

import type { BottlePrintProps } from './bottle-print-canvas';

/** A bottle's print: the song's own print, ringed by the songs the people who kept it love. */
export const BottlePrint = lazySkia<BottlePrintProps>(() => import('./bottle-print-canvas'));
