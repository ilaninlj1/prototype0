import * as Haptics from 'expo-haptics';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, type SharedValue, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import {
  BlindPackEmblem,
  BlindTestEmblem,
  DailyDropEmblem,
  HeadToHeadEmblem,
  SpotTheStarEmblem,
  WorldChartsEmblem,
} from '@/components/emblems';
import { PressableScale } from '@/components/pressable-scale';
import { Sticker } from '@/components/sticker';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
import { packable } from '@/lib/blind-pack';
import {
  loadBestStreaks,
  loadBlindTest,
  loadLikedTracks,
  type BestStreaks,
  type BlindTestResult,
} from '@/lib/discovery-storage';
import { orbitPose } from '@/lib/orbit';

type Mode = {
  key: string;
  emblem: (size: number) => ReactNode;
  eyebrow: string;
  title: string;
  blurb: string;
  stat: string;
  statLabel: string;
  cta: string;
  href?: Href;
  /** A hand-placed sticker on the card, e.g. "Recommended". */
  badge?: string;
};

const ORBIT_RADIUS = 520; // matches lib/orbit.ts

export default function PlayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const daily = useDailyDrop();
  const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });
  const [test, setTest] = useState<BlindTestResult | null>(null);
  const [sendable, setSendable] = useState(0);
  const [focused, setFocused] = useState(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      daily.refresh();
      loadBestStreaks().then(setBest);
      loadBlindTest().then(setTest);
      loadLikedTracks().then((liked) => setSendable(liked.filter(packable).length));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const d = daily.drop;
  const dropCta = !d
    ? 'No drop today'
    : daily.played === 0
      ? "Play today's 5"
      : daily.active
        ? `Continue · ${daily.played}/5`
        : daily.guess == null
          ? 'Make your guess'
          : 'See your songs';
  const dropHref: Href | undefined = !d
    ? undefined
    : daily.active
      ? '/drop-play'
      : daily.guess == null
        ? '/drop-guess'
        : '/drop-results';

  const modes: Mode[] = [
    {
      key: 'drop',
      emblem: (s) => <DailyDropEmblem size={s} />,
      eyebrow: d ? `Daily · No. ${d.number}` : 'Daily',
      title: 'Daily Drop',
      blurb: "Same five songs for everybody today. One of them is secretly huge. Bet you can't tell which.",
      stat: String(daily.streak),
      statLabel: daily.streak === 1 ? 'day streak' : 'day streak',
      cta: dropCta,
      href: dropHref,
    },
    {
      key: 'h2h',
      emblem: (s) => <HeadToHeadEmblem size={s} />,
      eyebrow: 'Endless · 2 songs',
      title: 'Head to Head',
      blurb: 'Two songs, no names. Pick the one more people listen to. Winner stays on. Harder than it sounds, trust me.',
      badge: 'Recommended',
      stat: String(best.h2h),
      statLabel: 'best streak',
      cta: 'Play',
      href: '/play-h2h',
    },
    {
      key: 'world',
      emblem: (s) => <WorldChartsEmblem size={s} />,
      eyebrow: 'Charts · 18 countries',
      title: 'World Charts',
      blurb: "What's number one in Seoul, Lagos or São Paulo right now. See what's climbing, or hear a country's top songs blind.",
      stat: '18',
      statLabel: 'countries, updated daily',
      cta: 'Open the charts',
      href: '/charts',
    },
    {
      key: 'test',
      emblem: (s) => <BlindTestEmblem size={s} />,
      eyebrow: 'Test · 10 songs',
      title: 'Blind Spot Test',
      blurb: 'Tell us the genres you swear you hate. We sneak five of them into the next ten songs and see what happens.',
      stat: test ? `${test.neverLiked}/5` : '—',
      statLabel: test ? `of your nevers liked` : 'not taken yet',
      cta: test ? 'Retake' : 'Start',
      href: '/blind-test',
    },
    {
      key: 'pack',
      emblem: (s) => <BlindPackEmblem size={s} />,
      eyebrow: 'Send · 5 songs',
      title: 'Blind Pack',
      blurb: 'Pick five songs you found and send them to a friend. They listen blind, and you find out if they actually get you.',
      stat: String(sendable),
      statLabel: 'songs ready to send',
      cta: 'Build a pack',
      href: '/pack-send',
    },
    {
      key: 'spot',
      emblem: (s) => <SpotTheStarEmblem size={s} />,
      eyebrow: 'Endless · 4 tiles',
      title: 'Spot the Star',
      blurb: 'Four songs, and one of them has a million-plus listeners. Your ears against the charts.',
      stat: String(best.spot),
      statLabel: 'best streak',
      cta: 'Play',
      href: '/play-spot',
    },
  ];

  // Emblems ride the orbit; only the focused mode's details show, full width.
  const itemWidth = Math.round(width * 0.42);
  const sidePad = (width - itemWidth) / 2;
  const orbitHeight = Math.min(Math.round(height * 0.3), 260);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

  function settle(x: number) {
    const i = Math.max(0, Math.min(modes.length - 1, Math.round(x / itemWidth)));
    if (i !== focused) {
      setFocused(i);
      Haptics.selectionAsync();
    }
  }

  function goTo(i: number) {
    scrollRef.current?.scrollTo({ x: i * itemWidth, animated: true });
    if (i !== focused) {
      setFocused(i);
      Haptics.selectionAsync();
    }
  }

  const mode = modes[focused];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <ThemedText type="eyebrow">Pick a game · {modes.length} modes</ThemedText>
        <ThemedText type="hero">Play</ThemedText>
        <ThemedText style={styles.hint}>swipe the orbit →</ThemedText>
      </View>

      <View style={{ height: orbitHeight }}>
        {/* The orbit the symbols ride on. */}
        <Svg width={width} height={orbitHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Circle
            cx={width / 2}
            cy={orbitHeight / 2 + ORBIT_RADIUS}
            r={ORBIT_RADIUS}
            stroke={Colors.textTertiary}
            strokeWidth={1.5}
            strokeDasharray="2 8"
            fill="none"
          />
        </Svg>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={itemWidth}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: sidePad }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}>
          {modes.map((m, i) => (
            <OrbitEmblem key={m.key} index={i} itemWidth={itemWidth} height={orbitHeight} scrollX={scrollX} onPress={() => goTo(i)}>
              {m.emblem(Math.round(orbitHeight * 0.62))}
            </OrbitEmblem>
          ))}
        </Animated.ScrollView>
      </View>

      <Animated.View key={mode.key} entering={FadeInDown.duration(260)} style={styles.details}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <ThemedText type="eyebrow" style={styles.eyebrow}>
              {mode.eyebrow}
            </ThemedText>
            <ThemedText type="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {mode.title}
            </ThemedText>
          </View>
          {mode.badge && (
            <View style={styles.badge}>
              <Sticker label={mode.badge} />
            </View>
          )}
        </View>
        <ThemedText style={styles.blurb}>{mode.blurb}</ThemedText>
        <View style={styles.statRow}>
          <ThemedText type="number">{mode.stat}</ThemedText>
          <ThemedText type="eyebrow" style={styles.statLabel}>
            {mode.statLabel}
          </ThemedText>
        </View>
        <PressableScale onPress={() => mode.href && router.push(mode.href)} disabled={!mode.href} style={[styles.cta, !mode.href && styles.ctaOff]}>
          <ThemedText type="label" style={styles.ctaText}>
            {mode.cta}
          </ThemedText>
        </PressableScale>
      </Animated.View>

      <View style={styles.dots}>
        {modes.map((m, i) => (
          <Pressable key={m.key} onPress={() => goTo(i)} hitSlop={8} accessibilityLabel={m.title}>
            <View style={[styles.dot, focused === i && styles.dotOn]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function OrbitEmblem({
  index,
  itemWidth,
  height,
  scrollX,
  onPress,
  children,
}: {
  index: number;
  itemWidth: number;
  height: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
  children: ReactNode;
}) {
  const pose = useAnimatedStyle(() => {
    const p = orbitPose((scrollX.get() - index * itemWidth) / itemWidth);
    return {
      opacity: p.opacity,
      transform: [{ translateY: p.translateY * 0.35 }, { scale: p.scale }, { rotate: `${p.rotate}deg` }],
    };
  });
  return (
    <Pressable onPress={onPress} style={{ width: itemWidth, height }}>
      <Animated.View style={[styles.emblemSlot, pose]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, gap: Spacing.xs, marginBottom: Spacing.md },
  hint: { fontFamily: Fonts.note, fontSize: 20, lineHeight: 22, color: Colors.textSecondary, transform: [{ rotate: '-3deg' }], alignSelf: 'flex-start', marginTop: 2 },
  emblemSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  titleText: { flex: 1, gap: Spacing.xs },
  eyebrow: { color: Colors.signal },
  badge: { marginTop: -6 },
  blurb: { color: Colors.textSecondary, fontSize: 16, lineHeight: 23 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  statLabel: { flexShrink: 1 },
  cta: { backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingVertical: Spacing.md, alignItems: 'center', marginTop: 'auto' },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: Colors.accentText },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  dot: { width: 6, height: 6, borderRadius: Radius.round, backgroundColor: Colors.textTertiary },
  dotOn: { width: 18, backgroundColor: Colors.signal },
});
