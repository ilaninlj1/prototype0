import { Blur, Circle, ColorMatrix, Group, Paint, Path, Rect, Text, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { stillPaths, strokeFor } from '@/components/print/print-still-canvas';
import type { Edition, Scene } from '@/lib/edition';
import { backOut, clamp01, expoIn, expoInOut, expoOut, lerp, prog } from '@/lib/reel-ease';
import { BK, OR, WH } from './reel-fx';
import { advance, fontOf, type ReelTypefaces } from './reel-type';

type Props = { edition: Edition; scene: Scene; clock: SharedValue<number>; width: number; height: number; type: ReelTypefaces };

const WORD = 'BLINDSPOT';
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 24, -10];

/**
 * The reel's outro: black blobs merge on orange (a blur plus an alpha
 * threshold makes them goo), a black circle opens to fill the screen, and
 * BLINDSPOT snaps from wide spacing into place beside a glowing orange dot.
 * Then the edition's five prints, the cover of what you found.
 */
export function ReelOutro({ edition, scene, clock, width: W, height: H, type }: Props) {
  const unit = Math.max(W, H) / 400;
  const cx = W / 2;
  const cy = H / 2;
  const t = useDerivedValue(() => clock.get() - scene.start);

  const lay = useMemo(() => {
    const probe = fontOf(type.black, 100);
    const size = Math.min(H * 0.24, ((W * 0.78) / advance(probe, WORD)) * 100);
    const font = fontOf(type.black, size);
    const widths = [...WORD].map((c) => advance(font, c));
    const mono = fontOf(type.mono, 11);
    const sub = `EDITION No. ${edition.number} — ${edition.songs.length} FOUND BLIND`;
    const printSize = Math.min((W * 0.84) / edition.songs.length, 64);
    const prints = edition.songs.map((s) => stillPaths(s.recipe, printSize, 'mini', s.heard));
    return { size, font, widths, mono, sub, subW: advance(mono, sub), printSize, prints };
  }, [W, H, type, edition]);

  const a = useDerivedValue(() => backOut(prog(t.get(), 0.15, 0.6)));
  const s = useDerivedValue(() => expoInOut(prog(t.get(), 1, 1.8)));
  const m = useDerivedValue(() => expoInOut(prog(t.get(), 1.8, 2.6)));
  const spin = useDerivedValue(() => [{ rotate: (t.get() * 20 * Math.PI) / 180 }]);
  const r0 = useDerivedValue(() => Math.max(0, (30 * a.get() - 6 * s.get() + 16 * m.get()) * unit));
  const sats = [
    [-1, 0, 24],
    [1, 0, 24],
    [0, -0.8, 18],
  ];
  const blackR = useDerivedValue(() => {
    const tt = t.get();
    return tt < 2.5 ? 0 : lerp(60 * unit, Math.hypot(W, H) / 2 + 20, expoIn(prog(tt, 2.5, 3)));
  });

  const lv = useDerivedValue(() => expoOut(prog(t.get(), 3.1, 4.1)));
  const spacing = useDerivedValue(() => lerp(0.35, -0.055, lv.get()) * lay.size);
  const wordBlur = useDerivedValue(() => (lv.get() < 0.99 ? (1 - lv.get()) * 14 : 0));
  const total = useDerivedValue(() => lay.widths.reduce((acc, w) => acc + w, 0) + spacing.get() * (WORD.length - 1) + lay.size * 0.2);
  const startX = useDerivedValue(() => cx - total.get() / 2);
  const baseline = cy + lay.size * 0.35;
  const dotT = useDerivedValue(() => [{ scale: Math.max(0, backOut(prog(t.get(), 3.75, 4.15))) * (1 + 0.08 * Math.sin(t.get() * 10)) }]);
  const dotX = useDerivedValue(() => startX.get() + total.get() - lay.size * 0.08);
  const dotY = baseline - lay.size * 0.08;
  // The dot pops around its own center, which moves with the word's spacing.
  const dotOrigin = useDerivedValue(() => vec(dotX.get(), dotY));
  const subOpacity = useDerivedValue(() => 0.6 * prog(t.get(), 3.95, 4.3));
  const printY = cy + lay.size * 1.25;
  const gap = (W - lay.printSize * lay.prints.length) / (lay.prints.length + 1);

  return (
    <Group>
      <Rect x={0} y={0} width={W} height={H} color={OR} />
      <Group
        layer={
          <Paint>
            <Blur blur={9} />
            <ColorMatrix matrix={GOO} />
          </Paint>
        }>
        <Group origin={vec(cx, cy)} transform={spin}>
          <Circle cx={cx} cy={cy} r={r0} color={BK} />
          {sats.map(([ux, uy, r], k) => (
            <Satellite key={k} k={k} ux={ux} uy={uy} r={r} unit={unit} cx={cx} cy={cy} t={t} s={s} m={m} />
          ))}
        </Group>
      </Group>
      <Circle cx={cx} cy={cy} r={blackR} color={BK} />

      <Group opacity={lv}>
        {[...WORD].map((ch, i) => (
          <OutroChar key={i} ch={ch} i={i} widths={lay.widths} startX={startX} spacing={spacing} y={baseline} font={lay.font} blur={wordBlur} />
        ))}
      </Group>
      <Group origin={dotOrigin} transform={dotT}>
        <Circle cx={dotX} cy={dotY} r={lay.size * 0.16} color={OR} opacity={0.35}>
          <Blur blur={lay.size * 0.12} />
        </Circle>
        <Circle cx={dotX} cy={dotY} r={lay.size * 0.08} color={OR} />
      </Group>
      <Text x={cx - lay.subW / 2} y={baseline + lay.size * 0.55} text={lay.sub} font={lay.mono} color={WH} opacity={subOpacity} />
      {lay.prints.map((p, i) => (
        <OutroPrint key={i} i={i} x={gap + i * (lay.printSize + gap)} y={printY} size={lay.printSize} rings={p.rings} t={t} />
      ))}
    </Group>
  );
}

function Satellite(props: { k: number; ux: number; uy: number; r: number; unit: number; cx: number; cy: number; t: SharedValue<number>; s: SharedValue<number>; m: SharedValue<number> }) {
  const { k, ux, uy, r, unit, cx, cy, t, s, m } = props;
  const pos = useDerivedValue(() => {
    const tt = t.get();
    const sx = ux * 70 * s.get();
    const sy = uy * 70 * s.get();
    const ang = k * 2.1 + tt * 3.2;
    const orr = 24 + 6 * Math.sin(tt * 5 + k);
    return { x: cx + lerp(sx, Math.cos(ang) * orr, m.get()) * unit, y: cy + lerp(sy, Math.sin(ang) * orr, m.get()) * unit };
  });
  const x = useDerivedValue(() => pos.get().x);
  const y = useDerivedValue(() => pos.get().y);
  const radius = useDerivedValue(() => r * clamp01(s.get() * 3) * (1 + 0.2 * m.get()) * unit);
  return <Circle cx={x} cy={y} r={radius} color={BK} />;
}

function OutroChar(props: { ch: string; i: number; widths: number[]; startX: SharedValue<number>; spacing: SharedValue<number>; y: number; font: ReturnType<typeof fontOf>; blur: SharedValue<number> }) {
  const { ch, i, widths, startX, spacing, y, font, blur } = props;
  const x = useDerivedValue(() => {
    let acc = startX.get();
    for (let k = 0; k < i; k++) acc += widths[k] + spacing.get();
    return acc;
  });
  return (
    <Text x={x} y={y} text={ch} font={font} color={WH}>
      <Blur blur={blur} />
    </Text>
  );
}

function OutroPrint({ i, x, y, size, rings, t }: { i: number; x: number; y: number; size: number; rings: ReturnType<typeof stillPaths>['rings']; t: SharedValue<number> }) {
  const opacity = useDerivedValue(() => prog(t.get(), 4.15 + i * 0.12, 4.5 + i * 0.12));
  return (
    <Group opacity={opacity} transform={[{ translateX: x }, { translateY: y }]}>
      {rings.map((r, k) => (
        <Path key={k} path={r.p} color={r.color} style="stroke" strokeWidth={strokeFor(size, 'mini')} strokeCap="round" />
      ))}
    </Group>
  );
}
