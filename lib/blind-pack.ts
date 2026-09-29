import type { DiscoveryTrack } from './discovery.ts';

const MAX_SONGS = 5;
const MAX_NAME = 30;

export function packUrl(base: string, ids: number[], from: string): string {
  return `${base.replace(/\/$/, '')}/pack?ids=${ids.join(',')}&from=${encodeURIComponent(from)}`;
}

export function parsePack(ids: string | undefined, from: string | undefined): { ids: number[]; from: string } {
  const parsed = (ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return {
    ids: [...new Set(parsed)].slice(0, MAX_SONGS),
    from: (from ?? '').trim().slice(0, MAX_NAME) || 'A friend',
  };
}

export function orderByIds(tracks: DiscoveryTrack[], ids: number[]): DiscoveryTrack[] {
  return ids.flatMap((id) => tracks.filter((t) => t.id === id).slice(0, 1));
}

/** Only real iTunes tracks can be looked up by a friend (Blind Spot Test songs use a local hash id). */
export function packable(track: DiscoveryTrack): boolean {
  return track.id > 0 && track.artistId > 0;
}

export function matchLine(from: string, liked: number, total: number): string {
  if (total === 0) return 'No songs to compare.';
  return `You and ${from} agree on ${liked} of ${total} — ${Math.round((liked / total) * 100)}% taste match.`;
}

export function shareBackText(from: string, liked: number, total: number, url: string): string {
  return `I matched ${from}'s Blindspot pack ${liked}/${total} 🎯 ${url}`;
}
