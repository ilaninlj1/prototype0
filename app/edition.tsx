import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReelCard } from '@/components/edition/reel-card';
import { EditionView } from '@/components/edition/edition-view';
import { loadSkia } from '@/components/print/load-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, Ui } from '@/constants/theme';
import { markEditionSeen, useEditions } from '@/hooks/use-editions';
import { usePlayback } from '@/hooks/use-playback';
import { beatIndex, frameLabel, timecode, timeline, TOTAL, type SceneKind } from '@/lib/edition';
import { expoOut, prog } from '@/lib/reel-ease';

const KIND: Record<SceneKind, string> = {
  intro: 'INTRO',
  voxel: 'VOXEL FIELD',
  wall: 'TYPE WALL',
  data: 'DATA',
  particles: 'PARTICLES',
  interface: 'INTERFACE',
  outro: 'OUTRO',
};
const OR = '#E8461E';
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * An Edition: your last five finds as a 34-second reel in the style of
 * claude-motion-reel.html. Each song's scene plays its preview (streamed, as
 * everywhere in the app). The HUD is the reel's: scene, frame counter,
 * timecode, and beat squares that tick at the song's measured tempo (never a
 * made-up bar count). Tap to pause, swipe down or ✕ to leave.
 */
export default function EditionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // ?at=12.5 opens the reel frozen at that second (for stills and checking a moment).
  const params = useLocalSearchParams<{ n?: string; at?: string }>();
  const at = params.at != null && !Number.isNaN(Number(params.at)) ? Number(params.at) : null;
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
  useEffect(() => {
    if (at == null) return;
    clock.set(Math.min(TOTAL - 0.01, at));
    running.set(false);
  }, [at, clock, running]);

  // Each song's scene plays its preview; the lockup lets the last one fade out.
  useEffect(() => {
    const scene = scenes[sceneIndex];
    if (!scene || !edition) return;
    if (fadeRef.current) clearInterval(fadeRef.current);
    if (scene.song != null) {
      const url = edition.songs[scene.song].previewUrl;
      if (url) playPreview(url);
    } else if (scene.kind === 'outro') {
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
  const local = scene ? frame - scene.start : 0;
  // Over the orange moments the HUD turns dark, as in the reel.
  const dark = (scene?.kind === 'intro' && local >= 2.02) || (scene?.kind === 'outro' && local < 3);
  const hud = { color: dark ? 'rgba(10,10,10,0.78)' : 'rgba(244,241,236,0.72)' };
  const bpm = song ? (song.sound?.tempo ?? 60 / song.recipe.beat) : null;
  const lit = bpm ? beatIndex(local, bpm) : -1;

  return (
    <GestureDetector gesture={Gesture.Exclusive(swipeDown, tap)}>
      <View style={styles.screen}>
        <EditionView edition={edition} width={width} height={height} clock={clock} />
        {scene?.kind === 'interface' && song && <ReelCard song={song} scene={scene} clock={clock} width={width} height={height} local={local} />}
        {scene?.kind === 'voxel' && song && <VoxelCaption key={sceneIndex} title={song.title} artist={song.artist} label={song.recipe.label} start={scene.start} clock={clock} width={width} bottom={insets.bottom} />}

        <View style={[styles.corner, { top: insets.top + 16, left: 18 }]} pointerEvents="none">
          <View style={styles.rec} />
          <Text style={[styles.hud, hud]}>BLINDSPOT — No. {edition.number}</Text>
        </View>
        <View style={[styles.corner, { top: insets.top + 16, right: 18 }]} pointerEvents="none">
          <Text style={[styles.hud, hud]}>
            SC {pad2(Math.max(0, sceneIndex) + 1)}/{pad2(scenes.length)} · {scene ? KIND[scene.kind] : ''}
          </Text>
        </View>
        <View style={[styles.corner, { bottom: insets.bottom + 16, left: 18 }]} pointerEvents="none">
          <Text style={[styles.hud, hud]}>{frameLabel(frame)}</Text>
        </View>
        <View style={[styles.corner, { bottom: insets.bottom + 16, right: 18 }]} pointerEvents="none">
          <Text style={[styles.hud, hud]}>{timecode(frame)}</Text>
          {bpm != null && (
            <>
              <View style={styles.beats}>
                {[0, 1, 2, 3].map((k) => (
                  <View key={k} style={[styles.beat, { borderColor: hud.color }, k === lit && { backgroundColor: hud.color, opacity: 1 }]} />
                ))}
              </View>
              <Text style={[styles.hud, hud]}>{Math.round(bpm)} BPM</Text>
            </>
          )}
        </View>
        <Pressable onPress={close} hitSlop={12} style={[styles.x, { top: insets.top + 40 }]} accessibilityLabel="Close the edition">
          <Ionicons name="close" size={24} color={hud.color} />
        </Pressable>

        {paused && !done && at == null && (
          <View style={styles.pausedBadge} pointerEvents="none">
            <Text style={[styles.hud, hud]}>PAUSED · TAP TO PLAY</Text>
          </View>
        )}

        {done && (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.endRow, { bottom: insets.bottom + 48 }]}>
            <Pressable onPress={replay} style={[Ui.outlineButton, styles.endButton]} accessibilityRole="button">
              <Ionicons name="refresh" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Replay</ThemedText>
            </Pressable>
            <Pressable onPress={share} style={[Ui.outlineButton, styles.endButton, styles.primary]} accessibilityRole="button">
              <Ionicons name="share-outline" size={16} color="#0A0A0A" />
              <ThemedText style={[Ui.label, { color: '#0A0A0A' }]}>Share</ThemedText>
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

/** The voxel field's caption, as in the reel: two big lines rising out of masks, then a mono line. */
function VoxelCaption(props: { title: string; artist: string; label: string | null; start: number; clock: SharedValue<number>; width: number; bottom: number }) {
  const { title, artist, label, start, clock, width, bottom } = props;
  const size = Math.min(width * 0.085, 40);
  const line1 = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - expoOut(prog(clock.get() - start, 0.7, 1.5))) * size * 1.25 }] }));
  const line2 = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - expoOut(prog(clock.get() - start, 0.82, 1.62))) * size * 1.25 }] }));
  const mono = useAnimatedStyle(() => ({ opacity: 0.6 * prog(clock.get() - start, 1.2, 1.6) }));
  return (
    <View style={[styles.caption, { bottom: bottom + 64 }]} pointerEvents="none">
      <View style={[styles.mask, { height: size * 1.15 }]}>
        <Animated.Text style={[styles.capBig, { fontSize: size, lineHeight: size * 1.1 }, line1]} numberOfLines={1}>
          {title}
        </Animated.Text>
      </View>
      <View style={[styles.mask, { height: size * 1.15 }]}>
        <Animated.Text style={[styles.capBig, { fontSize: size, lineHeight: size * 1.1 }, line2]} numberOfLines={1}>
          by <Text style={{ color: OR }}>{artist}.</Text>
        </Animated.Text>
      </View>
      <Animated.Text style={[styles.hud, styles.capMono, mono]}>VOXEL FIELD · {label ?? 'NO SOUND DATA'} · 144 COLUMNS</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  corner: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10 },
  hud: { fontFamily: Fonts.mono, fontSize: 10, lineHeight: 13, letterSpacing: 1.4, textTransform: 'uppercase' },
  rec: { width: 6, height: 6, borderRadius: 3, backgroundColor: OR, shadowColor: OR, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  beats: { flexDirection: 'row', gap: 3 },
  beat: { width: 5, height: 5, borderWidth: 1, opacity: 0.5 },
  x: { position: 'absolute', right: 14 },
  caption: { position: 'absolute', left: 22, right: 22 },
  mask: { overflow: 'hidden' },
  capBig: { fontFamily: Fonts.reelBold, letterSpacing: -1.5, color: '#F4F1EC' },
  capMono: { marginTop: 14, color: 'rgba(244,241,236,0.9)' },
  dim: { color: Colors.textSecondary },
  pausedBadge: { position: 'absolute', alignSelf: 'center', top: '50%' },
  endRow: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, flexDirection: 'row', gap: Spacing.sm },
  endButton: { flex: 1, flexDirection: 'row', gap: 6, height: 48, backgroundColor: 'rgba(10,10,10,0.6)' },
  primary: { backgroundColor: OR, borderColor: OR },
  closeWide: { paddingHorizontal: Spacing.xl },
  note: { position: 'absolute', alignSelf: 'center', bottom: 24 },
});
