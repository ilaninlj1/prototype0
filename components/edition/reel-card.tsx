import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import type { EditionSong, Scene } from '@/lib/edition';
import { backOut, clamp01, expoInOut, expoOut, lerp, prog, quintInOut } from '@/lib/reel-ease';
import { keyLabel } from '@/lib/sound';

const OR = '#E8461E';

type Props = { song: EditionSong; scene: Scene; clock: SharedValue<number>; width: number; height: number; local: number };

/**
 * The reel's interface scene, as the song you found: a card flies up with its
 * measured sound as switches, each flips orange in turn, then a cursor glides
 * in and taps Save. `local` is the scene's time for the parts that are text.
 */
export function ReelCard({ song, scene, clock, width: W, height: H, local }: Props) {
  const s = song.sound ?? null;
  const rows: [string, string][] = [
    ['Tempo', s ? `${Math.round(s.tempo)} BPM` : song.recipe.label ?? '—'],
    ['Key', s ? (keyLabel(s.key, s.mode) ?? 'Unknown') : '—'],
    ['Energy', s ? `${Math.round(s.energy * 100)}%` : '—'],
    ['Danceable', s ? `${Math.round(s.danceability * 100)}%` : '—'],
  ];
  const [button, setButton] = useState<{ x: number; y: number } | null>(null);
  const cardW = Math.min(400, W * 0.86);
  const cardLeft = (W - cardW) / 2;
  const cardTop = H * 0.2;

  const card = useAnimatedStyle(() => {
    const v = expoOut(prog(clock.get() - scene.start, 0.05, 0.75));
    return { transform: [{ translateY: (1 - v) * H * 0.7 }, { rotate: `${(1 - v) * -8}deg` }] };
  });
  const cursor = useAnimatedStyle(() => {
    const t = clock.get() - scene.start;
    const m = expoInOut(prog(t, 2.75, 3.3));
    const press = Math.sin(Math.PI * prog(t, 3.32, 3.52));
    const bx = button?.x ?? W / 2;
    const by = button?.y ?? H * 0.7;
    return { transform: [{ translateX: lerp(W + 40, bx, m) }, { translateY: lerp(H + 40, by, m) }, { scale: 1 - 0.15 * press }] };
  });
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * Math.sin(Math.PI * prog(clock.get() - scene.start, 3.32, 3.52)) }] }));

  const on = local >= 3.42;
  const pct = Math.round(100 * prog(local, 3.5, 4.2));
  const done = pct >= 100;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.card, { width: cardW, left: cardLeft, top: cardTop }, card]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {song.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {song.artist.toUpperCase()} · 0:30 PREVIEW
            </Text>
          </View>
          <View style={[styles.badge, on && styles.badgeLive]}>
            <Text style={[styles.badgeText, on && { color: '#fff' }]}>{on ? 'FOUND' : 'BLIND'}</Text>
          </View>
        </View>
        {rows.map(([label, value], i) => (
          <Row key={label} label={label} value={value} i={i} clock={clock} start={scene.start} />
        ))}
        <Animated.View
          onLayout={(e) => {
            // Where the cursor taps: the button's spot on screen, from its place in the card.
            const l = e.nativeEvent.layout;
            setButton({ x: cardLeft + l.x + l.width * 0.62, y: cardTop + l.y + l.height * 0.55 });
          }}
          style={[styles.button, on && { backgroundColor: OR }, pressStyle]}>
          <Text style={styles.buttonText}>{done ? 'Saved to Liked ♥' : on ? `Saving… ${pct}%` : 'Save to Liked'}</Text>
          <View style={[styles.buttonBar, { width: `${100 * quintInOut(prog(local, 3.5, 4.2))}%` }]} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.cursor, cursor]}>
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.8 L11.5 14 L18 14 Z" fill="#fff" stroke="#111" strokeWidth={1.3} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Row({ label, value, i, clock, start }: { label: string; value: string; i: number; clock: SharedValue<number>; start: number }) {
  const knob = useAnimatedStyle(() => {
    const t = clock.get() - start;
    const k = Math.min(1.15, Math.max(0, backOut(prog(t, 1 + i * 0.5, 1.28 + i * 0.5))));
    return { transform: [{ translateX: k * 18 }, { scale: 1 + 0.15 * Math.sin(Math.PI * prog(t, 1 + i * 0.5, 1.25 + i * 0.5)) }] };
  });
  const track = useAnimatedStyle(() => ({ backgroundColor: clamp01(prog(clock.get() - start, 1 + i * 0.5, 1.12 + i * 0.5)) > 0.5 ? OR : '#D9D8D4' }));
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{value}</Text>
      </View>
      <Animated.View style={[styles.toggle, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    backgroundColor: '#F7F6F3',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#050a3c',
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 40 },
    elevation: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  headText: { flex: 1 },
  title: { fontFamily: Fonts.reelBold, fontSize: 21, letterSpacing: -0.6, color: '#111' },
  sub: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3, color: 'rgba(17,17,17,0.5)', marginTop: 5 },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#E7E5E0' },
  badgeLive: { backgroundColor: OR },
  badgeText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.3, color: '#555' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#E6E4DF' },
  rowLabel: { fontFamily: Fonts.reelBold, fontSize: 15, letterSpacing: -0.15, color: '#111' },
  rowSub: { fontSize: 12, color: 'rgba(17,17,17,0.5)', marginTop: 2 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#D9D8D4' },
  knob: { position: 'absolute', left: 4, top: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  button: { marginTop: 16, height: 50, borderRadius: 13, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buttonText: { fontFamily: Fonts.reelBold, fontSize: 15, letterSpacing: -0.15, color: '#fff' },
  buttonBar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: '#fff', opacity: 0.85 },
  cursor: { position: 'absolute', left: 0, top: 0 },
});
