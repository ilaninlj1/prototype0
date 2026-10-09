import { lazySkia } from '@/components/print/lazy-skia';
import type { EditionCanvasProps } from './edition-canvas';

/** The Edition's scenes (Skia, loaded once Skia can draw). */
export const EditionView = lazySkia<EditionCanvasProps>(() => import('./edition-canvas'));
