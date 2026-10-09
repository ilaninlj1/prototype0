import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedReaction, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditionView } from '@/components/edition/edition-view';
import { loadSkia } from '@/components/print/load-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { markEditionSeen, useEditions } from '@/hooks/use-editions';
import { usePlayback } from '@/hooks/use-playback';
import { frameLabel, timeline, TOTAL, type SceneKind } from '@/lib/edition';

const KIND: Record<SceneKind, string> = { intro: 'INTRO', flow: 'FLOW', terrain: 'TERRAIN', orbit: 'ORBIT', orb: 'ORB', lockup: 'EDITION' };
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * An Edition: your last five finds as a ~32-second reel. Each song's scene
 * plays its preview (streamed, as everywhere in the app); the reel's frame
 * counter is its own clock. Tap to pause, swipe down or ✕ to leave.
 */
export default function EditionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ n?: string }>();
  const { editions } = useEditions();
  const edition = editions.find((e) => e.number === Number(params.n)) ?? null;
  const scenes = useMemo(() => (edition ? timeline(edition) : []), [edition]);
  const ends = useMemo(() => scenes.map((s) => s.end), [scenes]);
  const { player, playPreview, stopPreview } = usePlayback();

  const clock = useSharedValue(0);
  const running = useSharedValue(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFrameCallback((f) => {
    if (!running.get() || !f.timeSincePreviousFrame) return;
    clock.set(Math.min(TOTAL, clock.get() + f.timeSincePreviousFrame / 1000));
  });
  useAnimatedReaction(
    () => {
      const t = clock.get();
      let i = 0;
      while (i < ends.length - 1 && t >= ends[i]) i++;
      return t >= TOTAL ? -1 : i;
    },
    (i, prev) => {
      if (i === prev) return;
      if (i === -1) runOnJS(setDone)(true);
      else runOnJS(setSceneIndex)(i);
    },
    [ends]
  );
  // The frame counter, ten times a second (it's a label, not the animation).
  useEffect(() => {
    const id = setInterval(() => setFrame(clock.get()), 100);
    return () => clearInterval(id);
  }, [clock]);

  useEffect(() => {
    if (edition) markEditionSeen(edition.number);
  }, [edition]);

  // Each song's scene plays its preview; the lockup lets the last one fade out.
  useEffect(() => {
    const scene = scenes[sceneIndex];
    if (!scene || !edition) return;
    if (fadeRef.current) clearInterval(fadeRef.current);
    if (scene.song != null) {
      const url = edition.songs[scene.song].previewUrl;
      if (url) playPreview(url);
    } else if (scene.kind === 'lockup') {
      fadeRef.current = setInterval(() => {
        const v = Math.max(0, player.volume - 0.05);
        player.volume = v;
        if (v === 0 && fadeRef.current) {
          clearInterval(fadeRef.current);
          player.pause();
        }
      }, 120);
    }
    // Runs when the scene changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex, scenes]);
  useEffect(
    () => () => {
      if (fadeRef.current) clearInterval(fadeRef.current);
      stopPreview();
    },
    [stopPreview]
  );

  function togglePause() {
    if (done) return;
    const next = !paused;
    setPaused(next);
    running.set(!next);
    if (next) player.pause();
    else player.play();
  }

  function replay() {
    setDone(false);
    setPaused(false);
    // The scene reaction sees the clock back at 0 and starts the intro again.
    clock.set(0);
    running.set(true);
  }

  async function share() {
    if (!edition) return;
    try {
      await loadSkia();
      const { renderEditionPoster } = await import('@/components/edition/edition-poster');
      const base64 = await renderEditionPoster(edition);
      if (!base64) throw new Error('nothing drawn');
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, `blindspot-edition-${edition.number}.png`);
      file.write(base64, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Share your Blindspot edition' });
    } catch {
      setNote('Couldn’t open sharing here.');
    }
  }

  const close = () => router.back();
  const swipeDown = Gesture.Pan()
    .activeOffsetY(20)
    .onEnd((e) => {
      if (e.translationY > 120) runOnJS(close)();
    });
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok) runOnJS(togglePause)();
  });

  if (!edition) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ThemedText style={styles.dim}>This edition isn’t on this phone.</ThemedText>
        <Pressable onPress={close} style={[Ui.outlineButton, styles.closeWide]}>
          <ThemedText style={Ui.label}>Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  const scene = scenes[Math.max(0, sceneIndex)];
  const song = scene?.song != null ? edition.songs[scene.song] : null;
  const date = new Date(edition.createdAt).toDateString().toUpperCase();

  return (
    <GestureDetector gesture={Gesture.Exclusive(swipeDown, tap)}>
      <View style={styles.screen}>
        <EditionView edition={edition} width={width} height={height} clock={clock} />

        <View style={[styles.top, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
          <ThemedText style={styles.mono}>
            SC {pad2(Math.max(0, sceneIndex) + 1)}/{pad2(scenes.length)} — {scene ? KIND[scene.kind] : ''}
          </ThemedText>
          <ThemedText style={styles.mono}>{frameLabel(frame)}</ThemedText>
        </View>
        <Pressable onPress={close} hitSlop={12} style={[styles.x, { top: insets.top + Spacing.xl + Spacing.sm }]} accessibilityLabel="Close the edition">
          <Ionicons name="close" size={26} color={Colors.text} />
        </Pressable>

        {scene?.kind === 'intro' && (
          <Animated.View key="intro" entering={FadeIn.duration(500)} style={styles.middle} pointerEvents="none">
            <ThemedText style={styles.brand}>BLINDSPOT</ThemedText>
            <ThemedText style={styles.mono}>
              EDITION No. {edition.number} · {date}
            </ThemedText>
          </Animated.View>
        )}

        {song && (
          <Animated.View key={`song-${sceneIndex}`} entering={FadeIn.delay(600).duration(500)} style={[styles.bottom, { bottom: insets.bottom + Spacing.xxl }]} pointerEvents="none">
            <ThemedText style={styles.mono}>
              {pad2(scene!.song! + 1)} / {pad2(edition.songs.length)} · FOUND BLIND
            </ThemedText>
            <ThemedText style={styles.title} numberOfLines={2}>
              {song.title}
            </ThemedText>
            <ThemedText style={styles.dim} numberOfLines={1}>
              {song.artist}
            </ThemedText>
            {!!song.recipe.label && <ThemedText style={styles.mono}>{song.recipe.label}</ThemedText>}
          </Animated.View>
        )}

        {scene?.kind === 'lockup' && (
          <Animated.View key="lockup" entering={FadeIn.duration(500)} style={[styles.lockupText, { top: height / 2 - 140 }]} pointerEvents="none">
            <ThemedText style={styles.brand}>EDITION No. {edition.number}</ThemedText>
            <ThemedText style={styles.mono}>
              {edition.songs.length} FOUND BLIND · {date}
            </ThemedText>
          </Animated.View>
        )}

        {paused && !done && (
          <View style={styles.pausedBadge} pointerEvents="none">
            <ThemedText style={styles.mono}>PAUSED · TAP TO PLAY</ThemedText>
          </View>
        )}

        {done && (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.endRow, { bottom: insets.bottom + Spacing.xxl }]}>
            <Pressable onPress={replay} style={[Ui.outlineButton, styles.endButton]} accessibilityRole="button">
              <Ionicons name="refresh" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Replay</ThemedText>
            </Pressable>
            <Pressable onPress={share} style={[Ui.outlineButton, styles.endButton, styles.primary]} accessibilityRole="button">
              <Ionicons name="share-outline" size={16} color={Colors.accentText} />
              <ThemedText style={[Ui.label, { color: Colors.accentText }]}>Share</ThemedText>
            </Pressable>
            <Pressable onPress={close} style={[Ui.outlineButton, styles.endButton]} accessibilityRole="button">
              <ThemedText style={Ui.label}>Done</ThemedText>
            </Pressable>
          </Animated.View>
        )}
        {!!note && <ThemedText style={[styles.dim, styles.note]}>{note}</ThemedText>}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1426' },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  top: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  x: { position: 'absolute', right: Spacing.lg },
  mono: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: Colors.textSecondary },
  middle: { position: 'absolute', left: 0, right: 0, top: '42%', alignItems: 'center', gap: Spacing.sm },
  brand: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: 2, color: Colors.text },
  bottom: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, gap: 4 },
  title: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 30, color: Colors.text },
  dim: { color: Colors.textSecondary },
  lockupText: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: Spacing.sm },
  pausedBadge: { position: 'absolute', alignSelf: 'center', top: '50%' },
  endRow: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, flexDirection: 'row', gap: Spacing.sm },
  endButton: { flex: 1, flexDirection: 'row', gap: 6, height: 48 },
  primary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  closeWide: { paddingHorizontal: Spacing.xl },
  note: { position: 'absolute', alignSelf: 'center', bottom: 24 },
});
