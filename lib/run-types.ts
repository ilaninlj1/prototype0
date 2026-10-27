// Run mode's shared shapes (spec docs/superpowers/specs/2026-10-22-run-mode-design.md).
// Pace is seconds per km, speed m/s, times ms; the screens show min/mile and miles.

import type { DiscoveryTrack } from './discovery.ts';

export type Goal = 'easy' | 'steady' | 'push';
export type SongsMode = 'blind' | 'mix' | 'liked';
export type TalkAnswer = 'yes' | 'mostly' | 'no';
/** What the songs are doing to your pace: calming you down, holding, or pushing. */
export type Steer = 'ease' | 'hold' | 'lift';

/** One accelerometer reading: t in ms, x/y/z in g. */
export type AccelSample = { t: number; x: number; y: number; z: number };
/** One GPS fix: t in ms since epoch, accuracy in meters. */
export type Fix = { t: number; lat: number; lng: number; accuracy: number | null };

/** Every 5 s of a run: t in ms since the start, speed in m/s, spm = steps per minute. */
export type RunPoint = { t: number; lat: number | null; lng: number | null; speed: number | null; spm: number | null };

export type RunSong = {
  track: DiscoveryTrack;
  /** ms since the run's start. */
  start: number;
  end: number;
  tempo: number;
  energy: number;
  /** The tempo at half, normal or double time that the song was picked to match. */
  beat: number;
  blind: boolean;
  steer: Steer;
  /** 'you' = liked during the run (saved), 'legs' = your pace picked up (saved only once kept). */
  liked: 'you' | 'legs' | null;
  kept: boolean;
};

/** A stretch the app couldn't measure (the phone was locked or the app was in the background). */
export type RunGap = { start: number; end: number };

export type RunRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  goal: Goal;
  songs: SongsMode;
  typedPace: number | null;
  goalPace: number | null;
  talk: TalkAnswer | null;
  naturalSpm: number | null;
  distanceM: number;
  points: RunPoint[];
  played: RunSong[];
  gaps: RunGap[];
  /** Made by the browser sim or the dev seed, never a real run. */
  simulated?: boolean;
};

export type RunProfile = {
  /** Learned Easy pace in s/km, from talk-test answers. */
  easyPace: number | null;
  naturalSpm: number | null;
  /** True once the person switched tap to like on or off themselves; until then it's on. */
  knockCalibrated: boolean;
  knockOn: boolean;
  runs: number;
};

export const EMPTY_PROFILE: RunProfile = { easyPace: null, naturalSpm: null, knockCalibrated: false, knockOn: true, runs: 0 };

/** Tap to like used to start off behind the tester; profiles saved then turn it on unless someone chose. */
export function withKnockDefault(profile: RunProfile): RunProfile {
  return profile.knockCalibrated ? profile : { ...profile, knockOn: true };
}
