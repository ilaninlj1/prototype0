import { Canvas, Paint, Path, Picture, PaintStyle, Skia, StrokeCap, createPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import type { ChartDot, PathPoint } from '@/lib/ocean-chart';
import { DEPTHS, WATERS } from '@/lib/ocean-map';
import { dayMixAt, waterStops } from '@/lib/ocean-scene';

export type OceanChartCanvasProps = { width: number; height: number; hour: number; dots: ChartDot[]; path: PathPoint[] };

/** The graph: the ocean's 16 places as a chart, every fish with its trail, and your path drawing itself in on top. */
export default function OceanChartCanvas({ width, height, hour, dots, path }: OceanChartCanvasProps) {
  const still = useMemo(
    () =>
      createPicture(
        (c) => {
          const day = dayMixAt(hour);
          const cw = width / WATERS.length;
          const ch = height / DEPTHS.length;
          WATERS.forEach((water, x) => {
            DEPTHS.forEach((depth, y) => {
              const s = waterStops(water, depth, day);
              const p = Skia.Paint();
              p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: y * ch }, { x: 0, y: (y + 1) * ch }, [Skia.Color(s.top), Skia.Color(s.mid)], [0, 1], 0));
              c.drawRect(Skia.XYWHRect(x * cw, y * ch, cw + 0.5, ch + 0.5), p);
            });
          });
          const rule = Skia.Paint();
          rule.setStyle(PaintStyle.Stroke);
          rule.setStrokeWidth(1);
          rule.setColor(Skia.Color('white'));
          rule.setAlphaf(0.14);
          for (let i = 1; i < WATERS.length; i++) c.drawLine(i * cw, 0, i * cw, height, rule);
          for (let i = 1; i < DEPTHS.length; i++) c.drawLine(0, i * ch, width, i * ch, rule);
          // A trail runs back down to where you found each fish that climbed.
          for (const d of dots) {
            if (d.fromY - d.y < 2) continue;
            const t = Skia.Paint();
            t.setAntiAlias(true);
            t.setColor(Skia.Color(d.creature.color));
            t.setAlphaf(0.75);
            for (let y = d.y + 5; y < d.fromY; y += 5) c.drawCircle(d.x, y, 0.9, t);
            const start = Skia.Paint();
            start.setAntiAlias(true);
            start.setStyle(PaintStyle.Stroke);
            start.setStrokeWidth(1);
            start.setColor(Skia.Color(d.creature.color));
            c.drawCircle(d.fromX, d.fromY, 2.4, start);
          }
          for (const d of dots) {
            const p = Skia.Paint();
            p.setAntiAlias(true);
            p.setColor(Skia.Color(d.creature.color));
            p.setAlphaf(0.22);
            c.drawCircle(d.x, d.y, d.r * 2.2, p);
            p.setAlphaf(0.35 + 0.65 * d.creature.vivid);
            c.drawCircle(d.x, d.y, d.r, p);
          }
        },
        { width, height }
      ),
    [width, height, hour, dots]
  );

  const line = useMemo(() => {
    if (path.length < 2) return null;
    const b = Skia.PathBuilder.Make();
    const pts = path.map((p) => ({ x: p.x * width, y: p.y * height }));
    b.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1].x + pts[i].x) / 2;
      const my = (pts[i - 1].y + pts[i].y) / 2;
      b.quadTo(pts[i - 1].x, pts[i - 1].y, mx, my);
    }
    b.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    return b.build();
  }, [path, width, height]);

  // Your path draws itself from your first songs to now.
  const end = useSharedValue(0);
  useEffect(() => {
    end.set(0);
    end.set(withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }));
  }, [line, end]);

  const last = path[path.length - 1];
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Picture picture={still} />
      {line && (
        <Path path={line} style="stroke" strokeCap="round" strokeJoin="round" end={end} color="transparent">
          <Paint style="stroke" strokeWidth={7} color="rgba(255,255,255,0.22)" strokeCap="round" />
          <Paint style="stroke" strokeWidth={2.2} color="#ffffff" strokeCap="round" />
        </Path>
      )}
      {last && <Picture picture={createPicture((c) => {
        const p = Skia.Paint();
        p.setAntiAlias(true);
        p.setColor(Skia.Color('white'));
        p.setStrokeCap(StrokeCap.Round);
        p.setAlphaf(0.28);
        c.drawCircle(last.x * width, last.y * height, 9, p);
        p.setAlphaf(1);
        c.drawCircle(last.x * width, last.y * height, 4, p);
      }, { width, height })} />}
    </Canvas>
  );
}
