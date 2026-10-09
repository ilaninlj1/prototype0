import { Canvas, Circle, DashPathEffect, Group, Image, Path, RadialGradient, Rect, Skia, useImage, vec } from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { drawParticles } from '@/components/print/live-print-canvas';
import { stillPaths, strokeFor } from '@/components/print/print-still-canvas';
import { Colors } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { timeline, type Edition, type EditionSong, type Scene } from '@/lib/edition';

const GROUND = '#0d1426';
const FADE = 0.35; // seconds each scene fades in and out over

export type EditionCanvasProps = { edition: Edition; width: number; height: number; clock: SharedValue<number> };

/**
 * The Edition's picture: every scene stacked, each faded in only while its
 * slice of the clock is playing. Scenes take their look from the song's
 * print recipe (key → formation and color, energy → height and density,
 * tempo → breathing). Load it through edition-view.tsx (Skia on web).
 */
export default function EditionCanvas({ edition, width, height, clock }: EditionCanvasProps) {
  const scenes = useMemo(() => timeline(edition), [edition]);
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height} color={GROUND} />
      {scenes.map((scene, i) => (
        <SceneLayer key={i} scene={scene} clock={clock}>
          {scene.kind === 'intro' ? (
            <Intro width={width} height={height} clock={clock} scene={scene} />
          ) : scene.kind === 'lockup' ? (
            <Lockup songs={edition.songs} width={width} height={height} clock={clock} scene={scene} />
          ) : (
            <SongScene song={edition.songs[scene.song!]} scene={scene} width={width} height={height} clock={clock} />
          )}
        </SceneLayer>
      ))}
    </Canvas>
  );
}

function SceneLayer({ scene, clock, children }: { scene: Scene; clock: SharedValue<number>; children: ReactNode }) {
  const opacity = useDerivedValue(() => {
    const t = clock.get();
    const fadeIn = Math.min(1, Math.max(0, (t - scene.start) / FADE + 1));
    const fadeOut = scene.kind === 'lockup' ? 1 : Math.min(1, Math.max(0, (scene.end - t) / FADE));
    return t < scene.start - FADE || t > scene.end + FADE ? 0 : Math.min(fadeIn, fadeOut);
  });
  return <Group opacity={opacity}>{children}</Group>;
}

/** A blueprint grid drawing itself in, the way the reel opens. */
function Intro({ width, height, clock, scene }: { width: number; height: number; clock: SharedValue<number>; scene: Scene }) {
  const grid = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    const step = width / 8;
    for (let x = step; x < width; x += step) b.moveTo(x, 0).lineTo(x, height);
    for (let y = step; y < height; y += step) b.moveTo(0, y).lineTo(width, y);
    return b.detach();
  }, [width, height]);
  const end = useDerivedValue(() => Math.min(1, Math.max(0, (clock.get() - scene.start) / (scene.end - scene.start - 0.4))));
  const scan = useDerivedValue(() => ((clock.get() - scene.start) / (scene.end - scene.start)) * height);
  return (
    <Group>
      <Path path={grid} color={Colors.text} opacity={0.12} style="stroke" strokeWidth={1} start={0} end={end} />
      <Rect x={0} y={scan} width={width} height={1} color={Colors.signal} opacity={0.6} />
    </Group>
  );
}

function SongScene(props: { song: EditionSong; scene: Scene; width: number; height: number; clock: SharedValue<number> }) {
  switch (props.scene.kind) {
    case 'flow':
      return <Flow {...props} />;
    case 'terrain':
      return <Terrain {...props} />;
    case 'orbit':
      return <Orbit {...props} />;
    default:
      return <Orb {...props} />;
  }
}

/** Particles flowing loose, then gathering into the song's rings. */
function Flow({ song, scene, width, height, clock }: { song: EditionSong; scene: Scene; width: number; height: number; clock: SharedValue<number> }) {
  const size = Math.min(width, height) * 0.92;
  const r = song.recipe;
  const gather = useDerivedValue(() => Math.min(1, Math.max(0, ((clock.get() - scene.start) / (scene.end - scene.start)) * 1.5 - 0.25)));
  const p0 = useDerivedValue(() => drawParticles(r, 0, size, clock.get() - scene.start, gather.get(), 0, 0));
  const p1 = useDerivedValue(() => drawParticles(r, 1, size, clock.get() - scene.start, gather.get(), 0, 0));
  const p2 = useDerivedValue(() => drawParticles(r, 2, size, clock.get() - scene.start, gather.get(), 0, 0));
  const grain = r.texture === 'grain';
  return (
    <Group transform={[{ translateX: (width - size) / 2 }, { translateY: (height - size) / 2 }]}>
      {[p0, p1, p2].map((p, i) =>
        r.rings[i] ? <Path key={i} path={p} color={r.rings[i].color} style={grain ? 'fill' : 'stroke'} strokeWidth={Math.max(1, size / 200)} strokeCap="round" /> : null
      )}
    </Group>
  );
}

const CELLS = 14;

/** An isometric field that rises with the song's energy and breathes at its tempo. */
function Terrain({ song, scene, width, height, clock }: { song: EditionSong; scene: Scene; width: number; height: number; clock: SharedValue<number> }) {
  const r = song.recipe;
  const color = r.rings[0]?.color ?? r.ink;
  const lift = height * (0.06 + 0.16 * Math.min(1, r.turbulence));
  const cw = (width * 0.86) / CELLS;
  const ox = width / 2;
  const oy = height * 0.36;
  const tops = useDerivedValue(() => terrain(r.seed, r.beat, clock.get() - scene.start, cw, ox, oy, lift, true));
  const stems = useDerivedValue(() => terrain(r.seed, r.beat, clock.get() - scene.start, cw, ox, oy, lift, false));
  return (
    <Group>
      <Path path={stems} color={Colors.text} opacity={0.18} style="stroke" strokeWidth={1} />
      <Path path={tops} color={color} opacity={0.85} style="stroke" strokeWidth={1.2} />
    </Group>
  );
}

function terrain(seed: number, beat: number, t: number, cw: number, ox: number, oy: number, lift: number, tops: boolean) {
  'worklet';
  const b = Skia.PathBuilder.Make();
  const ph = (seed % 97) / 15;
  for (let gy = 0; gy < CELLS; gy++)
    for (let gx = 0; gx < CELLS; gx++) {
      const wave = 0.5 + 0.5 * Math.sin(gx * 0.7 + gy * 0.45 + ph + (t * 2 * Math.PI) / beat);
      const ridge = 0.5 + 0.5 * Math.sin(gx * 0.31 - gy * 0.52 + ph * 2 + t * 0.4);
      const h = lift * wave * ridge;
      const x = ox + (gx - gy) * cw * 0.5;
      const y = oy + (gx + gy) * cw * 0.28;
      if (tops) {
        const s = cw * 0.42;
        b.moveTo(x, y - h - s * 0.56)
          .lineTo(x + s, y - h)
          .lineTo(x, y - h + s * 0.56)
          .lineTo(x - s, y - h)
          .close();
      } else {
        b.moveTo(x, y).lineTo(x, y - h);
      }
    }
  return b.detach();
}

/** The circle-of-fifths dial: twelve spokes, the song's rings turning on it, the tonic breathing with the tempo. */
function Orbit({ song, scene, width, height, clock }: { song: EditionSong; scene: Scene; width: number; height: number; clock: SharedValue<number> }) {
  const r = song.recipe;
  const size = Math.min(width, height) * 0.9;
  const cx = width / 2;
  const cy = height / 2;
  const spokes = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI - Math.PI / 2;
      b.moveTo(cx + Math.cos(a) * size * 0.12, cy + Math.sin(a) * size * 0.12).lineTo(cx + Math.cos(a) * size * 0.48, cy + Math.sin(a) * size * 0.48);
    }
    return b.detach();
  }, [cx, cy, size]);
  const spin = useDerivedValue(() => [{ rotate: (clock.get() - scene.start) * 0.18 }]);
  const breath = useDerivedValue(() => 1 + 0.06 * Math.sin(((clock.get() - scene.start) * 2 * Math.PI) / r.beat));
  return (
    <Group>
      <Path path={spokes} color={Colors.text} opacity={0.16} style="stroke" strokeWidth={1} />
      <Group origin={vec(cx, cy)} transform={spin}>
        {r.rings.map((ring, i) => (
          <RingCircle key={i} cx={cx + (ring.cx - 0.5) * size * 1.6} cy={cy + (ring.cy - 0.5) * size * 1.6} r={ring.radius * size * 0.7} color={ring.color} breath={i === 0 ? breath : undefined} />
        ))}
      </Group>
    </Group>
  );
}

function RingCircle({ cx, cy, r, color, breath }: { cx: number; cy: number; r: number; color: string; breath?: SharedValue<number> }) {
  const radius = useDerivedValue(() => r * (breath ? breath.get() : 1));
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={radius} color={color} style="stroke" strokeWidth={2} />
      <Circle cx={cx} cy={cy} r={radius} color={color} style="stroke" strokeWidth={1} opacity={0.35}>
        <DashPathEffect intervals={[2, 6]} />
      </Circle>
    </Group>
  );
}

/** The cover held in a glass orb, ringed by the song's colors. */
function Orb({ song, scene, width, height, clock }: { song: EditionSong; scene: Scene; width: number; height: number; clock: SharedValue<number> }) {
  const image = useImage(song.artwork ? artworkUrl(song.artwork, 600) : null);
  const R = Math.min(width, height) * 0.3;
  const cx = width / 2;
  const cy = height / 2;
  const clip = useMemo(() => Skia.PathBuilder.Make().addCircle(cx, cy, R).detach(), [cx, cy, R]);
  const grow = useDerivedValue(() => [{ scale: 1 + 0.06 * ((clock.get() - scene.start) / (scene.end - scene.start)) }]);
  const turn = useDerivedValue(() => [{ rotate: -(clock.get() - scene.start) * 0.3 }]);
  const color = song.recipe.rings[0]?.color ?? Colors.text;
  return (
    <Group origin={vec(cx, cy)} transform={grow}>
      <Group origin={vec(cx, cy)} transform={turn}>
        <Circle cx={cx} cy={cy} r={R * 1.18} color={color} style="stroke" strokeWidth={1.5} opacity={0.8}>
          <DashPathEffect intervals={[10, 8]} />
        </Circle>
        <Circle cx={cx} cy={cy} r={R * 1.36} color={Colors.text} style="stroke" strokeWidth={1} opacity={0.25}>
          <DashPathEffect intervals={[2, 9]} />
        </Circle>
      </Group>
      <Group clip={clip}>
        {image ? <Image image={image} x={cx - R} y={cy - R} width={R * 2} height={R * 2} fit="cover" /> : <Rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} color={color} />}
        <Circle cx={cx} cy={cy} r={R}>
          <RadialGradient c={vec(cx - R * 0.35, cy - R * 0.4)} r={R * 1.3} colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.04)', 'rgba(13,20,38,0.55)']} positions={[0, 0.45, 1]} />
        </Circle>
      </Group>
      <Circle cx={cx} cy={cy} r={R} color={Colors.text} style="stroke" strokeWidth={1} opacity={0.5} />
    </Group>
  );
}

/** All five prints in a row, appearing one after another, joined by a line: the edition's cover. */
function Lockup({ songs, width, height, clock, scene }: { songs: EditionSong[]; width: number; height: number; clock: SharedValue<number>; scene: Scene }) {
  const size = Math.min((width * 0.9) / songs.length, 110);
  const gap = (width - size * songs.length) / (songs.length + 1);
  const y = height / 2 - size / 2;
  const prints = useMemo(() => songs.map((s) => stillPaths(s.recipe, size, 'mini', s.heard)), [songs, size]);
  const line = useMemo(() => Skia.PathBuilder.Make().moveTo(gap, height / 2).lineTo(width - gap, height / 2).detach(), [gap, width, height]);
  const lineEnd = useDerivedValue(() => Math.min(1, Math.max(0, (clock.get() - scene.start) / 1.2)));
  return (
    <Group>
      <Path path={line} color={Colors.text} opacity={0.25} style="stroke" strokeWidth={1} start={0} end={lineEnd} />
      {prints.map((p, i) => (
        <LockupPrint key={i} index={i} x={gap + i * (size + gap)} y={y} size={size} rings={p.rings} clock={clock} start={scene.start} />
      ))}
    </Group>
  );
}

function LockupPrint({ index, x, y, size, rings, clock, start }: { index: number; x: number; y: number; size: number; rings: ReturnType<typeof stillPaths>['rings']; clock: SharedValue<number>; start: number }) {
  const opacity = useDerivedValue(() => Math.min(1, Math.max(0, (clock.get() - start - 0.25 - index * 0.22) / 0.35)));
  return (
    <Group opacity={opacity} transform={[{ translateX: x }, { translateY: y }]}>
      <Rect x={0} y={0} width={size} height={size} color={GROUND} />
      {rings.map((r, k) => (
        <Path key={k} path={r.p} color={r.color} style="stroke" strokeWidth={strokeFor(size, 'mini')} strokeCap="round" />
      ))}
    </Group>
  );
}
