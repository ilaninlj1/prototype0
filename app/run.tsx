import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DarkRoom } from '@/components/dark-room';
import { KnockTester } from '@/components/run/knock-tester';
import { RunLive } from '@/components/run/run-live';
import { RunSetup } from '@/components/run/run-setup';
import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Spacing, TapTarget } from '@/constants/theme';
import { useLightStatusBar } from '@/hooks/use-light-status-bar';
import { useRunSession } from '@/hooks/use-run-session';
import { loadRunProfile, loadRuns, saveRunProfile } from '@/lib/run-storage';
import { EMPTY_PROFILE, type Goal, type RunProfile, type SongsMode } from '@/lib/run-types';

/** Run mode: pick how hard and which songs, run with the phone away, then the reveal. */
export default function RunScreen() {
  useLightStatusBar();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const run = useRunSession();
  const [profile, setProfile] = useState<RunProfile>(EMPTY_PROFILE);
  const [hasRuns, setHasRuns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'denied' | 'unsupported' | null>(null);
  const [goal, setGoal] = useState<Goal>('easy');
  const [knock, setKnock] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadRunProfile().then(setProfile);
      loadRuns().then((r) => setHasRuns(r.length > 0));
    }, [])
  );

  const start = async (o: { goal: Goal; songs: SongsMode; typedPace: number | null; noGps?: boolean }) => {
    setBusy(true);
    setGoal(o.goal);
    const result = await run.start(o);
    setBusy(false);
    setProblem(result === 'ok' ? null : result);
  };

  const end = async () => {
    const id = await run.end();
    if (id) router.replace({ pathname: '/run-reveal', params: { id, fresh: '1' } });
    else router.back();
  };

  const changeProfile = (p: RunProfile) => {
    setProfile(p);
    void saveRunProfile(p);
  };

  if (run.state.phase === 'running')
    return (
      <DarkRoom>
        <RunLive state={run.state} goal={goal} onLike={run.like} onSkip={run.skip} onBack={run.back} onEnd={end} />
      </DarkRoom>
    );

  return (
    <DarkRoom>
      <View style={[styles.room, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Run</ThemedText>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={DarkColors.text} />
          </Pressable>
        </View>
        <ThemedText style={styles.intro}>
          Songs that match your stride. Put your phone away, run, and find out what you heard at the end.
        </ThemedText>
        <RunSetup
          profile={profile}
          busy={busy}
          problem={problem}
          hasRuns={hasRuns}
          onStart={start}
          onKnock={() => setKnock(true)}
          onRuns={() => router.push('/runs')}
        />
        {knock ? <KnockTester profile={profile} onChange={changeProfile} onClose={() => setKnock(false)} /> : null}
      </View>
    </DarkRoom>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: DarkColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  title: { fontFamily: Fonts.display, fontSize: 34, color: DarkColors.text },
  close: { width: TapTarget, height: TapTarget, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.sm },
  intro: { fontSize: 16, lineHeight: 22, color: DarkColors.textSecondary, paddingHorizontal: Spacing.lg, marginTop: Spacing.xs, marginBottom: Spacing.xl },
});
