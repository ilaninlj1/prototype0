import * as Haptics from 'expo-haptics';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import {
  BlindPackEmblem,
  BlindTestEmblem,
  DailyDropEmblem,
  HeadToHeadEmblem,
  SpotTheStarEmblem,
} from '@/components/emblems';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
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
      blurb: 'Five songs, blind, the same for everyone. One of them is secretly famous. Find it.',
      stat: String(daily.streak),
      statLabel: daily.streak === 1 ? 'day streak' : 'day streak',
      cta: dropCta,
      href: dropHref,
    },
    {
      key: 'test',
      emblem: (s) => <BlindTestEmblem size={s} />,
      eyebrow: 'Test · 10 songs',
      title: 'Blind Spot Test',
      blurb: "Pick the genres you'd never play. Half of the next ten songs are secretly from them.",
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
      blurb: 'Send five of your finds as a link. A friend hears them blind in their browser and sees how well your taste matches.',
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
      blurb: 'Four blind songs. One artist has over a million listeners. Hear it, pick it, keep the streak alive.',
      stat: String(best.spot),
      statLabel: 'best streak',
      cta: 'Play',
      href: '/play-spot',
    },
    {
      key: 'h2h',
      emblem: (s) => <HeadToHeadEmblem size={s} />,
      eyebrow: 'Endless · 2 songs',
      title: 'Head to Head',
      blurb: 'Two blind songs. Which artist has more listeners? The winner stays, and the gap keeps shrinking.',
      stat: String(best.h2h),
      statLabel: 'best streak',
      cta: 'Play',
      href: '/play-h2h',
    },
  ];

  const itemWidth = Math.round(width * 0.64);
  const sidePad = (width - itemWidth) / 2;
  const cardHeight = Math.min(Math.round(height * 0.58), 500);

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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.header}>
        <ThemedText type="eyebrow">Pick a game · {modes.length} modes</ThemedText>
        <ThemedText type="hero">Play</ThemedText>
      </View>

      <View style={styles.stage}>
      <View style={{ height: cardHeight + 90 }}>
        {/* The orbit the cards ride on. */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Circle
            cx={width / 2}
            cy={cardHeight / 2 + ORBIT_RADIUS}
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
            <OrbitCard
              key={m.key}
              index={i}
              itemWidth={itemWidth}
              height={cardHeight}
              scrollX={scrollX}
              focused={focused === i}
              onPressUnfocused={() => goTo(i)}>
              <ModeCard mode={m} focused={focused === i} onPlay={() => m.href && router.push(m.href)} />
            </OrbitCard>
          ))}
        </Animated.ScrollView>
      </View>
      </View>

      {/* Every mode at a glance; tap to fly to it. */}
      <View style={styles.strip}>
        {modes.map((m, i) => (
          <Pressable key={m.key} onPress={() => goTo(i)} style={styles.stripItem} accessibilityLabel={m.title}>
            <View style={{ opacity: focused === i ? 1 : 0.45 }}>{m.emblem(30)}</View>
            <View style={[styles.stripMark, focused === i && styles.stripMarkOn]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function OrbitCard({
  index,
  itemWidth,
  height,
  scrollX,
  focused,
  onPressUnfocused,
  children,
}: {
  index: number;
  itemWidth: number;
  height: number;
  scrollX: SharedValue<number>;
  focused: boolean;
  onPressUnfocused: () => void;
  children: ReactNode;
}) {
  const pose = useAnimatedStyle(() => {
    const p = orbitPose((scrollX.get() - index * itemWidth) / itemWidth);
    return {
      opacity: p.opacity,
      transform: [{ translateY: p.translateY }, { scale: p.scale }, { rotate: `${p.rotate}deg` }],
    };
  });
  return (
    <Animated.View style={[{ width: itemWidth, height, zIndex: focused ? 2 : 1 }, pose]}>
      {focused ? (
        children
      ) : (
        <Pressable style={styles.fill} onPress={onPressUnfocused}>
          {children}
        </Pressable>
      )}
    </Animated.View>
  );
}

function ModeCard({ mode, focused, onPlay }: { mode: Mode; focused: boolean; onPlay: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {mode.emblem(focused ? 112 : 96)}
        <View style={styles.stat}>
          <ThemedText type="number">{mode.stat}</ThemedText>
          <ThemedText type="eyebrow" style={styles.statLabel}>
            {mode.statLabel}
          </ThemedText>
        </View>
      </View>
      <View style={styles.cardText}>
        <ThemedText type="eyebrow" style={styles.cardEyebrow}>
          {mode.eyebrow}
        </ThemedText>
        <ThemedText type="title" numberOfLines={2}>
          {mode.title}
        </ThemedText>
        <ThemedText style={styles.blurb} numberOfLines={4}>
          {mode.blurb}
        </ThemedText>
      </View>
      <PressableScale onPress={onPlay} disabled={!focused || !mode.href} style={[styles.cta, !mode.href && styles.ctaOff]}>
        <ThemedText type="label" style={styles.ctaText}>
          {mode.cta}
        </ThemedText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, gap: Spacing.xs, marginBottom: Spacing.lg },
  fill: { flex: 1 },
  stage: { flex: 1, justifyContent: 'center' },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stat: { alignItems: 'flex-end', maxWidth: '50%' },
  statLabel: { textAlign: 'right' },
  cardText: { gap: Spacing.xs },
  cardEyebrow: { color: Colors.signal },
  blurb: { color: Colors.textSecondary, fontSize: 15, lineHeight: 21 },
  cta: { backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingVertical: Spacing.md, alignItems: 'center' },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: Colors.accentText },
  strip: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, paddingBottom: Spacing.md },
  stripItem: { alignItems: 'center', gap: 6 },
  stripMark: { width: 16, height: 3, borderRadius: Radius.round, backgroundColor: 'transparent' },
  stripMarkOn: { backgroundColor: Colors.signal },
});
