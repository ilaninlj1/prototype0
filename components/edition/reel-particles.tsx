import { createPicture, Picture, Rect, Skia, Text } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { SCENE, type EditionSong, type Scene } from '@/lib/edition';
import { expoInOut, expoOut, lerp, prog, quintOut } from '@/lib/reel-ease';
import { advance, fontOf, type ReelTypefaces } from './reel-type';

type Props = { song: EditionSong; scene: Scene; clock: SharedValue<number>; width: number; height: number; type: ReelTypefaces };

const NP = 900;
const TRAIL = 5; // positions kept per particle: the streak each one leaves

/**
 * The reel's particle scene: a flow field of streaks, then order. They drift
 * at a speed set by the song's energy and gather into two counter-rotating
 * rings turning at its tempo (a minor key pulls the inner ring tighter).
 */
export function ReelParticles({ song, scene, clock, width: W, height: H, type }: Props) {
  const tempo = 60 / song.recipe.beat;
  const energy = song.sound?.energy ?? Math.min(1, Math.max(0, (song.recipe.turbulence - 0.15) / 0.6));
  const ratio = song.sound?.mode === 0 ? 0.5 : 0.62;

  // Fixed per-particle traits, from the song's id so a replay looks the same.
  const traits = useMemo(() => makeTraits(song.trackId, W, H), [song.trackId, W, H]);

  // Free positions (integrated through the field) and drawn positions (pulled toward the rings), with their trails.
  const sim = useSharedValue<{ fr: number[]; dr: number[] }>({
    fr: traits.start.filter((_, i) => i % (TRAIL * 2) < 2),
    dr: traits.start.slice(),
  });
  const tick = useSharedValue(0);

  useFrameCallback((f) => {
    const t = clock.get() - scene.start;
    if (t < -0.4 || t > SCENE + 0.4) return;
    const st = Math.min(f.timeSincePreviousFrame ?? 16, 50) / 16.7;
    const col = expoInOut(prog(t, 2.2, 3.4));
    const R = Math.min(W, H) * 0.3;
    const cx = W / 2;
    const cy = H / 2;
    const rot = t * 0.9 * (tempo / 120);
    const pace = 0.7 + 0.6 * energy;
    const fx = 0.0023 * (1400 / W);
    const fy = 0.003 * (1400 / W);
    const fd = 0.0016 * (1400 / W);
    sim.modify((state) => {
      'worklet';
      const fr = state.fr;
      const dr = state.dr;
      for (let i = 0; i < NP; i++) {
        const sp = traits.out[i * 4];
        const j = traits.out[i * 4 + 2];
        const inner = traits.out[i * 4 + 3] === 1;
        let x = fr[i * 2];
        let y = fr[i * 2 + 1];
        const a = Math.sin(x * fx + t * 0.5) * 1.9 + Math.cos(y * fy - t * 0.4) * 1.9 + Math.sin((x - y) * fd + t * 0.3) * 1.3;
        x += Math.cos(a) * sp * st * 1.6 * pace;
        y += Math.sin(a) * sp * st * 1.6 * pace;
        if (x < -20) x += W + 40;
        if (x > W + 20) x -= W + 40;
        if (y < -20) y += H + 40;
        if (y > H + 20) y -= H + 40;
        fr[i * 2] = x;
        fr[i * 2 + 1] = y;
        let nx = x;
        let ny = y;
        if (col > 0) {
          const dots = inner ? 60 : 120;
          const di = i % dots;
          const ang = (di / dots) * Math.PI * 2 * (inner ? -1 : 1) + (inner ? -rot * 1.4 : rot) + j * 0.012;
          const rr = (inner ? R * ratio : R) + j * 4;
          nx = lerp(x, cx + Math.cos(ang) * rr, col);
          ny = lerp(y, cy + Math.sin(ang) * rr, col);
        }
        const base = i * TRAIL * 2;
        for (let k = TRAIL - 1; k > 0; k--) {
          dr[base + k * 2] = dr[base + (k - 1) * 2];
          dr[base + k * 2 + 1] = dr[base + (k - 1) * 2 + 1];
        }
        dr[base] = nx;
        dr[base + 1] = ny;
      }
      return state;
    });
    tick.set(tick.get() + 1);
  });

  const paints = useMemo(() => {
    const white = Skia.Paint();
    white.setStyle(1);
    white.setStrokeWidth(1.1);
    white.setStrokeCap(1); // round: a particle standing still still shows, as a dot
    white.setAntiAlias(true);
    white.setColor(Skia.Color('rgba(244,241,236,0.32)'));
    const orange = Skia.Paint();
    orange.setStyle(1);
    orange.setStrokeWidth(1.1);
    orange.setStrokeCap(1);
    orange.setAntiAlias(true);
    orange.setColor(Skia.Color('rgba(232,70,30,0.75)'));
    return { white, orange };
  }, []);

  const empty = useMemo(() => createPicture(() => {}, { width: 1, height: 1 }), []);
  const picture = useDerivedValue(() => {
    tick.get();
    const t = clock.get() - scene.start;
    if (t < -0.3 || t > SCENE + 0.3) return empty;
    const intro = prog(t, 0, 0.4);
    const dr = sim.get().dr;
    return createPicture(
      (canvas) => {
        const w = Skia.PathBuilder.Make();
        const o = Skia.PathBuilder.Make();
        for (let i = 0; i < NP; i++) {
          const b = traits.out[i * 4 + 1] === 1 ? o : w;
          const base = i * TRAIL * 2;
          b.moveTo(dr[base], dr[base + 1]);
          for (let k = 1; k < TRAIL; k++) {
            const x = dr[base + k * 2];
            const y = dr[base + k * 2 + 1];
            // A wrap jump isn't a streak.
            if (Math.abs(x - dr[base + (k - 1) * 2]) > 80 || Math.abs(y - dr[base + (k - 1) * 2 + 1]) > 80) break;
            b.lineTo(x, y);
          }
        }
        paints.white.setAlphaf(0.32 * intro);
        paints.orange.setAlphaf(0.75 * intro);
        canvas.drawPath(w.detach(), paints.white);
        canvas.drawPath(o.detach(), paints.orange);
      },
      { width: W, height: H }
    );
  });

  const head = useMemo(() => {
    const big = fontOf(type.black, Math.min(W * 0.1, 56));
    const mono = fontOf(type.mono, 10);
    return { big, mono, w: advance(big, 'BLIND → FOUND') };
  }, [W, type]);
  const textOpacity = useDerivedValue(() => expoOut(prog(clock.get() - scene.start, 3.2, 3.8)));
  const count = useDerivedValue(
    () => `${Math.round(NP * quintOut(prog(clock.get() - scene.start, 3.2, 4.1))).toLocaleString('en-US')} PARTICLES`
  );
  const countX = useDerivedValue(() => W / 2 - advance(head.mono, count.get()) / 2);

  return (
    <>
      <Rect x={0} y={0} width={W} height={H} color="#08080a" />
      <Picture picture={picture} />
      <Text x={(W - head.w) / 2} y={H / 2 + 8} text="BLIND → FOUND" font={head.big} color="#F4F1EC" opacity={textOpacity} />
      <Text x={countX} y={H / 2 + 30} text={count} font={head.mono} color="rgba(244,241,236,0.6)" opacity={textOpacity} />
    </>
  );
}

/** Each particle's speed, color, jitter and ring (sp, orange, jitter, inner) and its start, seeded by the song. */
function makeTraits(trackId: number, W: number, H: number) {
  let s = (trackId % 2147483646) + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: number[] = [];
  const start: number[] = [];
  for (let i = 0; i < NP; i++) {
    out.push(0.6 + rnd() * 1.6, rnd() < 0.16 ? 1 : 0, rnd() - 0.5, rnd() < 0.28 ? 1 : 0);
    const x = rnd() * W;
    const y = rnd() * H;
    for (let k = 0; k < TRAIL; k++) start.push(x, y);
  }
  return { out, start };
}
