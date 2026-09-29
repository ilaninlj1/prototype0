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
export type GuessResult = { position: number; count: number };

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

export function shareText(drop: Drop, votes: DropVote[], guess?: number): string {
  const ordered = [...votes].sort((a, b) => a.position - b.position);
  const grid = ordered.map((v) => (v.liked ? '💜' : '🖤')).join('');
  const liked = ordered.filter((v) => v.liked);
  const buried = liked.filter((v) => drop.songs[v.position].listeners < 5_000).length;
  const tail = buried > 0 ? ` · ${buried} under 5K listeners` : '';
  const text = `Blindspot Daily #${drop.number}\n${grid}\nLiked ${liked.length} blind${tail}`;
  if (guess == null) return text;
  return `${text}\n${guess === famousPosition(drop) ? '🎯 Found the famous one' : '❌ Missed the famous one'}`;
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

/** The drop songs you liked, as Liked-list entries — written only once the drop is finished, so an undone like never lands. */
export function likedDropTracks(drop: Drop, votes: DropVote[], likedAt: number): DiscoveryTrack[] {
  const tracks = dropToDiscoveryTracks(drop);
  return votes.filter((v) => v.liked).map((v) => ({ ...tracks[v.position], likedAt }));
}

export type PendingVotes = { day: string; votes: DropVote[]; guess?: number };

/** Queue a day's votes for sending; a newer entry for the same day replaces the old one. */
export function addPending(pending: PendingVotes[], entry: PendingVotes): PendingVotes[] {
  return [...pending.filter((p) => p.day !== entry.day), entry];
}

function famousPosition(drop: Drop): number {
  return drop.songs.findIndex((s) => s.slot === 'famous');
}

/** The guess result line: whether you picked the famous song, and how many people did. Null before a guess. */
export function guessLine(drop: Drop, guess: number | undefined, results: GuessResult[]): string | null {
  if (guess == null) return null;
  const famous = famousPosition(drop);
  const total = results.reduce((n, r) => n + r.count, 0);
  const right = results.find((r) => r.position === famous)?.count ?? 0;
  const pct = total > 0 ? Math.round((right / total) * 100) : null;
  if (guess === famous) return pct == null ? 'You found the famous one ✓' : `You found the famous one ✓ · ${pct}% of people did`;
  const miss = `Nope — it was #${famous + 1}`;
  return pct == null ? miss : `${miss} · ${pct}% of people found it`;
}

/** The drop's songs from fewest to most listeners — the order results are swiped in. */
export function rankByListeners(drop: Drop): { song: DropSong; position: number; rank: number }[] {
  return drop.songs
    .map((song, position) => ({ song, position }))
    .sort((a, b) => a.song.listeners - b.song.listeners)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

export function rankLabel(rank: number): string {
  if (rank === 1) return '#1 · fewest listeners';
  if (rank === 5) return '#5 · most listeners';
  return `#${rank}`;
}
