import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
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
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { DarkColors } from '@/constants/theme';
import { CALM_RHYTHM, SEA_BASE, SEA_TALL, SPLASH_AT, crestOf, restingSea, seaY, startWave, stepSea, swellFront, type Rhythm, type SeaState } from '@/lib/sea-beat';

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
const INK = DarkColors.background;
const DROPS = [0, 1, 2, 3, 4, 5];
const NONE = 'M0 0';

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
function Drop({ i, sea }: { i: number; sea: SharedValue<SeaState> }) {
  const props = useAnimatedProps(() => {
    const s = sea.get();
    const tau = s.kind === 2 ? s.since - SPLASH_AT : -1;
    if (tau < 0 || tau > 560) return { cx: -10, cy: -10, opacity: 0 };
    const vx = 0.025 + 0.014 * i;
    const vy = -(0.1 + 0.022 * ((i * 3) % 5));
    return { cx: 4 + 5 * i + vx * tau, cy: SEA_BASE - 10 + vy * tau + 0.00035 * tau * tau, opacity: 0.5 * (1 - tau / 560) };
  });
  return <AnimatedCircle animatedProps={props} r={1.4 + (i % 3) * 0.4} fill={INK} />;
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

/**
 * The sea along the bottom of Home. It keeps the playing song's beat (a crest every two beats, a lift on each one,
 * bigger for louder songs), and how the song changed decides how the water changes: a next song rolls one swell in,
 * a new genre is a mini tsunami, anything else (steering, a deck, the dark, Undo) retunes it slowly as a tide.
 * Bottles (lib/bottle-countdown.ts) ride it: a stranger's coming a step closer each song, and `outgoing` sails one of
 * yours off to the right when a save floats. It never takes a touch.
 */
export function SeaLine({
  width,
  incoming,
  outgoing,
  rhythm,
  wave,
  songTime,
  playing,
}: {
  width: number;
  incoming: SeaBottle;
  outgoing: { key: number; color: string } | null;
  /** The playing song's rhythm; null while its sound is still being looked up (the sea keeps what it has). */
  rhythm: Rhythm | null;
  wave: SeaWave;
  /** The song's clock in seconds, so the beat lands with the print's. */
  songTime: number;
  playing: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const sea = useSharedValue<SeaState>(restingSea(CALM_RHYTHM));
  const target = useSharedValue<Rhythm>(CALM_RHYTHM);
  const queued = useSharedValue(0);
  const clock = useSharedValue(0);
  const playingNow = useSharedValue(0);
  const beatMix = useSharedValue(0);

  useFrameCallback((f) => {
    if (reduceMotion) return;
    const dt = Math.min(64, f.timeSincePreviousFrame ?? 16);
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
    const s = sea.get();
    const out: number[] = [];
    for (let x = FIRST_X; x <= width + STEP; x += STEP) out.push(seaY(x, s, width));
    return out;
  });
  const front = useAnimatedProps(() => ({ d: linePath(ys.get(), 0, 1, 0) }));
  const body = useAnimatedProps(() => ({ d: `${linePath(ys.get(), 0, 1, 0)}L${width + STEP} ${SEA_TALL} L${-STEP} ${SEA_TALL} Z` }));
  // A fainter swell behind, trailing the surface a little to the right.
  const back = useAnimatedProps(() => ({ d: linePath(ys.get(), LAG, 0.6, 5) }));

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

  return (
    <View style={styles.sea} pointerEvents="none">
      <Svg width={width} height={SEA_TALL}>
        <AnimatedPath animatedProps={body} fill={INK} fillOpacity={0.04} />
        <AnimatedPath animatedProps={back} fill="none" stroke={INK} strokeOpacity={0.12} strokeWidth={1.3} />
        <AnimatedPath animatedProps={front} fill="none" stroke={INK} strokeOpacity={0.3} strokeWidth={1.5} />
        <AnimatedPath animatedProps={foam} fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="1 3.5" />
        <AnimatedPath animatedProps={curl} fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
        {DROPS.map((i) => (
          <Drop key={i} i={i} sea={sea} />
        ))}
      </Svg>
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
  sea: { position: 'absolute', left: 0, right: 0, bottom: -4, height: SEA_TALL },
  bottle: { position: 'absolute', left: 0, top: 0, width: BOTTLE, height: BOTTLE },
});
