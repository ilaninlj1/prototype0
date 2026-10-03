import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import {
  authorizeUrl,
  base64Url,
  packState,
  readQuery,
  SPOTIFY_CLIENT_ID,
  toLike,
  tokenBody,
  unpackState,
  verifierFrom,
  type SpotifyLike,
} from './spotify';

// The network and storage half of Spotify liked songs (see lib/spotify.ts for the why).
// Nothing is kept from the login: one pass reads your liked songs and the token is dropped.
// "Sync again" just logs in again, which Spotify skips through once you've said yes.

export type SpotifyFail = 'cancelled' | 'denied' | 'not-allowed' | 'offline' | 'not-set-up' | 'failed';

export const FAIL_TEXT: Record<SpotifyFail, string> = {
  cancelled: 'Spotify login closed. Nothing changed.',
  denied: 'Spotify said no, so nothing was brought in.',
  'not-allowed': 'Spotify only lets accounts on this app’s test list connect. Ask to be added, then try again.',
  offline: 'Couldn’t reach Spotify. Check your connection.',
  'not-set-up': 'Spotify isn’t set up in this version of the app yet.',
  failed: 'Something went wrong with Spotify. Try again in a minute.',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const returnUrl = Linking.createURL('spotify-auth');
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
  } catch {
    return 'offline';
  }
  return likes;
}

// ---------- Storage ----------
// Kept apart from your Blindspot saves on purpose: these never count as blind finds,
// never join the Tasteform, and never leave the phone.
// Saved in chunks, because one big AsyncStorage value can fail to read back on Android (about 2 MB).

const PREFIX = 'blindspotDiscovery:spotify';
const META_KEY = `${PREFIX}Meta`;
const CHUNK = 1000;

export type SpotifyLibrary = { syncedAt: number; likes: SpotifyLike[] };

export async function loadSpotifyLibrary(): Promise<SpotifyLibrary | null> {
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? 'null') as { syncedAt: number; chunks: number } | null;
    if (!meta) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${PREFIX}:${i}`);
    const rows = await AsyncStorage.multiGet(keys);
    const likes = rows.flatMap(([, raw]) => (raw ? (JSON.parse(raw) as SpotifyLike[]) : []));
    return { syncedAt: meta.syncedAt, likes };
  } catch {
    return null;
  }
}

export async function saveSpotifyLibrary(library: SpotifyLibrary): Promise<void> {
  try {
    await clearSpotifyLibrary();
    const chunks: [string, string][] = [];
    for (let i = 0; i * CHUNK < library.likes.length; i++) {
      chunks.push([`${PREFIX}:${i}`, JSON.stringify(library.likes.slice(i * CHUNK, (i + 1) * CHUNK))]);
    }
    if (chunks.length) await AsyncStorage.multiSet(chunks);
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ syncedAt: library.syncedAt, chunks: chunks.length }));
  } catch {
    // ignore
  }
}

export async function clearSpotifyLibrary(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k === META_KEY || k.startsWith(`${PREFIX}:`));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}
