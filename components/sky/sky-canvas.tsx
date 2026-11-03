import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { mixVector } from '@/lib/home-sky-motion';

// The sky and its clouds, one shader. Clouds are soft and slow, so this canvas is small and stretched to fill the
// screen, and it only redraws when the wind has moved them (see home-sky.tsx). That keeps it cheap on a phone.

const K = 2.5;

const effect = Skia.RuntimeEffect.Make(`
uniform float uK;
uniform float uW;
uniform float uHor;
uniform float3 uZen;
uniform float3 uMid;
uniform float3 uHorz;
uniform float3 uLit;
uniform float3 uShade;
uniform float uCover;
uniform float uSoft;
uniform float2 uSun;
uniform float uSunVis;
uniform float uSunLow;
uniform float2 uMoon;
uniform float uMoonVis;
uniform float2 uOff;
uniform float uFlash;

float h(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + float2(1.0, 0.0)), f.x), mix(h(i + float2(0.0, 1.0)), h(i + float2(1.0, 1.0)), f.x), f.y);
}
float fbm(float2 p) {
  float a = 0.5;
  float v = 0.0;
  for (int i = 0; i < 5; i++) {
    v += a * n(p);
    p = float2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y) + float2(0.13, 0.07);
    a *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float2 p = xy * uK;
  float t = clamp(p.y / uHor, 0.0, 1.0);
  float3 zm = mix(uZen, uMid, 0.6);
  float3 mh = mix(uMid, uHorz, 0.75);
  float3 c;
  if (t < 0.3) c = mix(uZen, zm, t / 0.3);
  else if (t < 0.6) c = mix(zm, uMid, (t - 0.3) / 0.3);
  else if (t < 0.86) c = mix(uMid, mh, (t - 0.6) / 0.26);
  else c = mix(mh, uHorz, (t - 0.86) / 0.14);

  // The sun: a wide glow, then its disc.
  float3 warm = mix(float3(1.0, 0.965, 0.84), float3(1.0, 0.63, 0.36), uSunLow);
  float ds = length(p - uSun);
  float glow = uSunVis * (0.72 * exp(-ds / 34.0) + 0.24 * exp(-ds / 105.0));
  c = 1.0 - (1.0 - c) * (1.0 - warm * glow);
  float r = mix(19.0, 27.0, uSunLow);
  c = mix(c, float3(1.0, 0.99, 0.93), uSunVis * smoothstep(r, r * 0.45, ds));

  // The moon's glow. Its disc is drawn sharp in home-sky.tsx.
  float dm = length(p - uMoon);
  c = 1.0 - (1.0 - c) * (1.0 - float3(0.82, 0.88, 1.0) * uMoonVis * 0.42 * exp(-dm / 42.0));

  // Clouds on a plane overhead, so they close up toward the horizon.
  float hh = (uHor - p.y) / uHor;
  if (hh > 0.0) {
    float z = 1.0 / (hh + 0.6);
    float2 q = float2((p.x / uW - 0.5) * z * 1.7, z * 4.5) * 2.1 + uOff;
    float d = fbm(q + 0.35 * float2(fbm(q * 0.7 + 3.1), 0.0));
    float thr = mix(0.74, 0.3, uCover);
    float a = smoothstep(thr, thr + uSoft, d) * smoothstep(0.01, 0.2, hh);
    float2 to = normalize(uSun - p + float2(0.001, 0.001));
    float d2 = fbm(q + float2(to.x, -to.y) * 0.22);
    float lit = clamp(0.74 + (d - d2) * 2.8, 0.0, 1.0);
    float3 col = mix(uShade, uLit, lit);
    col += uLit * 0.35 * a * (1.0 - a) * 4.0 * exp(-ds / 160.0) * uSunVis;
    col += float3(0.9, 0.92, 1.0) * uFlash * a * 0.5;
    c = mix(c, col, a);
  }
  return half4(c, 1.0);
}
`);

export type SkyCanvasProps = {
  width: number;
  height: number;
  horizon: number;
  lookFrom: SharedValue<number[]>;
  lookTo: SharedValue<number[]>;
  lookT: SharedValue<number>;
  /** How far the wind has blown the clouds. */
  cloud: SharedValue<number>;
  flash: SharedValue<number>;
};

export default function SkyCanvas({ width, height, horizon, lookFrom, lookTo, lookT, cloud, flash }: SkyCanvasProps) {
  const uniforms = useDerivedValue(() => {
    const v = mixVector(lookFrom.get(), lookTo.get(), lookT.get());
    const off = cloud.get();
    return {
      uK: K,
      uW: width,
      uHor: horizon,
      uZen: [v[0], v[1], v[2]],
      uMid: [v[3], v[4], v[5]],
      uHorz: [v[6], v[7], v[8]],
      uLit: [v[9], v[10], v[11]],
      uShade: [v[12], v[13], v[14]],
      uCover: v[15],
      uSoft: v[16],
      uSun: [v[17], v[18]],
      uSunVis: v[19],
      uSunLow: v[20],
      uMoon: [v[21], v[22]],
      uMoonVis: v[23],
      uOff: [off * 0.42, off * 0.06],
      uFlash: flash.get(),
    };
  });
  if (!effect) return null;
  const w = width / K;
  const h = height / K;
  return (
    <View style={[styles.stretch, { width: w, height: h, left: (width - w) / 2, top: (height - h) / 2, transform: [{ scale: K }] }]} pointerEvents="none">
      {/* The web's Canvas passes its style straight to a div, so it only gets a plain size. */}
      <Canvas style={{ width: w, height: h }}>
        <Fill>
          <Shader source={effect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({ stretch: { position: 'absolute' } });
