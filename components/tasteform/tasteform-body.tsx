import { memo, useMemo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { rgb, type Rgb } from '@/lib/cover-color';
import { bodyPath, type Form } from '@/lib/tasteform';

/** Before a cover's color arrives: a muted blue that sits quietly on navy. */
export const NO_COLOR: Rgb = [92, 112, 160];

type Props = {
  form: Form;
  /** One color per cell, same order as form.cells. */
  colors: Rgb[];
  /** Keeps gradient ids unique while an old body fades out under a new one. */
  id: string;
};

/**
 * The living body: one outline traced around every cell, filled with each
 * cover's color as a soft glow, so neighbors blend where they meet. A faint
 * halo outside and a thin light edge make it read as a membrane.
 */
export const TasteformBody = memo(function TasteformBody({ form, colors, id }: Props) {
  const d = useMemo(() => bodyPath(form.cells, form.width, form.height), [form]);
  // One gradient per distinct color, not per cell.
  const palette = useMemo(() => [...new Set(colors.map((c) => rgb(c)))], [colors]);
  const avg = useMemo(() => {
    const sum = colors.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
    return rgb(sum.map((v) => Math.round(v / Math.max(1, colors.length))) as Rgb);
  }, [colors]);
  if (!d) return null;

  return (
    <Svg width={form.width} height={form.height}>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Path d={d} clipRule="evenodd" />
        </ClipPath>
        {palette.map((c, i) => (
          <RadialGradient key={c} id={`${id}-g${i}`}>
            <Stop offset="0" stopColor={c} stopOpacity={1} />
            <Stop offset="0.55" stopColor={c} stopOpacity={0.6} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Path d={d} fill={avg} fillOpacity={0.18} fillRule="evenodd" stroke={avg} strokeOpacity={0.18} strokeWidth={10} />
      <G clipPath={`url(#${id}-clip)`}>
        <Rect width={form.width} height={form.height} fill={avg} opacity={0.55} />
        {form.cells.map((c, i) => (
          <Circle key={c.id} cx={c.x} cy={c.y} r={c.r * 2.6} fill={`url(#${id}-g${palette.indexOf(rgb(colors[i]))})`} />
        ))}
      </G>
      <Path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
    </Svg>
  );
});
