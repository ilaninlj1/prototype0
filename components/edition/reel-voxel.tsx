import { Blur, Circle, createPicture, Group, Image, Picture, RadialGradient, Skia, useImage, vec, type SkPaint } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { artworkUrl } from '@/lib/discovery';
import type { EditionSong, Scene } from '@/lib/edition';
import { backOut, expoOut, lerp, prog, quintOut } from '@/lib/reel-ease';
import { OR } from './reel-fx';

type Props = { song: EditionSong; scene: Scene; clock: SharedValue<number>; width: number; height: number };

const N = 12; // 144 columns, 432 faces a frame: enough to read as a field, light enough for a phone
const STEPS = 24; // color steps along the height gradient
const SHADES = [1, 0.62, 0.42]; // top, then the two visible sides

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

/**
 * The reel's voxel field, drawn by hand: a grid of columns rising with the
 * song's energy and rippling outward at its tempo, colored from navy through
 * violet and the song's key color to peach as they get taller, while the
 * camera slowly circles. A glass orb floats above holding the song's cover.
 * Paints are made once per color step and shade; faces draw back to front.
 */
export function ReelVoxel({ song, scene, clock, width: W, height: H }: Props) {
  const r = song.recipe;
  const tempo = 60 / r.beat; // the print's visual tempo, 70–140
  const energy = song.sound?.energy ?? Math.min(1, Math.max(0, (r.turbulence - 0.15) / 0.6));
  const key = r.rings[0]?.color ?? OR;

  // One paint per color step and shade, made once: faces are batched by paint.
  const paints = useMemo(() => {
    const cA = hexRgb('#171a36');
    const cM = hexRgb('#5b2a6e');
    const cB = hexRgb(key.startsWith('#') ? key : OR);
    const cC = hexRgb('#ffd6bf');
    const out: SkPaint[] = [];
    for (let s = 0; s < STEPS; s++) {
      const q = s / (STEPS - 1);
      let c = mix(cA, cM, Math.min(1, q * 1.6));
      if (q > 0.4) c = mix(c, cB, Math.min(1, (q - 0.4) * 2.2));
      if (q > 0.82) c = mix(c, cC, (q - 0.82) * 3);
      for (const shade of SHADES) {
        const p = Skia.Paint();
        p.setAntiAlias(true);
        p.setColor(Skia.Color(`rgb(${Math.round(c[0] * shade)},${Math.round(c[1] * shade)},${Math.round(c[2] * shade)})`));
        out.push(p);
      }
    }
    return out;
  }, [key]);

  // Off-scene, nothing to draw: every scene stays mounted, so this keeps the field from computing all reel long.
  const empty = useMemo(() => createPicture(() => {}, { width: 1, height: 1 }), []);
  const picture = useDerivedValue(() => {
    const t = clock.get() - scene.start;
    if (t < -0.3 || t > scene.end - scene.start + 0.3) return empty;
    return createPicture(
      (canvas) => {
        const rise = expoOut(prog(t, 0, 1.3));
        const settle = quintOut(prog(t, 0, 4));
        const a = -0.7 + t * 0.16;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const elev = lerp(0.62, 0.48, settle);
        const se = Math.sin(elev);
        const ce = Math.cos(elev);
        const scale = lerp(0.72, 1, settle) * (W / (N * 1.18));
        const cx = W / 2;
        const cy = H * 0.6;
        const half = (N - 1) / 2;
        const wave = 3.6 * (tempo / 120);
        const amp = 0.55 + 0.9 * energy;
        // Heights, then far-to-near order.
        const cols: { dx: number; dz: number; h: number; depth: number }[] = [];
        for (let x = 0; x < N; x++)
          for (let z = 0; z < N; z++) {
            const dx = x - half;
            const dz = z - half;
            const d = Math.sqrt(dx * dx + dz * dz);
            const h = ((Math.sin(d * 0.52 - t * wave) * 0.5 + 0.5) * 2.6 * amp + Math.sin(dx * 0.3 + t * 1.4) * 0.45 + 0.35) * rise + 0.05;
            cols.push({ dx, dz, h, depth: dx * sa + dz * ca });
          }
        cols.sort((p, q) => p.depth - q.depth);
        const proj = (X: number, Y: number, Z: number) => {
          const xr = X * ca - Z * sa;
          const zr = X * sa + Z * ca;
          return [cx + xr * scale, cy + (zr * se - Y * ce) * scale];
        };
        // Back to front, face by face: painter's order keeps nearer columns in front.
        const quad = (paint: number, pts: number[][]) => {
          const b = Skia.PathBuilder.Make();
          b.moveTo(pts[0][0], pts[0][1]).lineTo(pts[1][0], pts[1][1]).lineTo(pts[2][0], pts[2][1]).lineTo(pts[3][0], pts[3][1]).close();
          canvas.drawPath(b.detach(), paints[paint]);
        };
        const sx = sa > 0 ? 1 : -1; // the x-facing side that faces the camera
        const sz = ca > 0 ? 1 : -1;
        const w = 0.43;
        const sink = -1.5 - (1 - rise) * 4;
        for (const c of cols) {
          const top = sink + c.h;
          const q = Math.min(1, Math.max(0, (c.h - 0.3) / 3));
          const step = Math.min(STEPS - 1, Math.floor(q * STEPS)) * 3;
          const x0 = c.dx - w;
          const x1 = c.dx + w;
          const z0 = c.dz - w;
          const z1 = c.dz + w;
          const fx = sx > 0 ? x1 : x0;
          quad(step + 1, [proj(fx, sink, z0), proj(fx, sink, z1), proj(fx, top, z1), proj(fx, top, z0)]);
          const fz = sz > 0 ? z1 : z0;
          quad(step + 2, [proj(x0, sink, fz), proj(x1, sink, fz), proj(x1, top, fz), proj(x0, top, fz)]);
          quad(step, [proj(x0, top, z0), proj(x1, top, z0), proj(x1, top, z1), proj(x0, top, z1)]);
        }
      },
      { width: W, height: H }
    );
  });

  // The orb: pops in, bobs, holds the cover behind glass.
  const R = Math.min(W, H) * 0.16;
  const orbT = useDerivedValue(() => {
    const t = clock.get() - scene.start;
    const s = Math.max(0.001, backOut(prog(t, 0.55, 1.35)));
    return [{ translateY: Math.sin(t * 2.2) * R * 0.18 }, { scale: s }];
  });
  const cover = useImage(song.artwork ? artworkUrl(song.artwork, 600) : null);
  const ox = W / 2;
  const oy = H * 0.24;
  const clip = useMemo(() => Skia.PathBuilder.Make().addCircle(ox, oy, R).detach(), [ox, oy, R]);

  return (
    <Group>
      <Picture picture={picture} />
      <Group origin={vec(ox, oy)} transform={orbT}>
        <Circle cx={ox} cy={oy} r={R * 2.4} opacity={0.75}>
          <RadialGradient c={vec(ox, oy)} r={R * 2.4} colors={['rgba(255,140,90,0.55)', 'rgba(232,70,30,0.22)', 'rgba(232,70,30,0)']} positions={[0, 0.3, 1]} />
        </Circle>
        <Group clip={clip}>
          {cover && <Image image={cover} x={ox - R} y={oy - R} width={R * 2} height={R * 2} fit="cover" opacity={0.85} />}
          <Circle cx={ox} cy={oy} r={R}>
            <RadialGradient c={vec(ox, oy)} r={R} colors={['rgba(10,10,20,0.15)', 'rgba(10,10,20,0.05)', 'rgba(255,92,40,0.75)', 'rgba(140,174,255,0.9)']} positions={[0, 0.62, 0.9, 1]} />
          </Circle>
        </Group>
        <Circle cx={ox - R * 0.38} cy={oy - R * 0.42} r={R * 0.16} color="rgba(255,255,255,0.85)">
          <Blur blur={R * 0.08} />
        </Circle>
        <Circle cx={ox + R * 0.42} cy={oy + R * 0.3} r={R * 0.12} color="rgba(255,128,80,0.4)">
          <Blur blur={R * 0.12} />
        </Circle>
      </Group>
    </Group>
  );
}
