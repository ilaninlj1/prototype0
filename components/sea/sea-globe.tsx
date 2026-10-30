import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, runOnJS, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';

import { lazySkia } from '@/components/print/lazy-skia';
import { PITCH_LIMIT, pickArc, pulseOffset, type SeaArc, type Spin, type V3 } from '@/lib/sea-globe';

import type { Globe, SeaCanvasProps } from './sea-canvas';

const Canvas = lazySkia<SeaCanvasProps>(() => import('./sea-canvas'));
/** The globe turns by itself this fast (rad/s) while nobody's touching it or looking at a bottle. */
const DRIFT = 0.07;

export type SeaGlobeHandle = {
  /** Turn a place to face you, the short way round. */
  face: (spin: Spin) => void;
};

type Props = {
  width: number;
  height: number;
  dots: V3[];
  arcs: SeaArc[];
  colors: string[];
  /** The tapped bottle (an index into arcs), or -1. */
  selected: number;
  /** Where it starts: your latest stop, or the phone's region. */
  start: Spin;
  onPick: (index: number | null) => void;
};

/** The Sea's globe: drag to turn it (a fling keeps it going), tap a line of light to pick its bottle. */
export const SeaGlobe = forwardRef<SeaGlobeHandle, Props>(function SeaGlobe({ width, height, dots, arcs, colors, selected, start, onPick }, ref) {
  const reduceMotion = useReducedMotion();
  const globe: Globe = useMemo(() => ({ cx: width / 2, cy: height / 2, r: Math.max(60, Math.min(width, height) / 2 - 28) }), [width, height]);
  // yaw is yours (drags, flings, turning to a bottle); drift is the globe's own slow turn, added on top so it never
  // cancels a fling.
  const yaw = useSharedValue(start.yaw);
  const drift = useSharedValue(0);
  const shown = useDerivedValue(() => yaw.get() + drift.get());
  const pitch = useSharedValue(start.pitch);
  const clock = useSharedValue(0);
  const touching = useSharedValue(false);
  const chosen = useSharedValue(selected);
  useEffect(() => {
    chosen.set(selected);
  }, [selected, chosen]);
  const offsets = useMemo(() => arcs.map((a) => pulseOffset(a.bottleId)), [arcs]);

  useFrameCallback((f) => {
    if (reduceMotion) return;
    const dt = Math.min(64, f.timeSincePreviousFrame ?? 16);
    clock.set(clock.get() + dt);
    if (!touching.get() && chosen.get() < 0) drift.set(drift.get() + (DRIFT * dt) / 1000);
  });

  useImperativeHandle(ref, () => ({
    face: (spin: Spin) => {
      // The short way round, from wherever the drift has taken it.
      const now = yaw.get() + drift.get();
      const d = ((((spin.yaw - now) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const timing = { duration: reduceMotion ? 0 : 900, easing: Easing.inOut(Easing.cubic) };
      yaw.set(withTiming(yaw.get() + d, timing));
      pitch.set(withTiming(spin.pitch, timing));
    },
  }));

  const from = useSharedValue({ yaw: 0, pitch: 0 });
  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => {
      touching.set(true);
    })
    .onStart(() => {
      // Grabbing it stops a fling or a turn in progress.
      yaw.set(yaw.get());
      pitch.set(pitch.get());
      from.set({ yaw: yaw.get(), pitch: pitch.get() });
    })
    .onUpdate((e) => {
      yaw.set(from.get().yaw + e.translationX / globe.r);
      pitch.set(Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, from.get().pitch + e.translationY / globe.r)));
    })
    .onEnd((e) => {
      if (!reduceMotion) yaw.set(withDecay({ velocity: e.velocityX / globe.r, deceleration: 0.996 }));
    })
    .onFinalize(() => {
      touching.set(false);
    });

  function tapAt(x: number, y: number) {
    onPick(pickArc({ x, y }, arcs, { yaw: yaw.get() + drift.get(), pitch: pitch.get() }, globe));
  }
  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd((e, ok) => {
      if (ok) runOnJS(tapAt)(e.x, e.y);
    });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View style={{ width, height }} accessible={false}>
        <Canvas
          width={width}
          height={height}
          globe={globe}
          dots={dots}
          arcs={arcs}
          colors={colors}
          offsets={offsets}
          yaw={shown}
          pitch={pitch}
          clock={clock}
          selected={chosen}
          pulses={!reduceMotion}
        />
      </View>
    </GestureDetector>
  );
});
