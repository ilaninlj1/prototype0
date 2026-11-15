import type { CoralSong, CoralTouch } from '../../lib/coral-types.ts';

export type Bloom = 'bloom' | 'clash' | 'normal';

export function bloomFor(a: number | null | undefined, b: number | null | undefined): Bloom {
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 'normal';
  return [0.5, 1, 2].some((rate) => Math.abs(a * rate - b) / Math.max(a * rate, b) <= 0.06) ? 'bloom' : 'clash';
}

export function songLabel(song: CoralSong, blind: boolean): string {
  return blind ? 'Still blind' : `${song.trackName} · ${song.artistName}`;
}

export function tickFor(previous: CoralTouch | null, next: CoralTouch): boolean {
  if (!previous) return false;
  return previous.linkId !== next.linkId || (previous.t < 0.5) !== (next.t < 0.5);
}

export function quarterStep(t: number, direction: number): number {
  return Math.max(0, Math.min(1, t + direction * 0.25));
}

// Home owns its live card. Without a recorded reveal, a blind save keeps its name hidden here.
export function blindSaveIds(
  liked: { id: number; foundBlind?: boolean }[],
  history: { trackId: number; action: string }[],
): Set<number> {
  const revealed = new Set(history.filter((entry) => entry.action === 'reveal').map((entry) => entry.trackId));
  return new Set(liked.filter((track) => track.foundBlind && !revealed.has(track.id)).map((track) => track.id));
}
