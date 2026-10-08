import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import {
  authorizeUrl,
  base64Url,
  packState,
  readQuery,
  safeReturnUrl,
  SPOTIFY_CLIENT_ID,
  mergeSaves,
  toLike,
  toPlaylistAdd,
  tokenBody,
  unpackState,
  verifierFrom,
  type SpotifyLike,
} from './spotify';
import { setKnownArtists } from './known-artists';
import { filesFromZip, readExport, type NamedText } from './spotify-file';

// The network and storage half of your Spotify songs, liked and playlist adds (see lib/spotify.ts for the why).
// Nothing is kept from the login: one pass reads your liked songs and the token is dropped.
// "Sync again" just logs in again, which Spotify skips through once you've said yes.

export type SpotifyFail = 'cancelled' | 'denied' | 'not-allowed' | 'offline' | 'not-set-up' | 'wrong-link' | 'failed';

export const FAIL_TEXT: Record<SpotifyFail, string> = {
  cancelled: 'Spotify login closed. Nothing changed.',
  denied: 'Spotify said no, so nothing was brought in.',
  'not-allowed': 'Spotify only lets accounts on this app’s test list connect. Ask to be added, then try again.',
  offline: 'Couldn’t reach Spotify. Check your connection.',
  'not-set-up': 'Spotify isn’t set up in this version of the app yet.',
  'wrong-link': 'Spotify can’t find its way back to this version of the app. Send this link to whoever runs the app:',
  failed: 'Something went wrong with Spotify. Try again in a minute.',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The app link Spotify's web page sends the code back to. Expo's docs call this unpredictable in
 * Expo Go for published updates, so it's checked before login rather than after a stuck web page.
 */
export const spotifyReturnUrl = () => Linking.createURL('spotify-auth');

/** GET with Spotify's rate limit respected: on a 429, wait as long as it asks, a few times at most. */
async function get(url: string, token: string): Promise<Response> {
  for (let tries = 0; ; tries++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status !== 429 || tries >= 3) return res;
    await sleep((Number(res.headers.get('Retry-After')) || 2) * 1000);
  }
}

/**
 * Log in to Spotify and read every liked song, newest first. onProgress gets the
 * running count, for the "312 songs…" line while it reads.
 */
export async function importSpotifyLikes(onProgress: (count: number) => void): Promise<SpotifyLike[] | SpotifyFail> {
  if (!SPOTIFY_CLIENT_ID) return 'not-set-up';
  let token: string;
  try {
    // Loaded here, not at the top: an older APK built before this module was added
    // fails on this tap with a message, instead of at launch.
    const Crypto = await import('expo-crypto');
    const verifier = verifierFrom(Crypto.getRandomBytes(64));
    const nonce = verifierFrom(Crypto.getRandomBytes(16));
    const challenge = base64Url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 })
    );
    const returnUrl = spotifyReturnUrl();
    if (!safeReturnUrl(returnUrl)) return 'wrong-link';
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl({ clientId: SPOTIFY_CLIENT_ID, challenge, state: packState(nonce, returnUrl) }),
      returnUrl
    );
    if (result.type !== 'success') return 'cancelled';
    const back = readQuery(result.url);
    if (back.error) return back.error === 'access_denied' ? 'denied' : 'failed';
    if (!back.code || unpackState(back.state)?.nonce !== nonce) return 'failed';

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody({ clientId: SPOTIFY_CLIENT_ID, code: back.code, verifier }),
    });
    if (!res.ok) return 'failed';
    token = (await res.json()).access_token;
  } catch {
    return 'offline';
  }

  const likes: SpotifyLike[] = [];
  let next: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';
  try {
    while (next) {
      const res = await get(next, token);
      // Development mode: an account not on the dashboard's user list logs in fine, then gets 403 here.
      if (res.status === 403) return 'not-allowed';
      if (!res.ok) return 'failed';
      const page = await res.json();
      for (const item of page.items ?? []) {
        const like = toLike(item);
        if (like) likes.push(like);
      }
      onProgress(likes.length);
      next = page.next ?? null;
      if (next) await sleep(120);
    }
    likes.push(...(await readPlaylistAdds(token, (n) => onProgress(likes.length + n))));
  } catch {
    return 'offline';
  }
  return mergeSaves(likes);
}

/**
 * Songs you added to your own (or shared) playlists. Spotify only shows the contents of
 * those anyway; a playlist it won't read is skipped rather than failing the whole import.
 */
async function readPlaylistAdds(token: string, onProgress: (count: number) => void): Promise<SpotifyLike[]> {
  const meRes = await get('https://api.spotify.com/v1/me', token);
  const me: string | null = meRes.ok ? ((await meRes.json()).id ?? null) : null;
  const playlists: { id: string; name: string }[] = [];
  let next: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';
  while (next) {
    const res = await get(next, token);
    if (!res.ok) break;
    const page = await res.json();
    for (const p of page.items ?? []) {
      if (p?.id && (p.owner?.id === me || p.collaborative)) playlists.push({ id: p.id, name: p.name ?? 'a playlist' });
    }
    next = page.next ?? null;
    if (next) await sleep(120);
  }

  const adds: SpotifyLike[] = [];
  for (const playlist of playlists) {
    let page: string | null = `https://api.spotify.com/v1/playlists/${playlist.id}/items?limit=100`;
    while (page) {
      const res = await get(page, token);
      if (!res.ok) break;
      const body = await res.json();
      for (const row of body.items ?? []) {
        const add = toPlaylistAdd(row, playlist.name, me);
        if (add) adds.push(add);
      }
      onProgress(adds.length);
      page = body.next ?? null;
      await sleep(120);
    }
  }
  return adds;
}

// ---------- Storage ----------
// Kept apart from your Blindspot saves on purpose: these never count as blind finds,
// never join the Tasteform, and never leave the phone.
// Two slots: songs read through the login, and songs from a file you imported. They're kept
// apart so a login "Sync again" never wipes an import, and because only file songs may feed
// stats (see SpotifyLike.source).
// Saved in chunks, because one big AsyncStorage value can fail to read back on Android (about 2 MB).

export type SpotifySlot = 'login' | 'file';
const prefixOf = (slot: SpotifySlot) => (slot === 'login' ? 'blindspotDiscovery:spotify' : 'blindspotDiscovery:spotifyFile');
const CHUNK = 1000;

export type SpotifyLibrary = { syncedAt: number; likes: SpotifyLike[] };

export async function loadSpotifyLibrary(slot: SpotifySlot = 'login'): Promise<SpotifyLibrary | null> {
  const prefix = prefixOf(slot);
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(`${prefix}Meta`)) ?? 'null') as {
      syncedAt: number;
      chunks: number;
    } | null;
    if (!meta) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${prefix}:${i}`);
    const rows = await AsyncStorage.multiGet(keys);
    const likes = rows.flatMap(([, raw]) => (raw ? (JSON.parse(raw) as SpotifyLike[]) : []));
    return { syncedAt: meta.syncedAt, likes };
  } catch {
    return null;
  }
}

export async function saveSpotifyLibrary(library: SpotifyLibrary, slot: SpotifySlot = 'login'): Promise<void> {
  const prefix = prefixOf(slot);
  try {
    await clearSpotifyLibrary(slot);
    const chunks: [string, string][] = [];
    for (let i = 0; i * CHUNK < library.likes.length; i++) {
      chunks.push([`${prefix}:${i}`, JSON.stringify(library.likes.slice(i * CHUNK, (i + 1) * CHUNK))]);
    }
    if (chunks.length) await AsyncStorage.multiSet(chunks);
    await AsyncStorage.setItem(`${prefix}Meta`, JSON.stringify({ syncedAt: library.syncedAt, chunks: chunks.length }));
  } catch {
    // ignore
  }
}

export async function clearSpotifyLibrary(slot: SpotifySlot = 'login'): Promise<void> {
  const prefix = prefixOf(slot);
  try {
    // 'blindspotDiscovery:spotify:' never matches the file slot's 'blindspotDiscovery:spotifyFile:' keys.
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k === `${prefix}Meta` || k.startsWith(`${prefix}:`));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}

// ---------- Importing a file ----------

export type FileFail = 'cancelled' | 'not-exportify' | 'empty' | 'unreadable';

export const FILE_FAIL_TEXT: Record<FileFail, string> = {
  cancelled: 'No file picked. Nothing changed.',
  'not-exportify': 'That file isn’t an Exportify export. Export from exportify.app, then pick the .csv or .zip it saves.',
  empty: 'That file has no songs in it.',
  unreadable: 'Couldn’t open that file. Try exporting it again.',
};

/**
 * Pick Exportify's CSV (Liked Songs, a playlist) or its ZIP of everything, and read the songs.
 * Several files can be picked at once. Nothing is uploaded.
 */
export async function importSpotifyFile(): Promise<SpotifyLike[] | FileFail> {
  try {
    // Loaded here, not at the top: an APK built before these modules were added fails on this tap, not at launch.
    const DocumentPicker = await import('expo-document-picker');
    const { File } = await import('expo-file-system');
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return 'cancelled';
    const files: NamedText[] = [];
    for (const asset of picked.assets) {
      const file = new File(asset.uri);
      if (/\.zip$/i.test(asset.name) || asset.mimeType?.includes('zip')) files.push(...filesFromZip(await file.bytes()));
      else files.push({ name: asset.name, text: await file.text() });
    }
    const read = readExport(files);
    if (read.problem) return read.problem;
    return read.songs.length ? read.songs : 'empty';
  } catch {
    return 'unreadable';
  }
}

/** Import a file and keep it: saved in the file slot, and Home starts skipping its artists right away. */
export async function importAndKeepFile(): Promise<SpotifyLibrary | FileFail> {
  const result = await importSpotifyFile();
  if (typeof result === 'string') return result;
  const library = { syncedAt: Date.now(), likes: result };
  await saveSpotifyLibrary(library, 'file');
  setKnownArtists(result);
  return library;
}
