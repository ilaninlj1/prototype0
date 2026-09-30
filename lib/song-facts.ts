// Pure helpers for the song page's deep details (MusicBrainz credits,
// Last.fm replay score, Wikipedia matching) and the search screen.

export type Person = { name: string; roles: string[] };
export type Credits = {
  firstRelease: string | null;
  /** Who played or sang what. */
  players: Person[];
  /** Producers, engineers, mixers and the like. */
  crew: Person[];
  writers: string[];
  /** Remixes, mashups and other versions of this recording. */
  versions: string[];
};

type Relation = {
  type: string;
  attributes?: string[];
  artist?: { name: string };
  recording?: { title: string };
  work?: { relations?: Relation[] };
};

const PLAYER_TYPES = new Set(['instrument', 'vocal', 'performer', 'performing orchestra']);
const VERSION_TYPES = new Set(['remix', 'mashes up', 'samples material', 'edit', 'DJ-mix']);
const WRITER_TYPES = new Set(['writer', 'composer', 'lyricist']);

function addRole(list: Person[], name: string, role: string) {
  const hit = list.find((p) => p.name === name);
  if (!hit) list.push({ name, roles: [role] });
  else if (!hit.roles.includes(role)) hit.roles.push(role);
}

export function parseCredits(recording: { 'first-release-date'?: string; relations?: Relation[] }): Credits {
  const players: Person[] = [];
  const crew: Person[] = [];
  const writers: string[] = [];
  const versions: string[] = [];
  for (const r of recording.relations ?? []) {
    if (r.artist && PLAYER_TYPES.has(r.type)) {
      const roles = r.attributes?.length ? r.attributes : [r.type];
      for (const role of roles) addRole(players, r.artist.name, role);
    } else if (r.artist) {
      const role = [...(r.attributes ?? []), r.type].join(' ');
      addRole(crew, r.artist.name, role);
    } else if (r.recording && VERSION_TYPES.has(r.type)) {
      versions.push(r.recording.title);
    } else if (r.work) {
      for (const w of r.work.relations ?? []) {
        if (w.artist && WRITER_TYPES.has(w.type) && !writers.includes(w.artist.name)) writers.push(w.artist.name);
      }
    }
  }
  return { firstRelease: recording['first-release-date'] || null, players, crew, writers, versions };
}

/** Plays per listener: how often people who find it come back to it. */
export function replayScore(plays: number, listeners: number): number | null {
  if (!listeners) return null;
  return Math.round((plays / listeners) * 10) / 10;
}

/** A Wikipedia summary counts only if it's actually about this artist's song. */
export function wikiMatches(extract: string, artist: string): boolean {
  return extract.toLowerCase().includes(artist.toLowerCase());
}

/** For "hear 3 blind first": skip an artist's first few (biggest) songs when there are enough. */
export function pickLesserKnown<T>(songs: T[], n: number, rng: () => number = Math.random): T[] {
  const pool = songs.length >= n + 5 ? songs.slice(5) : songs;
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** "What people are talking about": songs by their newest comment, with how many comments each. */
export function groupTalkedAbout(rows: { track_id: number; created_at: string }[]): { trackId: number; count: number }[] {
  const byTrack = new Map<number, { newest: string; count: number }>();
  for (const r of rows) {
    const cur = byTrack.get(r.track_id);
    if (!cur) byTrack.set(r.track_id, { newest: r.created_at, count: 1 });
    else {
      cur.count++;
      if (r.created_at > cur.newest) cur.newest = r.created_at;
    }
  }
  return [...byTrack]
    .sort((a, b) => (a[1].newest < b[1].newest ? 1 : -1))
    .map(([trackId, v]) => ({ trackId, count: v.count }));
}
