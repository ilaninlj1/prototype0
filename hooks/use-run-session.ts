import { setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { saveLike } from '@/components/like-button';
import { usePlayback } from '@/hooks/use-playback';
import { loadLikedTracks, loadSwipeHistory, saveSwipeHistory } from '@/lib/discovery-storage';
import { heardIds } from '@/lib/dark-map';
import { hideFromDiscovery } from '@/lib/human-check-api';
import { alreadyKnown } from '@/lib/known-artists';
import { runCandidates } from '@/lib/pool';
import { goalPace as goalPaceFor, restride, settledPace, steerFor, targetSpm } from '@/lib/run-goal';
import { seekJump } from '@/lib/run-gate';
import { runNative } from '@/lib/run-native';
import { createPaceTracker, haversineM } from '@/lib/run-pace';
import { legsLiked } from '@/lib/run-reveal';
import { createSim } from '@/lib/run-sim';
import { beatFor, pickNext, type RunCandidate } from '@/lib/run-songs';
import { createMotionTracker } from '@/lib/run-steps';
import { loadRunProfile, saveRun, saveRunProfile } from '@/lib/run-storage';
import type { Fix, Goal, RunGap, RunPoint, RunProfile, RunRecord, RunSong, SongsMode, Steer } from '@/lib/run-types';
import { soundFor } from '@/lib/sound-index';

const POINT_MS = 5000;
const STEER_MS = 60_000;
const CALIBRATION_MS = 90_000;
const FADE_MS = 2000;
const DEFAULT_SPM = 160;

export type LiveState = {
  phase: 'idle' | 'running' | 'ended';
  elapsedMs: number;
  distanceM: number;
  pace: number | null;
  spm: number | null;
  beat: number | null;
  steer: Steer | null;
  calibrating: boolean;
  song: RunSong | null;
  index: number;
  notice: string | null;
  simulated: boolean;
  likedFlash: number;
};

const IDLE: LiveState = {
  phase: 'idle', elapsedMs: 0, distanceM: 0, pace: null, spm: null, beat: null, steer: null, calibrating: true,
  song: null, index: 0, notice: null, simulated: false, likedFlash: 0,
};

type Session = {
  startedAt: number;
  goal: Goal;
  songs: SongsMode;
  typedPace: number | null;
  goalPace: number | null;
  firstRun: boolean;
  profile: RunProfile;
  motion: ReturnType<typeof createMotionTracker>;
  pace: ReturnType<typeof createPaceTracker>;
  sim: ReturnType<typeof createSim> | null;
  stops: (() => void)[];
  points: RunPoint[];
  played: RunSong[];
  current: RunSong | null;
  next: { cand: RunCandidate; blind: boolean } | null;
  nextPickedAt: number;
  usedIds: Set<number>;
  usedArtists: Set<string>;
  blindPool: RunCandidate[];
  liked: RunCandidate[];
  steer: Steer | null;
  lastSteerAt: number;
  naturalSpm: number | null;
  spmTarget: number;
  gaps: RunGap[];
  hiddenSince: number | null;
  notice: { text: string; until: number } | null;
  lastPos: { pos: number; wall: number } | null;
  fading: boolean;
  /** When the current song started (wall clock): the player's status is stale for a moment after a change. */
  songWall: number;
  ended: boolean;
  likedFlash: number;
};

/** Speed (m/s) over the fixes in the last windowMs, or null with under 5 s of them. */
function recentSpeed(fixes: Fix[], now: number, windowMs: number): number | null {
  const win = fixes.filter((f) => f.t >= now - windowMs);
  if (win.length < 2 || win[win.length - 1].t - win[0].t < 5000) return null;
  let m = 0;
  for (let i = 1; i < win.length; i++) m += haversineM(win[i - 1], win[i]);
  return m / ((win[win.length - 1].t - win[0].t) / 1000);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * One run, start to end: steps and knocks from the accelerometer, pace from GPS (or the sim on the web),
 * songs picked to the stride and crossfaded on the shared player, steering every minute, and the record saved at the end.
 */
export function useRunSession() {
  const playback = usePlayback();
  const pb = useRef(playback);
  pb.current = playback;
  const [state, setState] = useState<LiveState>(IDLE);
  const ref = useRef<Session | null>(null);

  const now = () => Date.now();
  const elapsed = (s: Session) => now() - s.startedAt;

  const publish = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    const t = now();
    const spm = s.sim ? s.sim.spm() : s.motion.spm(t);
    setState({
      phase: s.ended ? 'ended' : 'running',
      elapsedMs: elapsed(s),
      distanceM: s.pace.distanceM(),
      pace: s.pace.pace(t),
      spm,
      beat: s.current?.beat ?? null,
      steer: s.steer,
      calibrating: elapsed(s) < CALIBRATION_MS,
      song: s.current,
      index: s.played.length,
      notice: s.notice && s.notice.until > t ? s.notice.text : null,
      simulated: s.sim != null,
      likedFlash: s.likedFlash,
    });
  }, []);

  const lockScreen = useCallback((s: Session) => {
    const song = s.current;
    if (!song || Platform.OS === 'web') return;
    try {
      pb.current.player.setActiveForLockScreen(
        true,
        { title: song.blind ? `Blind song #${s.played.length}` : song.track.trackName, artist: song.blind ? 'Blindspot run' : song.track.artistName },
        { showSeekForward: true, showSeekBackward: true }
      );
    } catch {
      // the lock screen is a bonus
    }
  }, []);

  const pickAhead = useCallback((s: Session) => {
    s.next = pickNext({
      blindPool: s.blindPool, liked: s.liked, mode: s.songs, index: s.played.length, spm: s.spmTarget,
      steer: s.steer ?? 'hold', usedIds: s.usedIds, usedArtists: s.usedArtists, rng: Math.random,
    });
    s.nextPickedAt = now();
    pb.current.peekLoad(s.next?.cand.track.previewUrl);
  }, []);

  const finishCurrent = useCallback((s: Session) => {
    if (s.current) s.current.end = elapsed(s);
  }, []);

  /** Makes `next` the current song (after a crossfade, the peek player already has it). */
  const advance = useCallback(
    (s: Session) => {
      finishCurrent(s);
      const n = s.next;
      if (!n) {
        s.current = null;
        pb.current.stopPreview();
        return;
      }
      const song: RunSong = {
        track: n.cand.track, start: elapsed(s), end: elapsed(s), tempo: n.cand.tempo, energy: n.cand.energy,
        beat: beatFor(n.cand.tempo, s.spmTarget), blind: n.blind, steer: s.steer ?? 'hold', liked: null, kept: false,
      };
      s.played.push(song);
      s.current = song;
      s.usedIds.add(n.cand.track.id);
      s.usedArtists.add(n.cand.artist);
      s.sim?.setSong(song);
      s.lastPos = null;
      s.next = null;
      s.songWall = now();
      // After promotePeek this is a no-op and the song keeps playing; otherwise it starts the song.
      pb.current.playPreview(song.track.previewUrl);
      pickAhead(s);
      // The provider swaps its player on the next render, so the lock screen waits for it.
      setTimeout(() => ref.current === s && !s.ended && lockScreen(s), 400);
      publish();
    },
    [finishCurrent, pickAhead, lockScreen, publish]
  );

  const crossfade = useCallback(
    (s: Session) => {
      const url = s.next?.cand.track.previewUrl;
      if (!url || s.fading) return;
      s.fading = true;
      const from = now();
      const step = () => {
        if (ref.current !== s || s.ended) return;
        const k = Math.min(1, (now() - from) / FADE_MS);
        pb.current.setMix(k);
        if (k < 1) requestAnimationFrame(step);
        else {
          pb.current.promotePeek(url);
          s.fading = false;
          advance(s);
        }
      };
      requestAnimationFrame(step);
      // rAF stops while the screen is off: never leave a fade hanging.
      setTimeout(() => {
        if (s.fading && ref.current === s && !s.ended) {
          s.fading = false;
          advance(s);
        }
      }, FADE_MS + 1500);
    },
    [advance]
  );

  const like = useCallback(() => {
    const s = ref.current;
    const song = s?.current;
    if (!s || !song || s.ended || song.liked === 'you') return;
    song.liked = 'you';
    song.kept = true;
    s.likedFlash += 1;
    void saveLike({ ...song.track, via: 'run' });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    publish();
  }, [publish]);

  const skip = useCallback(() => {
    const s = ref.current;
    if (!s || s.ended || s.fading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance(s);
  }, [advance]);

  const back = useCallback(() => {
    const s = ref.current;
    if (!s || s.ended || s.fading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prev = s.played[s.played.length - 2];
    if (!prev) {
      void pb.current.player.seekTo(0);
      return;
    }
    // Play the last song again; the one that was on comes back after it.
    const was = s.current!;
    s.usedIds.delete(was.track.id);
    s.next = { cand: { track: prev.track, tempo: prev.tempo, energy: prev.energy, artist: prev.track.artistName }, blind: prev.blind };
    advance(s);
    s.next = { cand: { track: was.track, tempo: was.tempo, energy: was.energy, artist: was.track.artistName }, blind: was.blind };
    pb.current.peekLoad(was.track.previewUrl);
  }, [advance]);

  const tick = useCallback(() => {
    const s = ref.current;
    if (!s || s.ended) return;
    const t = now();
    const at = elapsed(s);
    if (s.sim) s.pace.push(s.sim.fixAt(t));
    const spm = s.sim ? s.sim.spm() : s.motion.spm(t);

    // A point every 5 s.
    const lastPoint = s.points[s.points.length - 1];
    if (!lastPoint || at - lastPoint.t >= POINT_MS) {
      const fix = s.pace.last();
      const fresh = fix && t - fix.t < 10_000;
      s.points.push({ t: at, lat: fresh ? fix.lat : null, lng: fresh ? fix.lng : null, speed: recentSpeed(s.pace.fixes(), t, 10_000), spm });
    }

    // Calibration: learn the natural step rate, then aim songs at it.
    if (at < CALIBRATION_MS) {
      if (spm != null) s.spmTarget = spm;
    } else if (s.naturalSpm == null) {
      s.naturalSpm = median(s.points.filter((p) => p.t >= 30_000 && p.spm != null).map((p) => p.spm!)) ?? spm ?? s.spmTarget;
      s.spmTarget = s.naturalSpm;
      s.lastSteerAt = t - STEER_MS; // steer right away
    } else {
      // A walk became a run, or a run a walk: learn the new stride and pick the next song for it.
      const stride = restride(s.naturalSpm, s.points, at);
      if (stride != null) {
        s.naturalSpm = stride;
        s.spmTarget = targetSpm(stride, spm ?? stride, s.steer ?? 'hold');
        if (!s.fading) pickAhead(s);
      }
    }

    // A first run with no goal takes its settled pace from minutes 2 to 4.
    if (s.goalPace == null && at > 240_000) s.goalPace = settledPace(s.points);

    // Steering every minute once there's a pace.
    if (s.naturalSpm != null && t - s.lastSteerAt >= STEER_MS) {
      const pace = s.pace.pace(t);
      if (pace != null) {
        s.lastSteerAt = t;
        const steer = steerFor(pace, s.goalPace, { firstRun: s.firstRun });
        const changed = steer !== s.steer;
        s.steer = steer;
        s.spmTarget = targetSpm(s.naturalSpm, spm ?? s.naturalSpm, steer);
        if (changed && !s.fading) pickAhead(s);
      }
    }

    // Keep the next song on the stride: re-pick when it drifted more than 6 % off, at most every 10 s.
    if (s.next && !s.fading && t - s.nextPickedAt > 10_000) {
      const b = beatFor(s.next.cand.tempo, s.spmTarget);
      if (s.next.blind && Math.abs(b - s.spmTarget) / s.spmTarget > 0.06) pickAhead(s);
    }

    // Lock screen jumps, the clip's end, and the crossfade.
    const status = pb.current.status;
    if (s.current && status.isLoaded && !s.fading && t - s.songWall > 1500) {
      const pos = status.currentTime;
      if (s.lastPos) {
        const jump = seekJump(s.lastPos.pos, pos, t - s.lastPos.wall);
        if (jump === 'skip') return void skip();
        if (jump === 'back') return void back();
      }
      s.lastPos = { pos, wall: t };
      const dur = status.duration || 30;
      if (pos >= dur - FADE_MS / 1000 - 0.3 && s.next) crossfade(s);
      else if (status.didJustFinish || (!status.playing && pos >= dur - 0.4)) advance(s);
    }
    publish();
  }, [publish, pickAhead, crossfade, advance, skip, back]);

  const start = useCallback(
    async (o: { goal: Goal; songs: SongsMode; typedPace: number | null; noGps?: boolean }): Promise<'ok' | 'denied' | 'unsupported'> => {
      const native = runNative();
      const simulate = native == null && (Platform.OS === 'web' || __DEV__);
      if (!native && !simulate) return 'unsupported';
      if (native && !o.noGps) {
        const perm = await native.location.requestForegroundPermissionsAsync().catch(() => null);
        if (!perm || perm.status !== 'granted') return 'denied';
      }
      const [profile, history, saved] = await Promise.all([loadRunProfile(), loadSwipeHistory(), loadLikedTracks()]);
      const heard = heardIds(history);
      const savedIds = new Set(saved.map((t) => t.id));
      const all = runCandidates();
      const blindPool = all.filter((c) => !heard.has(c.track.id) && !savedIds.has(c.track.id) && !hideFromDiscovery(c.artist) && !alreadyKnown(c.artist));
      const liked: RunCandidate[] = [];
      for (const track of saved) {
        const sound = soundFor(track.id);
        if (sound && sound.tempo > 0) liked.push({ track, tempo: sound.tempo, energy: sound.energy, artist: track.artistName });
      }
      const spm = profile.naturalSpm ?? DEFAULT_SPM;
      const s: Session = {
        startedAt: now(), goal: o.goal, songs: o.songs, typedPace: o.typedPace, profile,
        goalPace: goalPaceFor(profile, o.goal, o.typedPace), firstRun: profile.easyPace == null && o.typedPace == null,
        motion: createMotionTracker(), pace: createPaceTracker(),
        sim: simulate ? createSim({ spm: 158, speed: 2.5 }) : null,
        stops: [], points: [], played: [], current: null, next: null, nextPickedAt: 0, usedIds: new Set(), usedArtists: new Set(),
        blindPool, liked, steer: null, lastSteerAt: 0, naturalSpm: null, spmTarget: spm, gaps: [], hiddenSince: null,
        notice: simulate ? { text: 'Simulated run: no sensors here', until: now() + 8000 } : null,
        lastPos: null, fading: false, songWall: 0, ended: false, likedFlash: 0,
      };
      ref.current = s;

      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
      if (native) {
        try {
          await native.keepAwake.activateKeepAwakeAsync('run');
          s.stops.push(() => void native.keepAwake.deactivateKeepAwake('run'));
        } catch {
          // the screen may sleep; the gap notice covers it
        }
        try {
          const { Accelerometer } = native.sensors;
          Accelerometer.setUpdateInterval(10);
          const sub = Accelerometer.addListener((m) => {
            const r = s.motion.push({ t: now(), x: m.x, y: m.y, z: m.z });
            if (r.knock && s.profile.knockOn) like();
          });
          s.stops.push(() => sub.remove());
        } catch {
          // no steps: songs hold the starting tempo
        }
        if (!o.noGps) {
          try {
            const loc = native.location;
            const sub = await loc.watchPositionAsync({ accuracy: loc.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (p) =>
              s.pace.push({ t: p.timestamp, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
            );
            s.stops.push(() => sub.remove());
          } catch {
            // no pace: steering holds
          }
        }
      }
      const app = AppState.addEventListener('change', (next) => {
        const t = now();
        if (next !== 'active') s.hiddenSince ??= t;
        else if (s.hiddenSince != null) {
          const away = t - s.hiddenSince;
          if (away > 3000) {
            s.gaps.push({ start: s.hiddenSince - s.startedAt, end: t - s.startedAt });
            const mins = Math.round(away / 60_000);
            const span = mins >= 1 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${Math.round(away / 1000)} seconds`;
            s.notice = { text: `Your phone was locked for ${span}, so that part isn't in your run.`, until: t + 10_000 };
          }
          s.hiddenSince = null;
        }
      });
      s.stops.push(() => app.remove());
      const timer = setInterval(tick, 500);
      s.stops.push(() => clearInterval(timer));

      pickAhead(s);
      advance(s);
      return 'ok';
    },
    [tick, pickAhead, advance, like]
  );

  const end = useCallback(async (): Promise<string | null> => {
    const s = ref.current;
    if (!s || s.ended) return null;
    s.ended = true;
    finishCurrent(s);
    for (const stop of s.stops) stop();
    pb.current.stopPreview();
    try {
      pb.current.player.clearLockScreenControls();
    } catch {
      // nothing to clear
    }
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    const played = s.played.filter((p) => p.end - p.start >= 3000 || p.liked === 'you');
    for (const i of legsLiked(played, s.points, s.gaps)) played[i].liked = 'legs';
    const endedAt = now();
    const naturalSpm = s.naturalSpm ?? median(s.points.filter((p) => p.spm != null).map((p) => p.spm!));
    const record: RunRecord = {
      id: `run-${s.startedAt}`, startedAt: s.startedAt, endedAt, goal: s.goal, songs: s.songs, typedPace: s.typedPace,
      goalPace: s.goalPace, talk: null, naturalSpm, distanceM: s.pace.distanceM(), points: s.points, played, gaps: s.gaps,
      ...(s.sim ? { simulated: true } : {}),
    };
    await saveRun(record);
    if (!s.sim) {
      await saveRunProfile({ ...s.profile, runs: s.profile.runs + 1, naturalSpm: naturalSpm ?? s.profile.naturalSpm });
      const history = await loadSwipeHistory();
      for (const p of played)
        history.push({
          trackId: p.track.id, trackName: p.track.trackName, artistId: p.track.artistId, artistName: p.track.artistName,
          genre: p.track.primaryGenreName, action: p.liked === 'you' ? 'like' : 'skip', timestamp: s.startedAt + p.end,
          listenMs: p.end - p.start, source: 'run',
        });
      await saveSwipeHistory(history);
    }
    publish();
    return record.id;
  }, [finishCurrent, publish]);

  // Leaving the screen mid-run stops everything (the record is only saved through end()).
  useEffect(
    () => () => {
      const s = ref.current;
      if (s && !s.ended) {
        s.ended = true;
        for (const stop of s.stops) stop();
        pb.current.stopPreview();
        void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
      }
    },
    []
  );

  return { state, start, like, skip, back, end };
}
