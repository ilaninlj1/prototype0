import type { ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

/** Audio and the model stay on JS; gestures only forward finger positions. */
export function CoralGesture({ children, onBegin, onStart, onMove, onFinish, onTap }: {
  children: ReactNode; onBegin: (x: number, y: number) => void; onStart: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void; onFinish: () => void; onTap: (x: number, y: number) => void;
}) {
  const pan = Gesture.Pan().minDistance(4).maxPointers(1)
    .onBegin((event) => { 'worklet'; runOnJS(onBegin)(event.x, event.y); })
    .onStart((event) => { 'worklet'; runOnJS(onStart)(event.x, event.y); })
    .onUpdate((event) => { 'worklet'; runOnJS(onMove)(event.x, event.y); })
    .onFinalize(() => { 'worklet'; runOnJS(onFinish)(); });
  const tap = Gesture.Tap().maxDistance(12).onEnd((event, ok) => {
    'worklet';
    if (ok) runOnJS(onTap)(event.x, event.y);
  });
  return <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>{children}</GestureDetector>;
}
