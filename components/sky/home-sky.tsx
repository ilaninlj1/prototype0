import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { oceanDive } from '@/components/ocean/dive-gesture';
import { lazySkia } from '@/components/print/lazy-skia';
import { useEasedWater } from '@/hooks/use-eased-water';
import { SKY_FADE_MS, islandColors, lookVector, moonAt, sunAt, toHex, wordsVeil, type MatchedWater, type SkyLook } from '@/lib/home-sky';
import { boltPath, glitterPath, gullsPath, mixVector, rainPath, ripplesPath, stepSign, swellPath, type SignState } from '@/lib/home-sky-motion';

import { ISLAND_GROUND, ISLAND_WIDTH, SkyIsland } from './sky-island';
import type { SkyCanvasProps } from './sky-canvas';

const SkyCanvas = lazySkia<SkyCanvasProps>(() => import('./sky-canvas'));

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The far water starts this far above the near wave, which stays exactly where it was. */
export const HORIZON_ABOVE = 44;
/** Clouds redraw this often. They're slow, and it's the costly part. */
const CLOUD_MS = 50;
/** Everything else on the sky: the sock, the sign, the far water, rain. */
const FRAME_MS = 32;
const GULL_STRIP = 70;
const TWINKLE_A = Array.from({ length: 45 }, (_, i) => star(i, 1));
const TWINKLE_B = Array.from({ length: 45 }, (_, i) => star(i, 7));

function star(i: number, salt: number) {
  const u = (n: number) => Math.abs((Math.sin((i + salt) * n) * 43758.5453) % 1);
  return { x: u(12.9898), y: u(78.233), r: 0.5 + u(39.425) * 1 };
}

const StarField = memo(function StarField({ width, height, stars }: { width: number; height: number; stars: { x: number; y: number; r: number }[] }) {
  return (
    <Svg width={width} height={height}>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x * width} cy={s.y * (height - 30)} r={s.r} fill="#fffaeb" />
      ))}
    </Svg>
  );
});

/** Two screens of rain, drawn once, that slide down and wrap around. */
const RainSheet = memo(function RainSheet({ width, height, d, opacity, flip = false }: { width: number; height: number; d: string; opacity: number; flip?: boolean }) {
  return (
    <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Svg width={width} height={height}>
        <Path d={d} fill="none" stroke="#ebf2ff" strokeWidth={1.2} strokeLinecap="round" strokeOpacity={opacity} />
      </Svg>
      <Svg width={width} height={height}>
        <Path d={d} fill="none" stroke="#ebf2ff" strokeWidth={1.2} strokeLinecap="round" strokeOpacity={opacity} />
      </Svg>
    </View>
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
  /** Show the frame rate, for checking on a phone. */
  showFps: boolean;
};

/** Behind Home: the sky, stars and moon, the weather, the island, and the far water that runs back to the horizon. */
export function HomeSky({ width, height, surfaceY, headerY, wordsTop, hour, look, water, wordsDark, tempo, wave, signFront, signBack, active, showFps }: HomeSkyProps) {
  const horizon = surfaceY - HORIZON_ABOVE;
  const reduced = useReducedMotion();
  const weather = look.weather;
  const sun = useMemo(() => sunAt(hour, width, horizon), [hour, width, horizon]);
  // Stops short of the row of buttons: a bright moon behind the genre button washes out its word.
  const moon = useMemo(() => moonAt(hour, width, horizon, Math.max(18, headerY - 40)), [hour, width, horizon, headerY]);
  const vector = useMemo(() => lookVector(look, sun, moon), [look, sun, moon]);
  const colors = useMemo(() => islandColors(look), [look]);
  const veil = useMemo(() => wordsVeil(look, wordsDark), [look, wordsDark]);
  const night = look.day.night;
  // Stars and the moon sit over the sky's canvas, so cloud thins them instead of covering them.
  const starAmount = Math.max(0, Math.min(1, (night - 0.45) / 0.5)) * (1 - weather.dark * 0.8) * Math.max(0, 1 - weather.cover * 1.1);

  const lookFrom = useSharedValue(vector);
  const lookTo = useSharedValue(vector);
  const lookT = useSharedValue(1);
  useEffect(() => {
    // From where the sky is right now, so a new song in the middle of a fade doesn't make it jump.
    lookFrom.set(mixVector(lookFrom.get(), lookTo.get(), lookT.get()));
    lookTo.set(vector);
    lookT.set(0);
    lookT.set(withTiming(1, { duration: reduced ? 0 : SKY_FADE_MS }));
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
  const rainD = useMemo(() => rainPath(width, horizon, 0, 1, weather.wind), [width, horizon, weather.wind]);
  const rainNear = useAnimatedStyle(() => ({ opacity: Math.min(1, rain.get() * 1.6), transform: [{ translateY: (clock.get() * 430) % horizon }] }));
  const rainFar = useAnimatedStyle(() => ({ opacity: Math.min(1, rain.get() * 1.1), transform: [{ translateY: ((clock.get() * 290 + horizon * 0.4) % horizon) }] }));
  const gulls = useAnimatedProps(() => ({ d: gullsPath(width, clock.get(), GULL_STRIP - 22, beat.get()) }));
  const boltD = useAnimatedProps(() => {
    const b = bolt.get();
    return { d: flash.get() < 0.02 ? 'M0 0' : boltPath(b.seed, b.x, Math.min(wordsTop, horizon - 200), horizon - 4), strokeOpacity: Math.min(1, flash.get() * 1.4) };
  });
  const starsNow = useSharedValue(starAmount);
  useEffect(() => {
    starsNow.set(withTiming(starAmount, { duration: reduced ? 0 : SKY_FADE_MS }));
  }, [starAmount, starsNow, reduced]);
  const twinkleA = useAnimatedStyle(() => ({ opacity: starsNow.get() * (0.55 + 0.45 * Math.sin(clock.get() * 0.9)) }));
  const twinkleB = useAnimatedStyle(() => ({ opacity: starsNow.get() * (0.55 + 0.45 * Math.sin(clock.get() * 1.3 + 2)) }));

  const zen = toHex(look.zen);
  const mid = toHex(look.mid);
  const hor = toHex(look.hor);
  const moonVis = moon.up ? Math.max(0, Math.min(1, (night - 0.3) / 0.5)) * (1 - weather.dark * 0.6) * (1 - weather.cover * 0.5) : 0;
  const islandLeft = width * 0.45 - ISLAND_WIDTH / 2;
  // The far water, the haze and what's in the air all fade with the sky too.
  const far = useEasedWater({ far: water.far, top: water.top, line: water.line, lineOpacity: water.lineOpacity, hor });
  const moonNow = useSharedValue(moonVis);
  const veilNow = useSharedValue(veil.opacity);
  const gullsOn = night < 0.5 && weather.dark < 0.25 && !reduced;
  const gullsNow = useSharedValue(gullsOn ? 1 : 0);
  useEffect(() => {
    const duration = reduced ? 0 : SKY_FADE_MS;
    moonNow.set(withTiming(moonVis, { duration }));
    veilNow.set(withTiming(veil.opacity, { duration }));
    gullsNow.set(withTiming(gullsOn ? 1 : 0, { duration }));
  }, [moonVis, veil.opacity, gullsOn, moonNow, veilNow, gullsNow, reduced]);
  const moonStyle = useAnimatedStyle(() => ({ opacity: moonNow.get() }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veilNow.get() }));
  const gullStyle = useAnimatedStyle(() => ({ opacity: gullsNow.get() }));
  // Rain stays mounted until it has finished easing away, so it thins out instead of stopping dead.
  const rainWanted = weather.rain > 0.02 && !reduced;
  const [rainUp, setRainUp] = useState(rainWanted);
  useEffect(() => {
    if (rainWanted) {
      setRainUp(true);
      return;
    }
    const id = setTimeout(() => setRainUp(false), 4000);
    return () => clearTimeout(id);
  }, [rainWanted]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Shows at once, and stays if the shader can't run. */}
      <View style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="skyBase" x1="0" y1="0" x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={zen} />
            <Stop offset="0.6" stopColor={mid} />
            <Stop offset="1" stopColor={hor} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#skyBase)" />
      </Svg>
      </View>
      <SkyCanvas width={width} height={height} horizon={horizon} lookFrom={lookFrom} lookTo={lookTo} lookT={lookT} cloud={cloud} flash={flash} />

      {night > 0.3 && (
        <>
          {/* Finished pictures that only fade, so twinkling doesn't redraw the sky. */}
          <Animated.View style={[StyleSheet.absoluteFill, twinkleA]}>
            <StarField width={width} height={horizon} stars={TWINKLE_A} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, twinkleB]}>
            <StarField width={width} height={horizon} stars={TWINKLE_B} />
          </Animated.View>
          {moon.up && (
            <Animated.View style={[StyleSheet.absoluteFill, moonStyle]}>
              <Svg width={width} height={horizon}>
                <Defs>
                  <RadialGradient id="moonShade" cx="42%" cy="40%" r="60%">
                    <Stop offset="0" stopColor="#f6f7fb" />
                    <Stop offset="1" stopColor="#d6dce8" />
                  </RadialGradient>
                </Defs>
                <Circle cx={moon.x} cy={moon.y} r={15} fill="url(#moonShade)" />
              </Svg>
            </Animated.View>
          )}
        </>
      )}

      {/* A haze behind the words, only as strong as this sky needs. */}
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="wordsVeil" x1="0" y1={wordsTop - 10} x2="0" y2={horizon} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={toHex(veil.color)} stopOpacity="0" />
              <Stop offset="0.14" stopColor={toHex(veil.color)} stopOpacity="1" />
              <Stop offset="0.86" stopColor={toHex(veil.color)} stopOpacity="1" />
              <Stop offset="1" stopColor={toHex(veil.color)} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={wordsTop - 10} width={width} height={horizon - wordsTop + 10} fill="url(#wordsVeil)" />
        </Svg>
      </Animated.View>

      {rainUp && (
        <View style={[styles.rainClip, { width, height: horizon }]}>
          <Animated.View style={[styles.rainSheet, { top: -horizon }, rainFar]}>
            <RainSheet width={width} height={horizon} d={rainD} opacity={0.24} />
          </Animated.View>
          <Animated.View style={[styles.rainSheet, { top: -horizon }, rainNear]}>
            <RainSheet width={width} height={horizon} d={rainD} opacity={0.42} flip />
          </Animated.View>
        </View>
      )}
      {night < 0.5 && !reduced && (
        <Animated.View style={[styles.far, { top: horizon - GULL_STRIP }, gullStyle]}>
          <Svg width={width} height={GULL_STRIP}>
            <AnimatedPath animatedProps={gulls} fill="none" stroke={toHex(look.shade)} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.8 * (1 - night)} />
          </Svg>
        </Animated.View>
      )}
      {weather.storm && !reduced && (
        <View style={StyleSheet.absoluteFill}>
          <Svg width={width} height={horizon}>
            <AnimatedPath animatedProps={boltD} fill="none" stroke="#ffffff" strokeWidth={1.7} strokeLinejoin="round" />
          </Svg>
        </View>
      )}

      <SkyIsland left={islandLeft} top={headerY - ISLAND_GROUND + 4} colors={colors} clock={clock} wind={windForSock} sign={sign} front={signFront} back={signBack} />

      {/* The far water, from the horizon to behind the near wave. */}
      <View style={[styles.far, { top: horizon - 26 }]}>
      <Svg width={width} height={HORIZON_ABOVE + 26 + 34}>
        <Defs>
          <LinearGradient id="farHaze" x1="0" y1="0" x2="0" y2="26" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={far.hor} stopOpacity="0" />
            <Stop offset="1" stopColor={far.hor} stopOpacity="0.55" />
          </LinearGradient>
          <LinearGradient id="farWater" x1="0" y1="26" x2="0" y2={26 + HORIZON_ABOVE + 16} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={far.far} />
            <Stop offset="1" stopColor={far.top} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={26} fill="url(#farHaze)" />
        <Rect y={26} width={width} height={HORIZON_ABOVE + 34} fill="url(#farWater)" />
        <AnimatedPath animatedProps={ripples} fill="none" stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" strokeOpacity={0.2 * (1 - night * 0.55)} />
        <AnimatedPath animatedProps={swellFill} fill="url(#farWater)" />
        <AnimatedPath animatedProps={swellLine} fill="none" stroke={far.line} strokeWidth={1} strokeOpacity={far.lineOpacity * 0.36} />
      </Svg>
      </View>
      {showFps && <SkyFps top={headerY - 48} />}
    </View>
  );
}

/** Frames per second and the worst frame in the last second, for checking on a phone with Tune → Test sky. */
function SkyFps({ top }: { top: number }) {
  const [text, setText] = useState('…');
  const frames = useSharedValue(0);
  const worst = useSharedValue(0);
  const elapsed = useSharedValue(0);
  useFrameCallback((f) => {
    const dt = f.timeSincePreviousFrame ?? 16;
    frames.set(frames.get() + 1);
    worst.set(Math.max(worst.get(), dt));
    elapsed.set(elapsed.get() + dt);
    if (elapsed.get() >= 1000) {
      runOnJS(setText)(`${Math.round((frames.get() * 1000) / elapsed.get())} fps · worst ${Math.round(worst.get())} ms`);
      frames.set(0);
      worst.set(0);
      elapsed.set(0);
    }
  });
  return (
    <View style={[styles.fps, { top }]}>
      <Text style={styles.fpsText}>{text}</Text>
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
  const lightNow = useSharedValue(strength);
  useEffect(() => {
    lightNow.set(withTiming(strength, { duration: SKY_FADE_MS }));
  }, [strength, lightNow]);
  const lightStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, lightNow.get() * 0.75)) }));
  if (!source || source.y > horizon + 6) return null;
  const color = sun.up ? toHex([255, 244 - 68 * sun.low, 210 - 100 * sun.low]) : '#d6e2ff';
  return (
    <Animated.View style={[styles.far, { top: horizon }, lightStyle]} pointerEvents="none">
      <Svg width={width} height={span}>
        <AnimatedPath animatedProps={dashes} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  far: { position: 'absolute', left: 0 },
  rainClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  rainSheet: { position: 'absolute', left: 0 },
  fps: { position: 'absolute', left: 16, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  fpsText: { color: '#ffffff', fontSize: 11, fontVariant: ['tabular-nums'] },
});
