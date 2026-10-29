import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { DarkColors } from '@/constants/theme';

// A stranger's bottle opening onto Home (2026-10-29 mockups, the "Liquid" board): it lifts out of the sea to the
// middle (0–0.8 s), the glass and the cork pull evenly apart around the light (0.8–1.5 s) and hold open, still in view,
// while the light floats up into the card (1.75–2.75 s); it drops in and ripples spread; then the glass and cork drift
// off the edges. All in one timeline so every piece stays in step.

const TOTAL = 4300;
const LAND = 2750;

export type OpeningGeometry = {
  /** Where the bottle leaves the sea. */
  from: { x: number; y: number };
  /** Where it opens: the middle, between the card and the buttons. */
  stage: { x: number; y: number };
  /** The card's top-left and side, where the light lands. */
  card: { x: number; y: number; size: number };
};

const clamp = (v: number) => {
  'worklet';
  return Math.max(0, Math.min(1, v));
};
const ease = (p: number) => {
  'worklet';
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};
const back = (p: number) => {
  'worklet';
  const c = 1.5;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

/** The whole timeline at time `ms`, in screen coordinates. */
function frame(ms: number, g: OpeningGeometry) {
  'worklet';
  const p1 = clamp(ms / 800);
  const cx = g.from.x + (g.stage.x - g.from.x) * ease(p1);
  const cy = g.from.y + (g.stage.y - g.from.y) * back(p1);
  const scale = 1 + 0.45 * ease(p1);
  const L = ms - LAND;
  const drift = L > 0 ? 150 * ease(clamp(L / 1400)) : 0;
  // Mirrored by centre of mass: the glass's centre is x 49 (body 72x34 at 44, neck 18x18 at 87, by area), the cork's
  // 101, the light 44. Sliding the glass 76 and the cork 14 together puts each centre 71 from the light; the neck tip
  // (96 - 76 = 20) still clears it.
  const open = ease(clamp((ms - 800) / 700));
  const glassApart = 76 * open + drift;
  const corkApart = 14 * open + drift;
  const p3 = clamp((ms - 1750) / 1000);
  const lift = ease(p3);
  const cardX = g.card.x + g.card.size / 2;
  const cardY = g.card.y + g.card.size / 2;
  const floating = ms >= 1750;
  return {
    cx,
    cy,
    scale,
    glassApart,
    corkApart,
    L,
    partsOpacity: clamp(1 - Math.max(0, L - 500) / 900),
    lx: floating ? cardX + 10 * Math.sin(p3 * Math.PI * 2) * (1 - p3) : cx,
    ly: floating ? g.stage.y + (cardY - g.stage.y) * lift : cy,
    ls: floating ? 1.15 + 0.3 * lift : 0.55 + 0.6 * ease(p1),
    lo: L > 0 ? clamp(1 - L / 160) : 1,
  };
}

function Ring({ i, t, g, color }: { i: number; t: SharedValue<number>; g: OpeningGeometry; color: string }) {
  const style = useAnimatedStyle(() => {
    const a = t.get() - LAND - 200 * i;
    const r = Math.max(1, (8 + Math.max(0, a) * 0.15) * (g.card.size / 340));
    const s = r / 100;
    return { opacity: a < 0 ? 0 : clamp(1 - a / 1500), borderWidth: (2.4 - i * 0.6) / Math.max(s, 0.1), transform: [{ scale: s }] };
  });
  return <Animated.View style={[styles.ring, { left: g.card.size / 2 - 100, top: g.card.size / 2 - 100, borderColor: color }, style]} />;
}

export function BottleOpening({ runKey, color, geometry, onDone }: { runKey: string; color: string; geometry: OpeningGeometry; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  const done = useEffectEvent(onDone);
  useEffect(() => {
    if (reduceMotion) {
      done();
      return;
    }
    t.set(0);
    t.set(withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }, (finished) => finished && runOnJS(done)()));
    const landing = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), LAND);
    return () => clearTimeout(landing);
  }, [runKey, reduceMotion, t]);

  const glass = useAnimatedStyle(() => {
    const f = frame(t.get(), geometry);
    const gx = f.cx + (48 - 44 - f.glassApart) * f.scale;
    return { opacity: f.partsOpacity, transform: [{ translateX: gx - 48 }, { translateY: f.cy - 30 }, { scale: f.scale }] };
  });
  const cork = useAnimatedStyle(() => {
    const f = frame(t.get(), geometry);
    const kx = f.cx + (101 - 44 + f.corkApart) * f.scale;
    return { opacity: f.partsOpacity, transform: [{ translateX: kx - 7 }, { translateY: f.cy - 8 }, { scale: f.scale }] };
  });
  const light = useAnimatedStyle(() => {
    const f = frame(t.get(), geometry);
    return { opacity: f.lo, transform: [{ translateX: f.lx - 12 }, { translateY: f.ly - 12 }, { scale: f.ls }] };
  });
  const halo = useAnimatedStyle(() => {
    const f = frame(t.get(), geometry);
    return { opacity: 0.35 * f.lo, transform: [{ translateX: f.lx - 28 }, { translateY: f.ly - 28 }, { scale: f.ls }] };
  });
  if (reduceMotion) return null;
  const g = geometry;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.cardClip, { left: g.card.x, top: g.card.y, width: g.card.size, height: g.card.size }]}>
        {[0, 1, 2].map((i) => (
          <Ring key={i} i={i} t={t} g={g} color={color} />
        ))}
      </View>
      <Animated.View style={[styles.piece, { width: 96, height: 60 }, glass]}>
        <Svg width={96} height={60} viewBox="0 0 96 60">
          <Rect x={8} y={13} width={72} height={34} rx={17} fill="rgba(243,234,216,0.45)" stroke={DarkColors.background} strokeWidth={2} />
          <Rect x={78} y={21} width={18} height={18} rx={5} fill="rgba(243,234,216,0.45)" stroke={DarkColors.background} strokeWidth={2} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.piece, { width: 14, height: 16, borderRadius: 4, backgroundColor: '#b07a4a' }, cork]} />
      <Animated.View style={[styles.piece, styles.halo, { backgroundColor: color }, halo]} />
      <Animated.View style={[styles.piece, styles.light, { backgroundColor: color, shadowColor: color }, light]} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardClip: { position: 'absolute', overflow: 'hidden', borderRadius: 28 },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
  piece: { position: 'absolute', left: 0, top: 0 },
  halo: { width: 56, height: 56, borderRadius: 28 },
  light: { width: 24, height: 24, borderRadius: 12, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
});
