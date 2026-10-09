import { Circle, Group, Path, Rect, Skia, Text, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { EditionSong, Scene } from '@/lib/edition';
import { backOut, clamp01, expoInOut, expoOut, prog, quintInOut } from '@/lib/reel-ease';
import { OR, WH } from './reel-fx';
import { advance, fontOf, type ReelTypefaces } from './reel-type';

type Props = { song: EditionSong; index: number; scene: Scene; clock: SharedValue<number>; width: number; height: number; type: ReelTypefaces };

const LABELS = ['DANCE', 'ENERGY', 'ACOUST', 'INSTR', 'SPEECH', 'LIVE', 'VALENCE', 'LOUD'];

/**
 * The reel's data scene with the song's real numbers: its BPM counts up, a
 * ring fills to its energy, and bars rise for its eight measured qualities
 * (the two highest in orange), joined by a line drawn left to right.
 * A song without sound data says so instead of showing made-up numbers.
 */
export function ReelData({ song, index, scene, clock, width: W, height: H, type }: Props) {
  const s = song.sound ?? null;
  const values = useMemo(
    () =>
      s
        ? [s.danceability, s.energy, s.acousticness, s.instrumentalness, s.speechiness, s.liveness, s.valence, clamp01((s.loudness + 30) / 30)]
        : null,
    [s]
  );
  const top2 = useMemo(() => (values ? [...values.map((v, i) => [v, i])].sort((a, b) => b[0] - a[0]).slice(0, 2).map((x) => x[1]) : []), [values]);

  const L = useMemo(() => {
    const pad = W * 0.06;
    const big = fontOf(type.black, W * 0.23);
    const mono = fontOf(type.mono, 10);
    const monoBig = fontOf(type.bold, W * 0.075);
    const ringD = W * 0.42;
    const top = H * 0.16;
    return {
      pad,
      big,
      mono,
      monoBig,
      label: { y: top },
      counter: { y: top + W * 0.22 },
      sub: { y: top + W * 0.22 + 22 },
      ring: { cx: pad + ringD / 2, cy: top + W * 0.3 + ringD / 2, r: ringD / 2 - 6 },
      chart: { x: pad, y: top + W * 0.36 + ringD, w: W - pad * 2, h: H * 0.2 },
    };
  }, [W, H, type]);

  const t = useDerivedValue(() => clock.get() - scene.start);
  const counter = useDerivedValue(() => (s ? String(Math.round(s.tempo * quintInOut(prog(t.get(), 0.2, 2)))) : '—'));
  const bpmX = useDerivedValue(() => L.pad + advance(L.big, counter.get()) + 8);
  const energy = s ? s.energy : 0;
  const ringEnd = useDerivedValue(() => energy * expoInOut(prog(t.get(), 0.6, 2.1)));
  const ringText = useDerivedValue(() => (s ? `${Math.round(energy * 100 * expoInOut(prog(t.get(), 0.6, 2.1)))}%` : '—'));
  const ringTextX = useDerivedValue(() => L.ring.cx - advance(L.monoBig, ringText.get()) / 2);
  const ringPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    b.addArc(Skia.XYWHRect(L.ring.cx - L.ring.r, L.ring.cy - L.ring.r, L.ring.r * 2, L.ring.r * 2), -90, 359.9);
    return b.detach();
  }, [L]);
  const b0 = useBlockIn(t, 0);
  const b1 = useBlockIn(t, 0.1);
  const b2 = useBlockIn(t, 0.2);

  const chart = L.chart;
  const bw = chart.w / 8;
  const points = useMemo(() => (values ?? []).map((v, i) => [chart.x + bw * (i + 0.5), chart.y + chart.h - v * chart.h * 0.92]), [values, chart, bw]);
  const line = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    points.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y)));
    return b.detach();
  }, [points]);
  const lineEnd = useDerivedValue(() => quintInOut(prog(t.get(), 2, 3.3)));
  const grid = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let k = 1; k <= 4; k++) b.moveTo(chart.x, chart.y + chart.h - (k * chart.h) / 4.4).lineTo(chart.x + chart.w, chart.y + chart.h - (k * chart.h) / 4.4);
    return b.detach();
  }, [chart]);

  return (
    <Group>
      <Rect x={0} y={0} width={W} height={H} color="#0B0B0D" />
      <Group opacity={b0.o} transform={b0.tf}>
        <Text x={L.pad} y={L.label.y} text={`METRIC 0${index + 1} — SOUND PROFILE`} font={L.mono} color="rgba(244,241,236,0.55)" />
        <Text x={L.pad} y={L.counter.y} text={counter} font={L.big} color={WH} />
        {s && <Text x={bpmX} y={L.counter.y} text="BPM" font={L.big} color={OR} />}
        <Text x={L.pad} y={L.sub.y} text={s ? `${song.title} · ${song.artist}`.toUpperCase().slice(0, 44) : 'NO SOUND DATA FOR THIS SONG'} font={L.mono} color="rgba(244,241,236,0.55)" />
      </Group>
      <Group opacity={b1.o} transform={b1.tf}>
        <Circle cx={L.ring.cx} cy={L.ring.cy} r={L.ring.r} color="rgba(255,255,255,0.1)" style="stroke" strokeWidth={10} />
        <Path path={ringPath} color={OR} style="stroke" strokeWidth={10} strokeCap="round" start={0} end={ringEnd} />
        <Text x={ringTextX} y={L.ring.cy + W * 0.025} text={ringText} font={L.monoBig} color={WH} />
        <Text x={L.ring.cx - advance(L.mono, 'ENERGY') / 2} y={L.ring.cy + W * 0.075} text="ENERGY" font={L.mono} color="rgba(244,241,236,0.55)" />
      </Group>
      <Group opacity={b2.o} transform={b2.tf}>
        <Path path={grid} color="rgba(255,255,255,0.08)" style="stroke" strokeWidth={1} />
        {values?.map((v, i) => (
          <Bar key={i} i={i} v={v} x={chart.x + bw * i + bw * 0.22} w={bw * 0.56} bottom={chart.y + chart.h} h={chart.h * 0.92} t={t} hot={top2.includes(i)} />
        ))}
        {values && <Path path={line} color={WH} style="stroke" strokeWidth={2} start={0} end={lineEnd} />}
        {points.map(([x, y], i) => (
          <Dot key={i} x={x} y={y} px={(x - chart.x) / chart.w} lineEnd={lineEnd} />
        ))}
        {values &&
          LABELS.map((l, i) => (
            <Text key={l} x={chart.x + bw * (i + 0.5) - advance(L.mono, l) / 2} y={chart.y + chart.h + 16} text={l} font={L.mono} color="rgba(244,241,236,0.45)" />
          ))}
      </Group>
    </Group>
  );
}

/** A block of the scene rising 30px into place as it fades in, starting at d seconds. */
function useBlockIn(t: SharedValue<number>, d: number) {
  const o = useDerivedValue(() => expoOut(prog(t.get(), d, d + 0.6)));
  const tf = useDerivedValue(() => [{ translateY: (1 - expoOut(prog(t.get(), d, d + 0.6))) * 30 }]);
  return { o, tf };
}

function Bar({ i, v, x, w, bottom, h, t, hot }: { i: number; v: number; x: number; w: number; bottom: number; h: number; t: SharedValue<number>; hot: boolean }) {
  const grow = useDerivedValue(() => expoOut(prog(t.get(), 1.3 + i * 0.06, 1.9 + i * 0.06)));
  const height = useDerivedValue(() => Math.max(1, v * h * grow.get()));
  const y = useDerivedValue(() => bottom - height.get());
  return <Rect x={x} y={y} width={w} height={height} color={hot ? OR : 'rgba(244,241,236,0.16)'} />;
}

function Dot({ x, y, px, lineEnd }: { x: number; y: number; px: number; lineEnd: SharedValue<number> }) {
  const r = useDerivedValue(() => 4.5 * Math.max(0, backOut(clamp01((lineEnd.get() - px) * 8))));
  return (
    <Group origin={vec(x, y)}>
      <Circle cx={x} cy={y} r={r} color={OR} />
    </Group>
  );
}
