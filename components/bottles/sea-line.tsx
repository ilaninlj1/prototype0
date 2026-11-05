import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { oceanDive, settleDiveTo, useDivePan } from '@/components/ocean/dive-gesture';
import { Hatchling } from '@/components/ocean/hatchling';
import { useEasedWater } from '@/hooks/use-eased-water';

import { DarkColors } from '@/constants/theme';
import { CALM_RHYTHM, SEA_BASE, SEA_TALL, SPLASH_AT, crestOf, seaY, startWave, stepSea, swellFront, type Rhythm, type SeaState } from '@/lib/sea-beat';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The sea's height, with room above the surface for a crest; the surface rests SEA_BASE down from its top. */
export const SEA_HEIGHT = SEA_TALL;
export { SEA_BASE };
const MARGIN = 26;
const BOTTLE = 34;
const STEP = 6;
/** The back swell trails the surface by this many samples, so the surface is sampled that far past the left edge. */
const LAG = 7;
const FIRST_X = -STEP * (LAG + 1);
const DROPS = [0, 1, 2, 3, 4, 5];
const NONE = 'M0 0';
const GRABBER = 36;
/** How far either side of the middle a tap still counts as the grabber. */
const GRABBER_REACH = 44;
/** The touch strip starts this far above the resting surface, so a crest is still inside it. */
const STRIP_ABOVE = 20;

export type SeaBottle = { key: string; color: string; position: number } | null;
/** A song change that rolls water in: a next song's swell, or a new genre's tsunami (lib/sea-beat.ts). */
export type SeaWave = { key: number; kind: 'song' | 'genre' } | null;

/** Where a sea position (1 = far right, 0 = the left edge) sits across the screen, as the bottle's centre x. */
export function seaX(position: number, width: number): number {
  return MARGIN + position * (width - MARGIN * 2);
}

function linePath(ys: number[], shift: number, scale: number, dy: number): string {
  'worklet';
  let d = '';
  for (let i = LAG; i < ys.length; i++) {
    const y = ys[i - shift];
    d += `${i > LAG ? 'L' : 'M'}${FIRST_X + i * STEP} ${(SEA_BASE + dy + (y - SEA_BASE) * scale).toFixed(1)} `;
  }
  return d;
}

/** The break's spray: a few drops thrown up off the left edge as the crest hits it. */
function Drop({ i, sea, color }: { i: number; sea: SharedValue<SeaState>; color: string }) {
  const props = useAnimatedProps(() => {
    const s = sea.get();
    const tau = s.kind === 2 ? s.since - SPLASH_AT : -1;
    if (tau < 0 || tau > 560) return { cx: -10, cy: -10, opacity: 0 };
    const vx = 0.025 + 0.014 * i;
    const vy = -(0.1 + 0.022 * ((i * 3) % 5));
    return { cx: 4 + 5 * i + vx * tau, cy: SEA_BASE - 10 + vy * tau + 0.00035 * tau * tau, opacity: 0.5 * (1 - tau / 560) };
  });
  return <AnimatedCircle animatedProps={props} r={1.4 + (i % 3) * 0.4} fill={color} />;
}

function BottleGlyph({ color }: { color: string }) {
  return (
    <Svg width={BOTTLE} height={BOTTLE} viewBox="0 0 30 30">
      <Circle cx={12} cy={15.5} r={8} fill={color} opacity={0.35} />
      <Rect x={3} y={10} width={18} height={11} rx={5.5} fill="rgba(243,234,216,0.55)" stroke={DarkColors.background} strokeWidth={1.3} />
      <Rect x={20} y={12.5} width={5} height={6} rx={1.6} fill="rgba(243,234,216,0.55)" stroke={DarkColors.background} strokeWidth={1.3} />
      <Rect x={24.5} y={13} width={3.5} height={5} rx={1.2} fill="#b07a4a" />
      <Circle cx={12} cy={15.5} r={3.4} fill={color} />
    </Svg>
  );
}

/** The water's colors at the surface: its shallows, where it reaches by the bottom of the phone, and foam's tint. */
export type SeaWater = { top: string; low: string; foam: string; mid?: string; midAt?: number; line?: string; lineOpacity?: number; mist?: string };

// Light on the water: fixed spots that twinkle in turn, and bubbles that rise and wobble. One path each, so it stays light.
const GLINTS = Array.from({ length: 9 }, (_, i) => ({ x: (i * 0.137 + 0.06) % 1, y: 12 + ((i * 29) % 58), speed: 0.7 + (i % 4) * 0.28, phase: i * 2.1, size: 2.4 + (i % 3) * 1.2 }));
const BUBBLES = Array.from({ length: 7 }, (_, i) => ({ x: (i * 0.173 + 0.09) % 1, speed: 0.05 + (i % 3) * 0.018, phase: (i * 0.37) % 1, r: 1 + (i % 3) * 0.7, wobble: i * 1.9 }));

/**
 * The sea along the bottom of Home, real water from the surface to the bottom of the phone. Swipe up from it to go
 * under: the grabber on its crest and the tab bar both start the dive. It keeps the playing song's beat (a crest every two beats, a lift on each one,
 * bigger for louder songs), and how the song changed decides how the water changes: a next song rolls one swell in,
 * a new genre is a mini tsunami, anything else (steering, a deck, the dark, Undo) retunes it slowly as a tide.
 * Bottles (lib/bottle-countdown.ts) ride it: a stranger's coming a step closer each song, and `outgoing` sails one of
 * yours off to the right when a save floats. Bottles and the water's drawing take no touches; the strip along the
 * surface does.
 */
export function SeaLine({
  sea,
  width,
  below,
  water: waterTarget,
  onTapWater,
  hatch,
  incoming,
  outgoing,
  rhythm,
  wave,
  songTime,
  playing,
}: {
  /** The surface, owned by Home so the ocean's canvas can draw the same wave while you dive. */
  sea: SharedValue<SeaState>;
  width: number;
  /** How far the phone's bottom edge is below Home's old bottom: the tab bar's height, since the water runs behind it. */
  below: number;
  water: SeaWater;
  onTapWater: () => void;
  /** A save's creature, which pops out at the surface and swims down. */
  hatch: { key: number; color: string } | null;
  incoming: SeaBottle;
  outgoing: { key: number; color: string } | null;
  /** The playing song's rhythm; null while its sound is still being looked up (the sea keeps what it has). */
  rhythm: Rhythm | null;
  wave: SeaWave;
  /** The song's clock in seconds, so the beat lands with the print's. */
  songTime: number;
  playing: boolean;
}) {
  // Fades with the sky rather than snapping to the next song's colors.
  const water = useEasedWater(waterTarget);
  const reduceMotion = useReducedMotion();
  const target = useSharedValue<Rhythm>(CALM_RHYTHM);
  const queued = useSharedValue(0);
  const clock = useSharedValue(0);
  const playingNow = useSharedValue(0);
  const beatMix = useSharedValue(0);
  const lightClock = useSharedValue(0);
  const bottom = SEA_TALL - 4 + below;

  useFrameCallback((f) => {
    if (reduceMotion) return;
    const dt = Math.min(64, f.timeSincePreviousFrame ?? 16);
    if (oceanDive.get() < 1) lightClock.set(lightClock.get() + dt / 1000);
    let s = sea.get();
    if (queued.get()) {
      s = startWave(s, queued.get() === 2 ? 'genre' : 'song');
      queued.set(0);
    }
    if (playingNow.get()) clock.set(clock.get() + dt / 1000);
    // A paused song stops lifting the water; the sea itself keeps moving.
    beatMix.set(beatMix.get() + (playingNow.get() - beatMix.get()) * (1 - Math.exp(-dt / 200)));
    sea.set(stepSea(s, dt, target.get(), clock.get(), beatMix.get()));
  });

  const tempo = rhythm?.tempo;
  const amp = rhythm?.amp;
  useEffect(() => {
    if (tempo != null && amp != null) target.set({ tempo, amp });
  }, [tempo, amp, target]);
  useEffect(() => {
    // A jump wins over a song's swell queued in the same frame.
    if (wave) queued.set(Math.max(queued.get(), wave.kind === 'genre' ? 2 : 1));
    // Runs once per wave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave?.key]);
  useEffect(() => {
    if (Math.abs(clock.get() - songTime) > 0.3) clock.set(songTime);
  }, [songTime, clock]);
  useEffect(() => {
    playingNow.set(playing ? 1 : 0);
  }, [playing, playingNow]);

  // The surface every STEP px, from past the left edge (for the back swell) to just off the right.
  const ys = useDerivedValue(() => {
    const out: number[] = [];
    // Under the water the ocean's canvas covers all this, so it stops being redrawn.
    if (oceanDive.get() >= 1) return out;
    const s = sea.get();
    for (let x = FIRST_X; x <= width + STEP; x += STEP) out.push(seaY(x, s, width));
    return out;
  });
  const front = useAnimatedProps(() => ({ d: ys.get().length ? linePath(ys.get(), 0, 1, 0) : NONE }));
  const body = useAnimatedProps(() => ({ d: ys.get().length ? `${linePath(ys.get(), 0, 1, 0)}L${width + STEP} ${bottom} L${-STEP} ${bottom} Z` : NONE }));
  // A paler swell behind, trailing the surface a little to the right.
  const back = useAnimatedProps(() => ({ d: ys.get().length ? `${linePath(ys.get(), LAG, 0.6, -5)}L${width + STEP} ${bottom} L${-STEP} ${bottom} Z` : NONE }));
  const glints = useAnimatedProps(() => {
    const t = lightClock.get();
    let d = '';
    for (const g of GLINTS) {
      const v = Math.pow(Math.max(0, Math.sin(t * g.speed + g.phase)), 5);
      if (v < 0.05) continue;
      const x = g.x * width + Math.sin(t * 0.3 + g.phase) * 8;
      const y = SEA_BASE + g.y;
      const l = g.size * v;
      d += `M${x - l} ${y}L${x + l} ${y}M${x} ${y - l}L${x} ${y + l}`;
    }
    return { d: d || NONE };
  });
  const bubbles = useAnimatedProps(() => {
    const t = lightClock.get();
    const y0 = SEA_BASE + 6;
    let d = '';
    for (const b of BUBBLES) {
      const f = (t * b.speed + b.phase) % 1;
      const y = bottom + 6 - f * (bottom - y0);
      const x = b.x * width + Math.sin(t * 1.4 + b.wobble) * 5;
      d += `M${x - b.r} ${y}a${b.r} ${b.r} 0 1 0 ${b.r * 2} 0a${b.r} ${b.r} 0 1 0 ${-b.r * 2} 0`;
    }
    return { d };
  });
  const grabberStyle = useAnimatedStyle(() => {
    const s = sea.get();
    return { transform: [{ translateX: width / 2 - GRABBER / 2 }, { translateY: seaY(width / 2, s, width) + 6 }] };
  });

  // Foam: a thin line riding a swell's front, or the tsunami's white cap.
  const foam = useAnimatedProps(() => {
    const s = sea.get();
    const y = ys.get();
    const crest = crestOf(s, width);
    const swell = crest ? null : swellFront(s, width);
    const from = crest ? crest.x - 10 : swell ? swell.x - 46 : 0;
    const to = crest ? crest.x + 40 : swell ? swell.x + 8 : 0;
    const strength = crest ? Math.min(1, crest.height / 20) : swell ? swell.foam : 0;
    let d = '';
    for (let i = 0; i < y.length && strength > 0.02; i++) {
      const x = FIRST_X + i * STEP;
      if (x >= from && x <= to) d += `${d ? 'L' : 'M'}${x} ${(y[i] - 4).toFixed(1)} `;
    }
    return { d: d || NONE, strokeOpacity: 0.5 * strength };
  });
  // The tsunami's lip, curling over its steep left face.
  const curl = useAnimatedProps(() => {
    const crest = crestOf(sea.get(), width);
    if (!crest || crest.height < 8) return { d: NONE, strokeOpacity: 0 };
    const y = ys.get();
    const i = Math.round((crest.x - FIRST_X) / STEP);
    const py = i >= 0 && i < y.length ? y[i] : SEA_BASE - crest.height;
    const k = crest.height / 22;
    const x = crest.x;
    return {
      d: `M${x + 6 * k} ${py + 1} Q${x - 6 * k} ${py - 6 * k} ${x - 14 * k} ${py + 2 * k} Q${x - 16 * k} ${py + 7 * k} ${x - 11 * k} ${py + 9 * k}`,
      strokeOpacity: 0.3,
    };
  });

  // A bottle sits on the surface and tilts with its slope, so it rides the swell, lifts on a crest and sinks in a trough.
  function float(x: number, s: SeaState) {
    'worklet';
    const slope = (seaY(x + 4, s, width) - seaY(x - 4, s, width)) / 8;
    const tilt = Math.max(-0.7, Math.min(0.7, Math.atan(slope)));
    return [{ translateX: x - BOTTLE / 2 }, { translateY: seaY(x, s, width) - BOTTLE / 2 - 2 }, { rotate: `${tilt}rad` }];
  }

  // The incoming bottle: it appears where it is (never slides in from off screen), then glides a step at a time.
  const bx = useSharedValue(width);
  const shown = useSharedValue(0);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!incoming) {
      shown.set(0);
      lastKey.current = null;
      return;
    }
    const x = seaX(incoming.position, width);
    if (incoming.key !== lastKey.current) {
      lastKey.current = incoming.key;
      bx.set(x);
      shown.set(reduceMotion ? 1 : withTiming(1, { duration: 700 }));
    } else bx.set(reduceMotion ? x : withTiming(x, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [incoming, width, bx, shown, reduceMotion]);
  const riding = useAnimatedStyle(() => ({ opacity: shown.get(), transform: float(bx.get(), sea.get()) }));

  // One of yours sets sail: from the middle, riding the same wave, off the right edge.
  const ox = useSharedValue(width + BOTTLE);
  const oShown = useSharedValue(0);
  useEffect(() => {
    if (!outgoing || reduceMotion) return;
    // It picks the light up where the save's glint lands (components/bottles/launch-light.tsx, 0.7 s), then sails.
    oShown.set(0);
    ox.set(width / 2);
    oShown.set(withDelay(600, withTiming(1, { duration: 200 })));
    ox.set(withDelay(800, withTiming(width + BOTTLE * 2, { duration: 2200, easing: Easing.in(Easing.quad) })));
  }, [outgoing, width, ox, oShown, reduceMotion]);
  const sailing = useAnimatedStyle(() => ({ opacity: oShown.get(), transform: float(ox.get(), sea.get()) }));

  // A tap near the grabber goes under; anywhere else on the water wakes the buttons, like any empty space on Home.
  const divePan = useDivePan();
  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e, ok) => {
      if (!ok) return;
      if (Math.abs(e.x - width / 2) <= GRABBER_REACH) settleDiveTo(1);
      else runOnJS(onTapWater)();
    });
  const gesture = Gesture.Exclusive(divePan, tap);

  return (
    <View style={[styles.sea, { height: bottom, bottom: -below }]} pointerEvents="box-none">
      <Svg width={width} height={bottom} pointerEvents="none">
        <Defs>
          <LinearGradient id="seaWater" x1="0" y1={SEA_BASE - 12} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
            {[
              <Stop key="top" offset="0" stopColor={water.top} />,
              ...(water.mid ? [<Stop key="mid" offset={water.midAt ?? 0.5} stopColor={water.mid} />] : []),
              <Stop key="low" offset="1" stopColor={water.low} />,
            ]}
          </LinearGradient>
          <LinearGradient id="seaMist" x1="0" y1="0" x2="0" y2={SEA_BASE + 6} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={water.mist ?? water.top} stopOpacity="0" />
            <Stop offset="1" stopColor={water.mist ?? water.top} stopOpacity="0.2" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={SEA_BASE + 6} fill="url(#seaMist)" />
        <AnimatedPath animatedProps={back} fill={water.top} fillOpacity={0.45} />
        <AnimatedPath animatedProps={body} fill="url(#seaWater)" />
        <AnimatedPath animatedProps={bubbles} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={0.9} />
        <AnimatedPath animatedProps={glints} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1} strokeLinecap="round" />
        <AnimatedPath animatedProps={front} fill="none" stroke={water.line ?? '#ffffff'} strokeOpacity={water.lineOpacity ?? 0.9} strokeWidth={1.6} />
        <AnimatedPath animatedProps={foam} fill="none" stroke={water.foam} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="1 3.5" />
        <AnimatedPath animatedProps={curl} fill="none" stroke={water.foam} strokeWidth={1.5} strokeLinecap="round" />
        {DROPS.map((i) => (
          <Drop key={i} i={i} sea={sea} color={water.foam} />
        ))}
      </Svg>
      <Hatchling hatch={hatch} width={width} surface={SEA_BASE} depth={bottom - SEA_BASE} />
      <GestureDetector gesture={gesture}>
        <View style={[styles.strip, { top: SEA_BASE - STRIP_ABOVE, bottom: below }]} />
      </GestureDetector>
      <Animated.View
        style={[styles.grabber, grabberStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Go under the water"
        onAccessibilityTap={() => settleDiveTo(1)}
        pointerEvents="none"
      />
      {incoming && (
        <Animated.View style={[styles.bottle, riding]}>
          <BottleGlyph color={incoming.color} />
        </Animated.View>
      )}
      {outgoing && (
        <Animated.View style={[styles.bottle, sailing]}>
          <BottleGlyph color={outgoing.color} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  strip: { position: 'absolute', left: 0, right: 0 },
  grabber: { position: 'absolute', left: 0, top: 0, width: GRABBER, height: 4, borderRadius: 2, backgroundColor: '#ffffff', shadowColor: '#06222b', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  bottle: { position: 'absolute', left: 0, top: 0, width: BOTTLE, height: BOTTLE },
});
