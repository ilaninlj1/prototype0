import { Blur, Circle, Group, Path, RadialGradient, Rect, Skia, Text, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { Scene } from '@/lib/edition';
import { backOut, expoIn, expoInOut, expoOut, prog, quintInOut, quintOut } from '@/lib/reel-ease';
import { BK, OR, WH } from './reel-fx';
import { advance, fontOf, type ReelTypefaces } from './reel-type';

type Props = { scene: Scene; clock: SharedValue<number>; width: number; height: number; type: ReelTypefaces };

const WORD = 'BLINDSPOT.';
const SCRIPT = 'five found blind';

/**
 * The reel's opening: a grid fades up around a glowing dot, an orange line
 * sweeps across and thickens, then orange slams open from the middle and
 * BLINDSPOT. rises letter by letter, with "five found blind" written in under it.
 */
export function ReelIntro({ scene, clock, width: W, height: H, type }: Props) {
  const lay = useMemo(() => {
    const probe = fontOf(type.black, 100);
    const size = Math.min(H * 0.3, ((W * 0.88) / advance(probe, WORD)) * 100);
    const font = fontOf(type.black, size);
    const total = advance(font, WORD);
    const x0 = (W - total) / 2;
    const xs: number[] = [];
    let x = x0;
    for (const ch of WORD) {
      xs.push(x);
      x += advance(font, ch);
    }
    const baseline = H / 2 + size * 0.34;
    const scriptSize = Math.min(W * 0.085, H * 0.12);
    const scriptFont = fontOf(type.script, scriptSize);
    const scriptW = advance(scriptFont, SCRIPT);
    const grid = Skia.PathBuilder.Make();
    for (let gx = (W / 2) % 48; gx < W; gx += 48) grid.moveTo(gx, 0).lineTo(gx, H);
    for (let gy = (H / 2) % 48; gy < H; gy += 48) grid.moveTo(0, gy).lineTo(W, gy);
    return { font, size, xs, baseline, x0, total, scriptFont, scriptW, scriptX: x0 + total - scriptW - size * 0.2, scriptY: baseline + scriptSize * 0.95, grid: grid.detach() };
  }, [W, H, type]);

  const t = useDerivedValue(() => clock.get() - scene.start);
  const gridOpacity = useDerivedValue(() => prog(t.get(), 0, 0.7));
  const dotScale = useDerivedValue(() => {
    const tt = t.get();
    return Math.max(0, backOut(prog(tt, 0.1, 0.6)) * (1 + 0.18 * Math.sin(tt * 9)));
  });
  const dotOpacity = useDerivedValue(() => 1 - prog(t.get(), 1.95, 2.05));
  const dotT = useDerivedValue(() => [{ scale: dotScale.get() }]);
  const lineW = useDerivedValue(() => W * expoInOut(prog(t.get(), 0.55, 1.45)));
  const lineH = useDerivedValue(() => 1 + 2.5 * expoIn(prog(t.get(), 1.5, 2)));
  const lineY = useDerivedValue(() => H / 2 - lineH.get() / 2);
  const lineOpacity = useDerivedValue(() => (t.get() < 2.02 ? 1 : 0));
  // The slam: orange opens from the middle out.
  const ins = useDerivedValue(() => 0.5 * (1 - expoOut(prog(t.get(), 2, 2.3))));
  const slamY = useDerivedValue(() => H * ins.get());
  const slamH = useDerivedValue(() => H * (1 - 2 * ins.get()));
  const slamClip = useDerivedValue(() => Skia.XYWHRect(0, slamY.get(), W, slamH.get()));
  // The lockup shakes as it lands, then settles from 110% to 100%.
  const lockT = useDerivedValue(() => {
    const tt = t.get();
    const sh = tt > 2 && tt < 2.45 ? (1 - prog(tt, 2, 2.45)) * 14 : 0;
    const s = 1.1 - 0.1 * quintOut(prog(tt, 2, 4));
    return [{ translateX: Math.sin(tt * 90) * sh }, { translateY: Math.cos(tt * 77) * sh }, { scale: s }];
  });
  const scriptW = useDerivedValue(() => lay.scriptW * 1.2 * quintInOut(prog(t.get(), 2.6, 3.35)));
  const scriptBox = useMemo(
    () => Skia.XYWHRect(lay.scriptX - 10, lay.scriptY - lay.scriptFont.getSize(), lay.scriptW * 1.2 + 20, lay.scriptFont.getSize() * 1.6),
    [lay]
  );
  // The script writes itself in from the left.
  const scriptClip = useDerivedValue(() => Skia.XYWHRect(lay.scriptX - 6, lay.scriptY - lay.scriptFont.getSize() * 1.1, scriptW.get() + 6, lay.scriptFont.getSize() * 1.6));

  return (
    <Group>
      <Path path={lay.grid} style="stroke" strokeWidth={1} opacity={gridOpacity}>
        <RadialGradient c={vec(W / 2, H / 2)} r={Math.max(W, H) * 0.6} colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} positions={[0.1, 1]} />
      </Path>
      <Group opacity={dotOpacity} origin={vec(W / 2, H / 2)} transform={dotT}>
        <Circle cx={W / 2} cy={H / 2} r={30} color={OR} opacity={0.45}>
          <Blur blur={24} />
        </Circle>
        <Circle cx={W / 2} cy={H / 2} r={10} color={OR} opacity={0.9}>
          <Blur blur={6} />
        </Circle>
        <Circle cx={W / 2} cy={H / 2} r={5} color="#ffffff" />
      </Group>
      <Group opacity={lineOpacity}>
        <Rect x={0} y={lineY} width={lineW} height={lineH} color={OR} opacity={0.6}>
          <Blur blur={8} />
        </Rect>
        <Rect x={0} y={lineY} width={lineW} height={lineH} color={OR} />
      </Group>

      <Rect x={0} y={slamY} width={W} height={slamH} color={OR} />
      <Group clip={slamClip}>
        <Group origin={vec(W / 2, H / 2)} transform={lockT}>
          <Group clip={{ x: 0, y: lay.baseline - lay.size * 0.82, width: W, height: lay.size * 0.98 }}>
            {[...WORD].map((ch, i) => (
              <RisingChar key={i} ch={ch} x={lay.xs[i]} y={lay.baseline} size={lay.size} index={i} t={t} font={lay.font} />
            ))}
          </Group>
          <Group clip={scriptBox}>
            <Group origin={vec(lay.scriptX, lay.scriptY)} transform={[{ rotate: (-5 * Math.PI) / 180 }]}>
              <Group clip={scriptClip}>
                <Text x={lay.scriptX} y={lay.scriptY} text={SCRIPT} font={lay.scriptFont} color={BK} />
              </Group>
            </Group>
          </Group>
        </Group>
      </Group>
    </Group>
  );
}

function RisingChar({ ch, x, y, size, index, t, font }: { ch: string; x: number; y: number; size: number; index: number; t: SharedValue<number>; font: ReturnType<typeof fontOf> }) {
  const lift = useDerivedValue(() => {
    const v = expoOut(prog(t.get(), 2.06 + index * 0.045, 2.62 + index * 0.045));
    return [{ translateY: (1 - v) * size * 1.12 }];
  });
  return (
    <Group transform={lift}>
      <Text x={x} y={y} text={ch} font={font} color={ch === '.' ? WH : BK} />
    </Group>
  );
}
