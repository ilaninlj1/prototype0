import { lazy, Suspense, type ComponentType } from 'react';

import { loadSkia } from './load-skia';

/**
 * A Skia component, loaded only after Skia can draw. On web, Skia binds to
 * CanvasKit when its module is evaluated, so every file importing
 * '@shopify/react-native-skia' sits behind this (the *-canvas.tsx files).
 */
export function lazySkia<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  const Lazy = lazy(async () => {
    await loadSkia();
    return load();
  });
  return function SkiaComponent(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
