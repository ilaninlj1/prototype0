// Which song plays next in Run mode. Tempo sets your step rate (Van Dyck et al. 2015) and energy
// changes your step length (Leman et al. 2013), so a song must fit your stride and the steer's energy.

import type { DiscoveryTrack } from './discovery.ts';
import type { SongsMode, Steer } from './run-types.ts';

export type RunCandidate = { track: DiscoveryTrack; tempo: number; energy: number; artist: string };

const BLIND_TOLERANCES = [0.04, 0.06, 0.08];
const LIKED_TOLERANCES = [0.08, Infinity];
const ENOUGH = 12;
const BEST = 5;

/** The song's tempo at half, normal or double time, whichever is nearest the step rate. */
export function beatFor(tempo: number, spm: number): number {
  return [tempo / 2, tempo, tempo * 2].reduce((best, b) => (Math.abs(b - spm) < Math.abs(best - spm) ? b : best));
}

export function energyBand(steer: Steer): [number, number] {
  if (steer === 'ease') return [0, 0.55];
  if (steer === 'lift') return [0.7, 1];
  return [0.45, 0.8];
}

/** Mix plays two liked songs, then a blind one. */
export function slotIsBlind(mode: SongsMode, index: number): boolean {
  return mode === 'blind' || (mode === 'mix' && index % 3 === 2);
}

const offBeat = (c: RunCandidate, spm: number) => Math.abs(beatFor(c.tempo, spm) - spm) / spm;

function choose(cands: RunCandidate[], spm: number, steer: Steer, tolerances: number[], enough: number, rng: () => number): RunCandidate | null {
  if (cands.length === 0) return null;
  let fit: RunCandidate[] = [];
  for (const tol of tolerances) {
    fit = cands.filter((c) => offBeat(c, spm) <= tol);
    if (fit.length >= enough) break;
  }
  if (fit.length === 0) fit = cands;
  const [lo, hi] = energyBand(steer);
  const inBand = fit.filter((c) => c.energy >= lo && c.energy <= hi);
  const mid = (lo + hi) / 2;
  const ranked = inBand.length
    ? inBand.sort((a, b) => offBeat(a, spm) - offBeat(b, spm))
    : fit.sort((a, b) => Math.abs(a.energy - mid) - Math.abs(b.energy - mid));
  const best = ranked.slice(0, BEST);
  return best[Math.min(best.length - 1, Math.floor(rng() * best.length))];
}

/** The next song for this slot, falling back to the other pool so a run never goes quiet while songs are left. */
export function pickNext(o: {
  blindPool: RunCandidate[];
  liked: RunCandidate[];
  mode: SongsMode;
  index: number;
  spm: number;
  steer: Steer;
  usedIds: Set<number>;
  usedArtists: Set<string>;
  rng: () => number;
}): { cand: RunCandidate; blind: boolean } | null {
  const blind = () => {
    const pool = o.blindPool.filter((c) => !o.usedIds.has(c.track.id) && !o.usedArtists.has(c.artist));
    const cand = choose(pool, o.spm, o.steer, BLIND_TOLERANCES, ENOUGH, o.rng);
    return cand && { cand, blind: true };
  };
  const liked = () => {
    const pool = o.liked.filter((c) => !o.usedIds.has(c.track.id));
    const cand = choose(pool, o.spm, o.steer, LIKED_TOLERANCES, 1, o.rng);
    return cand && { cand, blind: false };
  };
  const wantBlind = o.mode === 'liked' ? false : slotIsBlind(o.mode, o.index);
  return wantBlind ? (blind() ?? liked()) : (liked() ?? blind());
}
