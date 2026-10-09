/** Native Skia needs no loading; the web version waits for CanvasKit (load-skia.web.ts). */
export const loadSkia = (): Promise<void> => Promise.resolve();
