/**
 * Your Spotify songs for Rewind: liked songs, plus songs you added to your own
 * playlists (each song once, from the first time you saved it). This is the pure
 * half (URLs, the login's state, turning Spotify's items into what Rewind shows);
 * the network half is lib/spotify-api.ts.
 *
 * Login is Authorization Code with PKCE, so there is no client secret anywhere.
 * Spotify only accepts exact redirect URIs, and an Expo Go link changes with every
 * update, so Spotify always redirects to one fixed web page
 * (app/spotify-callback.tsx on blindspot.expo.app). That page hands the code back
 * to whatever app link the state carries, if it's this app's.
 *
 * In development mode Spotify lets only 5 accounts in, each added by hand in the
 * Spotify developer dashboard, and the app owner needs Premium (checked 2026-10-03).
 */

/** Public by design: a PKCE client has no secret. From the Spotify developer dashboard's "Blindspot" app. */
export const SPOTIFY_CLIENT_ID = 'f35f9da7a9484344ad6d6bc04aeaa384';
export const SPOTIFY_REDIRECT = 'https://blindspot.expo.app/spotify-callback';
const SCOPE = 'user-library-read playlist-read-private playlist-read-collaborative';
const PROJECT_ID = '93a021d9-29e0-41bb-876f-2d5ffba00638';

export type SpotifyLike = {
  id: string;
  name: string;
  artist: string;
  /** The album cover nearest 300px, or '' when Spotify has none. */
  art: string;
  /** When you liked it or added it to a playlist, ms since epoch. */
  addedAt: number;
  /** '' for a liked song, else the playlist you added it to. */
  from: string;
  /**
   * 'file' when it came from a file you imported (Exportify); absent when it came from the
   * Spotify login. Only file songs feed stats and the truly blind feed: Spotify's Developer
   * Policy forbids deriving metrics or profiles from data read through its API.
   */
  source?: 'file';
  /** File songs only: Spotify's 0-100 popularity when exported, and the album's release year. */
  popularity?: number;
  released?: number;
};

export const spotifyTrackUrl = (id: string) => `https://open.spotify.com/track/${id}`;

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** A PKCE code verifier (or nonce): one allowed character per random byte. */
export function verifierFrom(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += UNRESERVED[b % UNRESERVED.length];
  return out;
}

export function base64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The state Spotify echoes back: a nonce to match, then the app link to return to. */
export function packState(nonce: string, returnUrl: string): string {
  return `${nonce}~${returnUrl}`;
}

export function unpackState(state: string | undefined): { nonce: string; returnUrl: string } | null {
  const i = state?.indexOf('~') ?? -1;
  if (!state || i <= 0) return null;
  return { nonce: state.slice(0, i), returnUrl: state.slice(i + 1) };
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** The query part of a URL (or a bare "?a=b" string) as an object. Hand-rolled: React Native's URLSearchParams is incomplete. */
export function readQuery(url: string): Record<string, string> {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const out: Record<string, string> = {};
  for (const pair of q.split('#')[0].split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

export function authorizeUrl({ clientId, challenge, state }: { clientId: string; challenge: string; state: string }): string {
  return `https://accounts.spotify.com/authorize?${query({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPE,
    state,
  })}`;
}

export function tokenBody({ clientId, code, verifier }: { clientId: string; code: string; verifier: string }): string {
  return query({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  });
}

/** Only this app: its own scheme, or Expo Go running this project. Anything else would make the web page an open redirect. */
export function safeReturnUrl(url: string): boolean {
  return (
    url.startsWith('prototype0://') ||
    url.startsWith(`exp://u.expo.dev/${PROJECT_ID}/`) ||
    url.startsWith(`exps://u.expo.dev/${PROJECT_ID}/`)
  );
}

/** For the web page Spotify redirects to: where to send the browser next, or null if it shouldn't go anywhere. */
export function callbackTarget(search: string): string | null {
  const q = readQuery(search);
  const back = unpackState(q.state);
  if (!back || !safeReturnUrl(back.returnUrl)) return null;
  const pass: Record<string, string> = { state: q.state };
  if (q.code) pass.code = q.code;
  if (q.error) pass.error = q.error;
  return `${back.returnUrl}${back.returnUrl.includes('?') ? '&' : '?'}${query(pass)}`;
}

type Image = { url: string; width?: number | null };
type Track = { id: string | null; type?: string; name: string; artists: { name: string }[]; album: { images: Image[] } };
type SavedItem = { added_at: string; track: Track | null };
/** A playlist entry. Spotify renamed `track` to `item` in February 2026; both are read. */
type PlaylistRow = { added_at: string | null; added_by?: { id: string } | null; item?: Track | null; track?: Track | null };

function toSong(track: Track | null | undefined, addedAt: number, from: string): SpotifyLike | null {
  // Episodes aren't songs, and local files have no Spotify id to open.
  if (!track?.id || (track.type && track.type !== 'track') || Number.isNaN(addedAt)) return null;
  const images = [...track.album.images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const art = images.find((i) => (i.width ?? 0) >= 300) ?? images[images.length - 1];
  return {
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    art: art?.url ?? '',
    addedAt,
    from,
  };
}

/** One saved-track item from GET /me/tracks, or null for a song Spotify no longer has. */
export function toLike(item: SavedItem): SpotifyLike | null {
  return toSong(item.track, Date.parse(item.added_at), '');
}

/**
 * One entry from GET /playlists/{id}/items, if you added it: on a shared playlist a
 * friend's adds aren't yours. Very old playlists have no dates, so those entries are skipped.
 */
export function toPlaylistAdd(row: PlaylistRow, playlist: string, me: string | null): SpotifyLike | null {
  if (!row.added_at || (me && row.added_by?.id && row.added_by.id !== me)) return null;
  return toSong(row.item ?? row.track, Date.parse(row.added_at), playlist);
}

const songKey = (s: SpotifyLike) => `${s.name.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}`;

/**
 * Each song once, newest first, dated the first time you saved it anywhere. Same id is
 * the same song; so is the same name and artist on another id (a single and its album).
 */
export function mergeSaves(saves: SpotifyLike[]): SpotifyLike[] {
  const first = new Map<string, SpotifyLike>();
  for (const s of [...saves].sort((a, b) => a.addedAt - b.addedAt)) {
    if (!first.has(s.id) && !first.has(songKey(s))) {
      first.set(s.id, s);
      first.set(songKey(s), s);
    }
  }
  return [...new Set(first.values())].sort((a, b) => b.addedAt - a.addedAt);
}

/** One plain sentence after an import: "1,234 songs from your Spotify, back to 2019." */
export function describeImport(likes: SpotifyLike[], now: number): string {
  if (likes.length === 0) return 'No liked or playlist songs on that Spotify account yet.';
  const songs = `${likes.length.toLocaleString('en-US')} ${likes.length === 1 ? 'song' : 'songs'} from your Spotify`;
  const first = new Date(likes.reduce((min, l) => Math.min(min, l.addedAt), Infinity)).getFullYear();
  return first === new Date(now).getFullYear() ? `${songs}, from this year.` : `${songs}, back to ${first}.`;
}
