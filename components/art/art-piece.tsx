import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { ART, STAFF_LINES, markShapes, slotPosition, type ArtCanvas, type Mark } from '@/lib/print';

const VIEWBOX = `0 0 ${ART.width} ${ART.height}`;

/** One song's mark, drawn centred at (x, y) in canvas units. */
export const MarkPaths = memo(function MarkPaths({ mark, x, y }: { mark: Mark; x: number; y: number }) {
  return (
    <G>
      {markShapes(mark, x, y).map((s, i) => (
        <Path
          key={i}
          d={s.d}
          fill={s.fill ?? 'none'}
          stroke={s.stroke ?? 'none'}
          strokeWidth={s.strokeWidth ?? 0}
          opacity={s.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </G>
  );
});

export const markPosition = (mark: Mark, index: number) => slotPosition(index, mark.print.family, mark.print.variant);

/**
 * The piece: five faint staff lines, skipped songs as ghosts underneath,
 * revealed songs on top. The newest ghost fades in; a revealed song has
 * already flown in, so it just appears.
 */
export function ArtPiece({ canvas, style }: { canvas: ArtCanvas; style?: StyleProp<ViewStyle> }) {
  const marks = canvas.marks;
  const newest = marks[marks.length - 1];
  const fading = newest?.kind === 'ghost' ? newest : undefined;
  const settled = fading ? marks.slice(0, -1) : marks;
  const order = settled.map((m, i) => ({ m, i })).sort((a, b) => (a.m.kind === b.m.kind ? 0 : a.m.kind === 'ghost' ? -1 : 1));

  return (
    <View style={[styles.piece, style]}>
      <Svg viewBox={VIEWBOX} width="100%" height="100%">
        {STAFF_LINES.map((y) => (
          <Path key={y} d={`M16 ${y} L${ART.width - 16} ${y}`} stroke={Colors.text} strokeOpacity={0.1} strokeWidth={1.4} />
        ))}
        {order.map(({ m, i }) => {
          const p = markPosition(m, i);
          return <MarkPaths key={m.trackId} mark={m} x={p.x} y={p.y} />;
        })}
      </Svg>
      {fading && (
        <Animated.View key={fading.trackId} entering={FadeIn.duration(700)} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg viewBox={VIEWBOX} width="100%" height="100%">
            <MarkPaths mark={fading} x={markPosition(fading, marks.length - 1).x} y={markPosition(fading, marks.length - 1).y} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { aspectRatio: ART.width / ART.height, backgroundColor: '#0e1830', overflow: 'hidden' },
});
