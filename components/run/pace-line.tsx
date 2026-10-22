import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { DarkColors, Fonts } from '@/constants/theme';
import { paceSeries } from '@/lib/run-reveal';
import type { RunRecord } from '@/lib/run-types';

const CREAM = '#f3ead8';
const STRIP_H = 30;

type Props = { run: RunRecord; width: number; height: number; hardest: number | null; selected: number | null; onSelect: (i: number) => void };

/**
 * The run as one line, faster higher, with the goal shaded. Under it, one bar per song: red ones you liked,
 * gold ones your legs liked. Drag along the bars to hear and reveal each song.
 */
export function PaceLine({ run, width, height, hardest, selected, onSelect }: Props) {
  const [stripW, setStripW] = useState(width);
  const series = paceSeries(run.points);
  const duration = Math.max(1, run.endedAt - run.startedAt);
  const speeds = series.filter((p) => p.pace != null).map((p) => 1000 / p.pace!);
  const goalSpeed = run.goalPace ? 1000 / run.goalPace : null;
  const all = goalSpeed ? [...speeds, goalSpeed * 1.06, goalSpeed * 0.94] : speeds;
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo) * 0.12 || 0.2;
  const chartH = height - STRIP_H - 10;
  const y = (v: number) => chartH - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * chartH;
  const x = (t: number) => (t / duration) * width;
  const speedAt = (t: number) => {
    const p = series[Math.min(series.length - 1, Math.max(0, Math.round(t / 15_000)))];
    return p?.pace ? 1000 / p.pace : null;
  };
  const line = series
    .filter((p) => p.pace != null)
    .map((p) => `${x(p.t + 7500).toFixed(1)},${y(1000 / p.pace!).toFixed(1)}`)
    .join(' ');
  const n = run.played.length;

  const pick = (e: GestureResponderEvent) => {
    if (n === 0) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.nativeEvent.locationX / stripW) * n)));
    if (i !== selected) onSelect(i);
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={chartH}>
        {goalSpeed ? (
          <>
            <Rect x={0} y={y(goalSpeed * 1.05)} width={width} height={y(goalSpeed * 0.95) - y(goalSpeed * 1.05)} fill="rgba(243,234,216,0.08)" />
            <SvgText x={4} y={y(goalSpeed * 1.05) + 12} fill="rgba(243,234,216,0.45)" fontFamily={Fonts.mono} fontSize={9}>
              {run.goal.toUpperCase()}
            </SvgText>
          </>
        ) : null}
        {line ? <Polyline points={line} fill="none" stroke={CREAM} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {run.played.map((s, i) => {
          const v = speedAt((s.start + s.end) / 2);
          if (v == null || (!s.liked && i !== hardest && i !== selected)) return null;
          const cx = x((s.start + s.end) / 2);
          const cy = y(v);
          if (i === selected) return <Circle key={i} cx={cx} cy={cy} r={6} fill={CREAM} />;
          if (i === hardest) return <Circle key={i} cx={cx} cy={cy} r={6} fill={DarkColors.signal} stroke={CREAM} strokeWidth={2} />;
          return s.liked === 'you' ? (
            <Circle key={i} cx={cx} cy={cy} r={5} fill={DarkColors.signal} />
          ) : (
            <Circle key={i} cx={cx} cy={cy} r={5} fill="none" stroke={DarkColors.highlight} strokeWidth={2} />
          );
        })}
      </Svg>
      <View
        style={styles.strip}
        onLayout={(e) => setStripW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}
        accessibilityLabel="Songs from your run, drag to hear each one">
        {run.played.map((s, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.bar,
              {
                backgroundColor:
                  i === selected ? CREAM : s.liked === 'you' ? DarkColors.signal : s.liked === 'legs' ? DarkColors.highlight : 'rgba(243,234,216,0.22)',
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { height: STRIP_H, marginTop: 10, flexDirection: 'row', gap: 2, padding: 3, borderRadius: 4, backgroundColor: DarkColors.surface },
  bar: { flex: 1, borderRadius: 1 },
});
