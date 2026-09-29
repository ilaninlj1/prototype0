import { describeListeners, type DiscoveryTrack } from './discovery.ts';

export type Slot = 'buried' | 'tiny' | 'radar' | 'known' | 'famous';
export type DropSong = {
  slot: Slot;
  itunesTrackId: number;
  itunesArtistId: number;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  genre: string;
  listeners: number;
};
export type Drop = { day: string; number: number; songs: DropSong[] };
export type DropVote = { position: number; liked: boolean };
export type SongResult = { position: number; voters: number; likes: number };

const CROWD_PERCENT_FROM = 20;
const LONELY_MAX_SHARE = 0.25;
const LONELY_MIN_VOTERS = 5;

export function todayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nextDropIndex(votes: DropVote[]): number {
  return votes.length;
}

export function crowdLabel(r: SongResult | undefined): string {
  if (!r || r.voters === 0) return 'No votes yet';
  if (r.voters < CROWD_PERCENT_FROM) return `${r.likes} of ${r.voters} liked`;
  return `${Math.round((r.likes / r.voters) * 100)}% liked`;
}

export function pickHeadline(drop: Drop, votes: DropVote[], results: SongResult[]): string {
  const resultAt = (p: number) => results.find((r) => r.position === p);
  const lonely = votes
    .filter((v) => v.liked)
    .map((v) => ({ v, r: resultAt(v.position) }))
    .filter(({ r }) => r && r.voters >= LONELY_MIN_VOTERS && r.likes / r.voters <= LONELY_MAX_SHARE)
    .sort((a, b) => a.r!.likes / a.r!.voters - b.r!.likes / b.r!.voters)[0];
  if (lonely) {
    const pct = Math.round((lonely.r!.likes / lonely.r!.voters) * 100);
    return `You're one of only ${pct}% who liked ${drop.songs[lonely.v.position].artist}.`;
  }

  const famousAt = drop.songs.findIndex((s) => s.slot === 'famous');
  const count = describeListeners(drop.songs[famousAt].listeners).count;
  if (votes.find((v) => v.position === famousAt)?.liked) return `You spotted it — ${count} listeners.`;
  const r = resultAt(famousAt);
  if (!r || r.voters < LONELY_MIN_VOTERS) return `You skipped a song with ${count} listeners.`;
  const skipped = Math.round(((r.voters - r.likes) / r.voters) * 100);
  return `You skipped a song with ${count} listeners — so did ${skipped}% of people.`;
}

export function shareText(drop: Drop, votes: DropVote[]): string {
  const ordered = [...votes].sort((a, b) => a.position - b.position);
  const grid = ordered.map((v) => (v.liked ? '💜' : '🖤')).join('');
  const liked = ordered.filter((v) => v.liked);
  const buried = liked.filter((v) => drop.songs[v.position].listeners < 5_000).length;
  const tail = buried > 0 ? ` · ${buried} under 5K listeners` : '';
  return `Blindspot Daily #${drop.number}\n${grid}\nLiked ${liked.length} blind${tail}`;
}

export function dropToDiscoveryTracks(drop: Drop): DiscoveryTrack[] {
  return drop.songs.map((s) => ({
    id: s.itunesTrackId,
    trackName: s.title,
    artistId: s.itunesArtistId,
    artistName: s.artist,
    artworkUrl100: s.artworkUrl,
    primaryGenreName: s.genre,
    previewUrl: s.previewUrl,
    trackViewUrl: '',
    collectionName: null,
    artistListeners: s.listeners,
  }));
}
