// The run's reveal: which songs your legs liked, the hardest-hitting song, the headline, the pace line and the route.
// Points come every 5 s; a point's speed covers the 5 s before it.

import type { RunGap, RunPoint, RunRecord, RunSong } from './run-types.ts';

const MILE = 1609.344;
const STEP_MS = 5000;
const CALIBRATION_MS = 90_000;
const ON_GOAL = 0.05;
const WALK_SPM = 135;

const speedsIn = (points: RunPoint[], from: number, to: number) =>
  points.filter((p) => p.t >= from && p.t < to && p.speed != null).map((p) => p.speed!);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const overlaps = (gaps: RunGap[], from: number, to: number) => gaps.some((g) => g.start < to && g.end > from);

/**
 * Songs your pace picked up for: 4 % faster than the minute before while the app wasn't pushing,
 * or locked to the beat 70 % of the time plus 2 % faster. At most 1 per 5 songs, best first.
 */
export function legsLiked(played: RunSong[], points: RunPoint[], gaps: RunGap[]): Set<number> {
  const scored: { i: number; score: number }[] = [];
  played.forEach((s, i) => {
    if (s.liked === 'you' || s.end - s.start < 15_000 || overlaps(gaps, s.start - 60_000, s.end)) return;
    const win = points.filter((p) => p.t >= s.start + STEP_MS && p.t < s.end);
    const now = win.filter((p) => p.speed != null).map((p) => p.speed!);
    const before = speedsIn(points, s.start - 60_000, s.start);
    if (now.length < 3 || before.length < 6) return;
    const lift = mean(now) / mean(before) - 1;
    const steps = win.filter((p) => p.spm != null);
    const lock = steps.length ? steps.filter((p) => Math.abs(p.spm! - s.beat) / s.beat <= 0.02).length / steps.length : 0;
    if ((lift >= 0.04 && s.steer !== 'lift') || (lock >= 0.7 && lift >= 0.02)) scored.push({ i, score: lift + (lock >= 0.7 ? 0.02 : 0) });
  });
  scored.sort((a, b) => b.score - a.score);
  return new Set(scored.slice(0, Math.ceil(played.length / 5)).map((s) => s.i));
}

/** The song you ran fastest during, over at least 20 s of GPS speeds. */
export function hardestHitting(played: RunSong[], points: RunPoint[]): number | null {
  let best: number | null = null;
  let top = 0;
  played.forEach((s, i) => {
    const v = speedsIn(points, s.start, s.end);
    if (v.length * STEP_MS < 20_000) return;
    const avg = mean(v);
    if (avg > top) [best, top] = [i, avg];
  });
  return best;
}

/** Miles covered by time t, from the points' speeds. */
export function mileAt(points: RunPoint[], t: number): number {
  let m = 0;
  for (let i = 1; i < points.length && points[i].t <= t; i++) {
    const v = points[i].speed;
    if (v != null) m += v * ((points[i].t - points[i - 1].t) / 1000);
  }
  return m / MILE;
}

export function summarize(run: RunRecord): { durationMs: number; distanceM: number; avgPace: number | null; onGoalPct: number | null; walk: boolean; headline: string } {
  const locked = run.gaps.reduce((a, g) => a + Math.max(0, g.end - g.start), 0);
  const durationMs = Math.max(0, run.endedAt - run.startedAt - locked);
  const avgPace = run.distanceM >= 50 ? durationMs / 1000 / (run.distanceM / 1000) : null;
  const steps = run.points.filter((p) => p.spm != null).map((p) => p.spm!).sort((a, b) => a - b);
  const walk = steps.length > 0 && steps[Math.floor(steps.length / 2)] < WALK_SPM;
  const timed = run.points.filter((p) => p.t > CALIBRATION_MS && p.speed != null && p.speed > 0.3 && !overlaps(run.gaps, p.t - STEP_MS, p.t));
  const on = (p: RunPoint) => run.goalPace != null && Math.abs(1000 / p.speed! - run.goalPace) / run.goalPace <= ON_GOAL;
  const onGoalPct = run.goalPace != null && timed.length >= 6 ? timed.filter(on).length / timed.length : null;
  const firstOn = timed.findIndex((p, i) => timed.slice(i, i + 12).every(on));
  let headline = 'You eased into it.';
  if (durationMs < 120_000) headline = 'Short and sweet.';
  else if (walk) headline = 'A good walk.';
  else if (onGoalPct != null && onGoalPct >= 0.8) headline = 'Steady the whole way.';
  else if (firstOn >= 0) headline = `You found your pace at mile ${mileAt(run.points, timed[firstOn].t).toFixed(1)}.`;
  return { durationMs, distanceM: run.distanceM, avgPace, onGoalPct, walk, headline };
}

/** Pace in 15 s buckets, smoothed over 3 buckets; null where there was no speed. */
export function paceSeries(points: RunPoint[], bucketMs = 15_000): { t: number; pace: number | null }[] {
  if (points.length === 0) return [];
  const n = Math.floor(points[points.length - 1].t / bucketMs) + 1;
  const sums = Array.from({ length: n }, () => [0, 0]);
  for (const p of points) {
    if (p.speed == null || p.speed <= 0.3) continue;
    const b = sums[Math.floor(p.t / bucketMs)];
    b[0] += p.speed;
    b[1] += 1;
  }
  const speed = sums.map(([s, c]) => (c ? s / c : null));
  return speed.map((_, i) => {
    const near = [speed[i - 1], speed[i], speed[i + 1]].filter((v): v is number => v != null);
    return { t: i * bucketMs, pace: speed[i] != null && near.length ? 1000 / mean(near) : null };
  });
}

/** The route fitted into w×h with north up, or null without at least 10 fixes spanning 100 m. */
export function routeXY(points: RunPoint[], w: number, h: number, pad: number): { x: number; y: number; t: number }[] | null {
  const fixes = points.filter((p) => p.lat != null && p.lng != null);
  if (fixes.length < 10) return null;
  const lat0 = fixes[0].lat!;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const m = fixes.map((p) => ({ x: (p.lng! - fixes[0].lng!) * 111_320 * k, y: (p.lat! - lat0) * 110_540, t: p.t }));
  const xs = m.map((p) => p.x);
  const ys = m.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  if (span < 100) return null;
  const scale = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1), (h - 2 * pad) / Math.max(maxY - minY, 1));
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxY - minY) * scale) / 2;
  return m.map((p) => ({ x: ox + (p.x - minX) * scale, y: h - (oy + (p.y - minY) * scale), t: p.t }));
}
