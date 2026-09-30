import AsyncStorage from '@react-native-async-storage/async-storage';

import { onLikeChange } from '@/components/like-button';
import { ensureSession, hasStoredSession } from './auth';
import type { DiscoveryTrack } from './discovery';
import { loadDeviceId, loadLikedTracks } from './discovery-storage';
import { normalizeArtist } from './human-check';
import { lookupTracks } from './song-details';
import { rankTwins, type Platform, type Twin, type TwinRow } from './twins';

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const JOINED = 'twins-joined-v1';

async function api(
  path: string,
  init: { method?: string; body?: unknown; prefer?: string; conflictOk?: boolean } = {}
): Promise<{ ok: boolean; data: any }> {
  const s = await ensureSession();
  if (!s || !URL_ROOT) return { ok: false, data: null };
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    // 409 = "already there", fine for likes and waves, a real failure for a new profile.
    return { ok: res.ok || (res.status === 409 && init.conflictOk !== false), data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, data: null };
  }
}
const rpc = (fn: string, args: object = {}) => api(`rpc/${fn}`, { method: 'POST', body: args });

export type MyProfile = { name: string; handle: string | null; platform: Platform | null; adult: boolean };

/** Your profile; null if you haven't joined; 'error' if we couldn't tell (offline). Never signs a visitor up. */
export async function myProfile(): Promise<MyProfile | null | 'error'> {
  if (!(await hasStoredSession())) return null;
  const get = () => api('twin_profiles?select=name,handle,platform,adult');
  let r = await get();
  if (!r.ok || !Array.isArray(r.data)) return 'error';
  if (!r.data[0]) {
    // A fresh account on a phone that had joined before: take the old profile back.
    const claim = await rpc('claim_twin_profile', { device: await loadDeviceId() });
    if (claim.ok && claim.data === true) r = await get();
  }
  return r.ok && Array.isArray(r.data) && r.data[0] ? (r.data[0] as MyProfile) : null;
}

/** Join, or update what you share. Uploads your saved songs the first time. */
export async function saveProfile(p: MyProfile): Promise<boolean> {
  const body = { name: p.name, handle: p.adult ? p.handle : null, platform: p.adult && p.handle ? p.platform : null, adult: p.adult };
  const s = await ensureSession();
  if (!s) return false;
  const existing = await myProfile();
  if (existing === 'error') return false;
  const r = existing
    ? await api(`twin_profiles?user_id=eq.${s.userId}`, { method: 'PATCH', body, prefer: 'return=minimal' })
    : await api('twin_profiles', { method: 'POST', body: { ...body, device_id: await loadDeviceId() }, prefer: 'return=minimal', conflictOk: false });
  if (!r.ok) return false;
  await AsyncStorage.setItem(JOINED, 'true');
  await syncLikesNow();
  return true;
}

const artistKey = (name: string) => normalizeArtist(name) || 'unknown';

/**
 * Make the server's copy of your saves match your Liked list: add what's
 * missing, remove what you deleted or exported. Runs on join, on app start
 * and whenever you open Taste Twins, so nothing drifts.
 */
export async function syncLikesNow(): Promise<boolean> {
  if ((await AsyncStorage.getItem(JOINED)) !== 'true') return false;
  const server = await api('twin_likes?select=track_id');
  if (!server.ok || !Array.isArray(server.data)) return false;
  const onServer = new Set((server.data as { track_id: number }[]).map((r) => r.track_id));
  const liked = await loadLikedTracks();
  const local = new Set(liked.map((t) => t.id));
  const missing = liked.filter((t) => !onServer.has(t.id));
  const extra = [...onServer].filter((id) => !local.has(id));
  const results = await Promise.all([
    missing.length
      ? api('twin_likes', { method: 'POST', body: missing.map((t) => ({ track_id: t.id, artist_key: artistKey(t.artistName) })), prefer: 'resolution=ignore-duplicates,return=minimal' })
      : { ok: true },
    extra.length ? api(`twin_likes?track_id=in.(${extra.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' }) : { ok: true },
  ]);
  return results.every((x) => x.ok);
}

export async function fetchTwins(): Promise<Twin[] | null> {
  const r = await rpc('my_twins');
  return r.ok && Array.isArray(r.data) ? rankTwins(r.data as TwinRow[]) : null;
}

export async function fetchTwinSongs(id: string): Promise<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] }> {
  const r = await rpc('twin_songs', { twin: id });
  const rows = (r.ok && Array.isArray(r.data) ? r.data : []) as { track_id: number; shared: boolean }[];
  const tracks = await lookupTracks(rows.map((x) => x.track_id));
  const shared = new Set(rows.filter((x) => x.shared).map((x) => x.track_id));
  return { shared: tracks.filter((t) => shared.has(t.id)), theirs: tracks.filter((t) => !shared.has(t.id)).slice(0, 20) };
}

export const wave = async (id: string) => (await api('twin_waves', { method: 'POST', body: { to_user: id }, prefer: 'return=minimal' })).ok;
export const block = async (id: string) => (await api('twin_blocks', { method: 'POST', body: { to_user: id }, prefer: 'return=minimal' })).ok;
export const report = async (id: string, reason: string) =>
  (await api('twin_reports', { method: 'POST', body: { reported: id, reason }, prefer: 'return=minimal' })).ok;

export async function fetchHandle(id: string): Promise<{ handle: string; platform: Platform } | null> {
  const r = await rpc('twin_handle', { twin: id });
  return r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

export async function leaveTwins(): Promise<boolean> {
  const r = await rpc('leave_twins');
  if (r.ok) await AsyncStorage.removeItem(JOINED);
  return r.ok;
}

/** Keep your saved songs in step with the server while you're a member. */
let syncing = false;
export function startTwinSync() {
  if (syncing) return;
  syncing = true;
  syncLikesNow();
  onLikeChange(async (id, liked) => {
    if ((await AsyncStorage.getItem(JOINED)) !== 'true') return;
    if (!liked) return void api(`twin_likes?track_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    const t = (await loadLikedTracks()).find((x) => x.id === id);
    if (t) api('twin_likes', { method: 'POST', body: { track_id: t.id, artist_key: artistKey(t.artistName) }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  });
}
