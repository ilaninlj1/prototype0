import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Radius } from '@/constants/theme';
import { routeXY } from '@/lib/run-reveal';
import type { RunRecord } from '@/lib/run-types';

/** Your route on the dark ground, north up, with a pin wherever a song stuck. Tap a pin to hear it. Never shared. */
export function RouteMap({ run, width, height, hardest, onSelect }: { run: RunRecord; width: number; height: number; hardest: number | null; onSelect: (i: number) => void }) {
  const xy = routeXY(run.points, width, height, 24);
  if (!xy) return null;
  const at = (t: number) => xy.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));
  const pins = run.played
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.liked || i === hardest)
    .map(({ s, i }) => ({ i, s, p: at((s.start + s.end) / 2) }));
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Polyline points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#f3ead8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={xy[0].x} cy={xy[0].y} r={5} fill="#f3ead8" />
        {pins.map(({ i, s, p }) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === hardest ? 8 : 7}
            fill={s.liked === 'legs' ? DarkColors.highlight : DarkColors.signal}
            stroke={i === hardest ? '#f3ead8' : 'none'}
            strokeWidth={2}
          />
        ))}
      </Svg>
      {pins.map(({ i, s, p }) => (
        <Pressable
          key={i}
          onPress={() => onSelect(i)}
          style={[styles.hit, { left: p.x - 22, top: p.y - 22 }]}
          accessibilityRole="button"
          accessibilityLabel={`${s.track.trackName} by ${s.track.artistName}`}
        />
      ))}
      {hardest != null && pins.some((x) => x.i === hardest) ? (
        <ThemedText style={[styles.tag, { left: Math.min(width - 90, pins.find((x) => x.i === hardest)!.p.x + 10), top: pins.find((x) => x.i === hardest)!.p.y - 26 }]}>
          fastest here
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#0f1a33', borderRadius: Radius.lg, overflow: 'hidden' },
  hit: { position: 'absolute', width: 44, height: 44 },
  tag: { position: 'absolute', fontFamily: Fonts.mono, fontSize: 11, color: '#f3ead8' },
});
