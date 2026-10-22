// A pretend runner for the browser and dev builds, where there's no GPS or accelerometer. Its steps drift toward
// the song's beat and its speed follows the song's energy, so steering and "legs liked" can be seen on screen.
// Never mixed with real runs: every record it makes is marked simulated.

import { legsLiked } from './run-reveal.ts';
import type { RunCandidate } from './run-songs.ts';
import { beatFor } from './run-songs.ts';
import type { Fix, RunPoint, RunRecord, RunSong } from './run-types.ts';

const CENTER = { lat: 32.8412, lng: -96.7845 };
const LOOP_M = 1200;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where a runner is after `meters` around a 1.2 km loop. */
function onLoop(meters: number): { lat: number; lng: number } {
  const r = LOOP_M / (2 * Math.PI);
  const a = (meters / LOOP_M) * 2 * Math.PI;
  const wobble = 1 + 0.25 * Math.sin(3 * a);
  return {
    lat: CENTER.lat + (Math.cos(a) * r * wobble) / 110_540,
    lng: CENTER.lng + (Math.sin(a) * r * wobble) / (111_320 * Math.cos((CENTER.lat * Math.PI) / 180)),
  };
}

export function createSim(o: { spm: number; speed: number; seed?: number }) {
  const rng = mulberry32(o.seed ?? 7);
  let spm = o.spm;
  let speed = o.speed;
  let beat = o.spm;
  let energy = 0.6;
  let meters = 0;
  let last: number | null = null;
  return {
    /** Moves the runner to time t (ms) and returns a GPS fix with a few meters of noise. */
    fixAt(t: number): Fix {
      if (last != null) {
        const dt = (t - last) / 1000;
        spm += (beat - spm) * Math.min(1, dt / 20);
        const want = o.speed * (1 + 0.1 * (energy - 0.6)) * (spm / o.spm);
        speed += (want - speed) * Math.min(1, dt / 15);
        meters += speed * dt;
      }
      last = t;
      const p = onLoop(meters);
      return { t, lat: p.lat + (rng() - 0.5) * 0.00003, lng: p.lng + (rng() - 0.5) * 0.00003, accuracy: 6 };
    },
    spm: () => spm + (rng() - 0.5) * 2,
    setSong(s: { beat: number; energy: number }) {
      beat = s.beat;
      energy = s.energy;
    },
  };
}

const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((b.lat - a.lat) * 110_540, (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));

/** A made-up 24-minute run for checking the reveal (dev only). */
export function sampleRun(now: number, cands: RunCandidate[]): RunRecord {
  const rng = mulberry32(42);
  const sim = createSim({ spm: 162, speed: 2.6, seed: 3 });
  const startedAt = now - 26 * 60_000;
  const durationMs = 24 * 60_000;
  const points: RunPoint[] = [];
  const played: RunSong[] = [];
  const pool = [...cands].sort(() => rng() - 0.5);
  const fixes: Fix[] = [];
  let distanceM = 0;
  let songIndex = -1;
  for (let t = 0; t <= durationMs; t += 1000) {
    const i = Math.floor(t / 30_000);
    if (i !== songIndex && i < 48) {
      songIndex = i;
      const c = pool[i % pool.length];
      const steer = i < 6 ? 'ease' : i % 7 === 3 ? 'lift' : 'hold';
      const song: RunSong = {
        track: c.track, start: t, end: Math.min(durationMs, t + 30_000), tempo: c.tempo, energy: c.energy,
        beat: beatFor(c.tempo, 162), blind: i % 3 === 2, steer, liked: i === 9 || i === 31 ? 'you' : null, kept: false,
      };
      played.push(song);
      sim.setSong({ beat: song.beat, energy: i === 18 ? 1.4 : song.energy });
    }
    const fix = sim.fixAt(startedAt + t);
    fixes.push(fix);
    if (t % 5000 === 0) {
      const back = fixes[Math.max(0, fixes.length - 11)];
      const dt = (fix.t - back.t) / 1000;
      const speed = dt > 0 ? distM(back, fix) / dt : null;
      if (speed != null && t > 0) distanceM += speed * 5;
      points.push({ t, lat: fix.lat, lng: fix.lng, speed, spm: sim.spm() });
    }
  }
  const legs = legsLiked(played, points, []);
  for (const i of legs) played[i].liked = 'legs';
  return {
    id: `sample-${now}`, startedAt, endedAt: startedAt + durationMs, goal: 'easy', songs: 'mix', typedPace: null, goalPace: 1000 / 2.6,
    talk: null, naturalSpm: 162, distanceM, points, played, gaps: [], simulated: true,
  };
}
