import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

let loading: Promise<void> | null = null;

/** CanvasKit (public/canvaskit.wasm, from `npx setup-skia-web public`) must load before any Skia module is evaluated. */
export const loadSkia = (): Promise<void> => (loading ??= LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' }));
