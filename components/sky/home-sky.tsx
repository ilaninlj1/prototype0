import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { oceanDive } from '@/components/ocean/dive-gesture';
import { lazySkia } from '@/components/print/lazy-skia';
import { islandColors, lookVector, moonAt, sunAt, toHex, wordsVeil, type MatchedWater, type SkyLook } from '@/lib/home-sky';
import { boltPath, glitterPath, gullsPath, rainPath, ripplesPath, stepSign, swellPath, type SignState } from '@/lib/home-sky-motion';

import { ISLAND_GROUND, ISLAND_WIDTH, SkyIsland } from './sky-island';
import type { SkyCanvasProps } from './sky-canvas';

const SkyCanvas = lazySkia<SkyCanvasProps>(() => import('./sky-canvas'));

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/** The far water starts this far above the near wave, which stays exactly where it was. */
export const HORIZON_ABOVE = 44;
/** Clouds redraw this often. They're slow, and it's the costly part. */
const CLOUD_MS = 50;
/** Everything else on the sky: the sock, the sign, the far water, rain. */
const FRAME_MS = 32;
const TWINKLE_A = Array.from({ length: 45 }, (_, i) => star(i, 1));
const TWINKLE_B = Array.from({ length: 45 }, (_, i) => star(i, 7));

function star(i: number, salt: number) {
  const u = (n: number) => Math.abs((Math.sin((i + salt) * n) * 43758.5453) % 1);
  return { x: u(12.9898), y: u(78.233), r: 0.5 + u(39.425) * 1 };
}

const StarField = memo(function StarField({ width, height, stars }: { width: number; height: number; stars: { x: number; y: number; r: number }[] }) {
  return (
    <>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x * width} cy={s.y * (height - 30)} r={s.r} fill="#fffaeb" />
      ))}
    </>
  );
});

export type HomeSkyProps = {
  width: number;
  /** Full height of Home's layer, down to the bottom of the phone. */
  height: number;
  surfaceY: number;
  /** Middle of the row the genre button and icons sit in. */
  headerY: number;
  /** Where the card's words start, for the haze behind them. */
  wordsTop: number;
  hour: number;
  look: SkyLook;
  water: MatchedWater;
  wordsDark: boolean;
  tempo: number;
  wave: { key: number; kind: 'song' | 'genre' } | null;
  signFront: string;
  signBack: string;
  /** Home is on screen. Everything stops when it isn't. */
  active: boolean;
};

/** Behind Home: the sky, stars and moon, the weather, the island, and the far water that runs back to the horizon. */
export function HomeSky({ width, height, surfaceY, headerY, wordsTop, hour, look, water, wordsDark, tempo, wave, signFront, signBack, active }: HomeSkyProps) {
  const horizon = surfaceY - HORIZON_ABOVE;
  const reduced = useReducedMotion();
  const weather = look.weather;
  const sun = useMemo(() => sunAt(hour, width, horizon), [hour, width, horizon]);
  const moon = useMemo(() => moonAt(hour, width, horizon), [hour, width, horizon]);
  const vector = useMemo(() => lookVector(look, sun, moon), [look, sun, moon]);
  const colors = useMemo(() => islandColors(look), [look]);
  const veil = useMemo(() => wordsVeil(look, wordsDark), [look, wordsDark]);
  const night = look.day.night;
  const starAmount = Math.max(0, Math.min(1, (night - 0.45) / 0.5)) * (1 - weather.dark * 0.8);

  const lookFrom = useSharedValue(vector);
  const lookTo = useSharedValue(vector);
  const lookT = useSharedValue(1);
  const lastVector = useRef(vector);
  useEffect(() => {
    lookFrom.set(lastVector.current);
    lookTo.set(vector);
    lastVector.current = vector;
    lookT.set(0);
    lookT.set(withTiming(1, { duration: reduced ? 0 : 2200 }));
  }, [vector, lookFrom, lookTo, lookT, reduced]);

  const clock = useSharedValue(0);
  const cloud = useSharedValue(0);
  const cloudNow = useSharedValue(0);
  const flash = useSharedValue(0);
  const gust = useSharedValue(0);
  const wind = useSharedValue(weather.wind);
  const windTarget = useSharedValue(weather.wind);
  const rain = useSharedValue(weather.rain);
  const rainTarget = useSharedValue(weather.rain);
  const storm = useSharedValue(weather.storm && !reduced);
  const beat = useSharedValue(tempo);
  const sign = useSharedValue<SignState>({ theta: 0, vel: 0, n: 0, next: 5 });
  const flips = useSharedValue(0);
  const nextBolt = useSharedValue(3);
  const bolt = useSharedValue({ seed: 1, x: 40 });
  const acc = useSharedValue(0);
  const accCloud = useSharedValue(0);
  const isActive = useSharedValue(active);
  const lastFlip = useSharedValue(0);

  useEffect(() => {
    windTarget.set(weather.wind);
    rainTarget.set(weather.rain);
    storm.set(weather.storm && !reduced);
    beat.set(tempo);
  }, [weather, reduced, tempo, windTarget, rainTarget, storm, beat]);
  useEffect(() => {
    isActive.set(active);
  }, [active, isActive]);
  const waveKey = wave?.key;
  const waveKind = wave?.kind;
  useEffect(() => {
    if (waveKey == null) return;
    gust.set(waveKind === 'genre' ? 1.6 : 1);
    flips.set(flips.get() + 1);
  }, [waveKey, waveKind, gust, flips]);

  useFrameCallback((f) => {
    if (!isActive.get() || oceanDive.get() >= 1) return;
    const dt = f.timeSincePreviousFrame ?? 16;
    acc.set(acc.get() + dt);
    if (acc.get() < FRAME_MS) return;
    const d = Math.min(acc.get(), 120) / 1000;
    acc.set(0);
    const t = clock.get() + d;
    clock.set(t);
    const g = gust.get() * Math.exp(-d / 0.9);
    gust.set(g);
    const ease = 1 - Math.exp(-d / 1.3);
    const w = wind.get() + (windTarget.get() - wind.get()) * ease;
    wind.set(w);
    rain.set(rain.get() + (rainTarget.get() - rain.get()) * ease);
    // Clouds keep moving underneath, but the sky only redraws a few times a second.
    cloudNow.set(cloudNow.get() + d * (reduced ? 0.01 : 0.035 + 0.3 * w + 0.8 * g));
    accCloud.set(accCloud.get() + d * 1000);
    if (accCloud.get() >= CLOUD_MS) {
      accCloud.set(0);
      cloud.set(cloudNow.get());
    }
    let s = sign.get();
    if (flips.get() !== lastFlip.get()) {
      lastFlip.set(flips.get());
      // A new song spins the sign and lands it on the tempo side.
      s = { ...s, n: s.n + (s.n % 2 ? 3 : 2), vel: s.vel + 3, next: t + 5 };
    }
    sign.set(reduced ? s : stepSign(s, d, t, Math.min(1, w + g * 0.45)));
    // One strike every sixteen beats of a storm song, never fast enough to strobe.
    if (storm.get() && t > nextBolt.get()) {
      flash.set(1);
      nextBolt.set(t + (16 * 60) / Math.max(60, beat.get()));
      bolt.set({ seed: Math.floor(t * 7) % 500, x: [18, width - 18, 40, width - 40, width / 2][Math.floor(t) % 5] });
    } else if (flash.get() > 0.01) flash.set(flash.get() * Math.exp(-d / 0.14));
    else if (flash.get() !== 0) flash.set(0);
  });

  const windForSock = useSharedValue(weather.wind);
  useFrameCallback(() => {
    windForSock.set(Math.min(1, wind.get() + gust.get() * 0.45));
  });

  const swellFill = useAnimatedProps(() => ({ d: swellPath(width, clock.get(), HORIZON_ABOVE * 0.45 + 26, 90) }));
  const swellLine = useAnimatedProps(() => ({ d: swellPath(width, clock.get(), HORIZON_ABOVE * 0.45 + 26, 0) }));
  const ripples = useAnimatedProps(() => ({ d: ripplesPath(width, clock.get(), 26, 20) }));
  const rainD = useAnimatedProps(() => ({ d: rain.get() < 0.04 ? 'M0 0' : rainPath(width, horizon, clock.get(), rain.get(), wind.get()) }));
  const gulls = useAnimatedProps(() => ({ d: gullsPath(width, clock.get(), horizon - 22, beat.get()) }));
  const boltD = useAnimatedProps(() => {
    const b = bolt.get();
    return { d: flash.get() < 0.02 ? 'M0 0' : boltPath(b.seed, b.x, Math.min(wordsTop, horizon - 200), horizon - 4), strokeOpacity: Math.min(1, flash.get() * 1.4) };
  });
  const twinkleA = useAnimatedProps(() => ({ opacity: starAmount * (0.55 + 0.45 * Math.sin(clock.get() * 0.9)) }));
  const twinkleB = useAnimatedProps(() => ({ opacity: starAmount * (0.55 + 0.45 * Math.sin(clock.get() * 1.3 + 2)) }));

  const zen = toHex(look.zen);
  const mid = toHex(look.mid);
  const hor = toHex(look.hor);
  const moonVis = moon.up ? Math.max(0, Math.min(1, (night - 0.3) / 0.5)) * (1 - weather.dark * 0.6) : 0;
  const islandLeft = width * 0.45 - ISLAND_WIDTH / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Shows at once, and stays if the shader can't run. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id="skyBase" x1="0" y1="0" x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={zen} />
            <Stop offset="0.6" stopColor={mid} />
            <Stop offset="1" stopColor={hor} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#skyBase)" />
      </Svg>
      <SkyCanvas width={width} height={height} horizon={horizon} lookFrom={lookFrom} lookTo={lookTo} lookT={lookT} cloud={cloud} flash={flash} />

      {night > 0.3 && (
        <Svg style={StyleSheet.absoluteFill} width={width} height={horizon}>
          <Defs>
            <RadialGradient id="moonShade" cx="42%" cy="40%" r="60%">
              <Stop offset="0" stopColor="#f6f7fb" />
              <Stop offset="1" stopColor="#d6dce8" />
            </RadialGradient>
          </Defs>
          <AnimatedG animatedProps={twinkleA}>
            <StarField width={width} height={horizon} stars={TWINKLE_A} />
          </AnimatedG>
          <AnimatedG animatedProps={twinkleB}>
            <StarField width={width} height={horizon} stars={TWINKLE_B} />
          </AnimatedG>
          {moonVis > 0.01 && <Circle cx={moon.x} cy={moon.y} r={15} fill="url(#moonShade)" opacity={moonVis} />}
        </Svg>
      )}

      {/* A haze behind the words, only as strong as this sky needs. */}
      {veil.opacity > 0.01 && (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <LinearGradient id="wordsVeil" x1="0" y1={wordsTop - 10} x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={toHex(veil.color)} stopOpacity="0" />
              <Stop offset="0.14" stopColor={toHex(veil.color)} stopOpacity={veil.opacity} />
              <Stop offset="0.86" stopColor={toHex(veil.color)} stopOpacity={veil.opacity} />
              <Stop offset="1" stopColor={toHex(veil.color)} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={wordsTop - 10} width={width} height={horizon - wordsTop + 10} fill="url(#wordsVeil)" />
        </Svg>
      )}

      <Svg style={StyleSheet.absoluteFill} width={width} height={horizon}>
        {night < 0.5 && weather.dark < 0.25 && !reduced && <AnimatedPath animatedProps={gulls} fill="none" stroke={toHex(look.shade)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.8 * (1 - night)} />}
        {weather.rain > 0.02 && !reduced && <AnimatedPath animatedProps={rainD} fill="none" stroke="#ebf2ff" strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.42} />}
        {weather.storm && !reduced && <AnimatedPath animatedProps={boltD} fill="none" stroke="#ffffff" strokeWidth={1.7} strokeLinejoin="round" />}
      </Svg>

      <SkyIsland left={islandLeft} top={headerY - ISLAND_GROUND + 4} colors={colors} clock={clock} wind={windForSock} sign={sign} front={signFront} back={signBack} />

      {/* The far water, from the horizon to behind the near wave. */}
      <Svg style={[styles.far, { top: horizon - 26 }]} width={width} height={HORIZON_ABOVE + 26 + 34} pointerEvents="none">
        <Defs>
          <LinearGradient id="farHaze" x1="0" y1="0" x2="0" y2="26" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={hor} stopOpacity="0" />
            <Stop offset="1" stopColor={hor} stopOpacity="0.55" />
          </LinearGradient>
          <LinearGradient id="farWater" x1="0" y1="26" x2="0" y2={26 + HORIZON_ABOVE + 16} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={water.far} />
            <Stop offset="1" stopColor={water.top} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={26} fill="url(#farHaze)" />
        <Rect y={26} width={width} height={HORIZON_ABOVE + 34} fill="url(#farWater)" />
        <AnimatedPath animatedProps={ripples} fill="none" stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" strokeOpacity={0.2 * (1 - night * 0.55)} />
        <AnimatedPath animatedProps={swellFill} fill="url(#farWater)" />
        <AnimatedPath animatedProps={swellLine} fill="none" stroke={water.line} strokeWidth={1} strokeOpacity={water.lineOpacity * 0.36} />
      </Svg>
    </View>
  );
}

/** The sun's or moon's light on the water, drawn over the near wave too. */
export function SeaGlitter({ width, height, surfaceY, look, hour, active }: { width: number; height: number; surfaceY: number; look: SkyLook; hour: number; active: boolean }) {
  const horizon = surfaceY - HORIZON_ABOVE;
  const sun = useMemo(() => sunAt(hour, width, horizon), [hour, width, horizon]);
  const moon = useMemo(() => moonAt(hour, width, horizon), [hour, width, horizon]);
  const source = sun.up ? sun : moon.up ? moon : null;
  const strength = (sun.up ? 0.25 + 0.75 * sun.low : 0.55 * look.day.night) * (1 - look.weather.dark * 0.8);
  const clock = useSharedValue(0);
  const acc = useSharedValue(0);
  const isActive = useSharedValue(active);
  useEffect(() => {
    isActive.set(active);
  }, [active, isActive]);
  useFrameCallback((f) => {
    if (!isActive.get() || oceanDive.get() >= 1) return;
    acc.set(acc.get() + (f.timeSincePreviousFrame ?? 16));
    if (acc.get() < 66) return;
    clock.set(clock.get() + acc.get() / 1000);
    acc.set(0);
  });
  const x = source?.x ?? 0;
  const span = height - horizon;
  const dashes = useAnimatedProps(() => ({ d: glitterPath(x, 0, span, clock.get()) }));
  if (!source || strength < 0.03 || source.y > horizon + 6) return null;
  const color = sun.up ? toHex([255, 244 - 68 * sun.low, 210 - 100 * sun.low]) : '#d6e2ff';
  return (
    <Svg style={[styles.far, { top: horizon }]} width={width} height={span} pointerEvents="none">
      <AnimatedPath animatedProps={dashes} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeOpacity={strength * 0.75} />
    </Svg>
  );
}

const styles = StyleSheet.create({ far: { position: 'absolute', left: 0 } });
