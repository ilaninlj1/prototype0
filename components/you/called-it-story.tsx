import { Image } from 'expo-image';
import type { RefObject } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { compact, type CalledStory } from '@/lib/you-stats';

/** Designed at 360×640: an Instagram story at a third of 1080×1920. Everything scales with `width`. */
const BASE = 360;

/**
 * The Called It story: "I found them before I knew who it was", with the cover, a line from
 * their listeners the day you saved them to now, and the growth. Only the two ends of the line
 * are data, so only they get labels.
 */
export function CalledItStory({ cardRef, story, width }: { cardRef: RefObject<View | null>; story: CalledStory; width: number }) {
  const k = width / BASE;
  const s = (n: number) => Math.round(n * k * 10) / 10;
  const found = new Date(story.track.likedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const cw = s(304);
  const ch = s(72);
  const x0 = s(6);
  const y0 = ch - s(14);
  const x1 = cw - s(8);
  const y1 = s(10);
  const curve = `M ${x0} ${y0} C ${cw * 0.55} ${y0}, ${cw * 0.72} ${s(34)}, ${x1} ${y1}`;
  const mono = (size: number, color: string = Colors.text) => ({
    fontFamily: Fonts.mono,
    fontSize: s(size),
    lineHeight: s(size * 1.4),
    letterSpacing: s(1.4),
    color,
  });

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={{
        width,
        height: s(640),
        paddingTop: s(36),
        paddingHorizontal: s(28),
        paddingBottom: s(28),
        gap: s(14),
        backgroundColor: Colors.background,
        borderRadius: s(18),
        overflow: 'hidden',
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ThemedText style={mono(11)}>BLINDSPOT</ThemedText>
        <ThemedText style={mono(11, Colors.signal)}>● CALLED IT</ThemedText>
      </View>

      <View style={{ alignSelf: 'center', width: s(200), height: s(200), marginTop: s(4) }}>
        <Image
          source={{ uri: artworkUrl(story.track.artworkUrl100, 600) }}
          style={{ width: s(200), height: s(200), borderRadius: s(10), backgroundColor: Colors.surface }}
        />
        <View
          style={{
            position: 'absolute',
            right: -s(14),
            top: -s(12),
            paddingVertical: s(6),
            paddingHorizontal: s(10),
            borderRadius: 999,
            backgroundColor: Colors.signal,
            transform: [{ rotate: '8deg' }],
          }}>
          <ThemedText style={mono(10)}>FOUND BLIND</ThemedText>
        </View>
      </View>

      <ThemedText
        numberOfLines={3}
        adjustsFontSizeToFit
        style={{ fontFamily: Fonts.display, fontSize: s(26), lineHeight: s(29), letterSpacing: -s(0.5), color: Colors.text }}>
        I found {story.track.artistName} before I knew who it was.
      </ThemedText>

      <View style={{ gap: s(6) }}>
        <Svg width={cw} height={ch}>
          <Line x1={0} y1={ch - s(4)} x2={cw} y2={ch - s(4)} stroke={Colors.rule} strokeWidth={1} />
          <Path d={curve} stroke={Colors.signal} strokeWidth={s(3)} fill="none" strokeLinecap="round" />
          <Circle cx={x0} cy={y0} r={s(5)} fill={Colors.text} />
          <Circle cx={x1} cy={y1} r={s(6)} fill={Colors.signal} />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <ThemedText style={mono(10)}>
            {found} · {compact(story.found)}
          </ThemedText>
          <ThemedText style={mono(10)}>NOW · {compact(story.now)}</ThemedText>
        </View>
      </View>

      {/* Stacked, not side by side: a big jump like +1320% would squeeze the words beside it. */}
      <View style={{ gap: s(2), marginTop: 'auto' }}>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontFamily: Fonts.display, fontSize: s(60), lineHeight: s(64), letterSpacing: -s(1.4), color: Colors.signal }}>
          +{story.pct.toLocaleString('en-US')}%
        </ThemedText>
        <ThemedText style={{ fontSize: s(13), lineHeight: s(17), color: Colors.textSecondary }}>
          more listeners since I found them
        </ThemedText>
      </View>
      <ThemedText style={mono(9, Colors.textTertiary)}>FIND MUSIC BLIND · BLINDSPOT.EXPO.APP</ThemedText>
    </View>
  );
}
