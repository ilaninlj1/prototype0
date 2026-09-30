import AsyncStorage from '@react-native-async-storage/async-storage';

import { sessionNeedsRefresh } from './twins';

// An invisible Supabase account per install (anonymous sign-in), used by
// Taste Twins so no one can act as someone else. Kept on the phone and
// refreshed before it expires. Only a server "no" ever creates a new one —
// being offline never does, or the listener would lose their profile.

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const STORE = 'supabase-session-v1';

type Stored = { access_token: string; refresh_token: string; expires_at: number; user_id: string };
let pending: Promise<Stored | null> | null = null;

async function authCall(path: string, body: object): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${URL_ROOT}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

const toStored = (d: any): Stored => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
  user_id: d.user.id,
});

async function load(): Promise<Stored | null> {
  let s: Stored | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORE);
    s = raw ? JSON.parse(raw) : null;
  } catch {}
  try {
    if (s && !sessionNeedsRefresh(s.expires_at, Date.now())) return s;
    if (s) {
      const r = await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (r.ok) s = toStored(r.data);
      else if (r.status >= 400 && r.status < 500) s = null; // revoked: start over
      else return null; // server trouble: try again later, keep the old one
    }
    if (!s) {
      const r = await authCall('signup', {});
      if (!r.ok) return null;
      s = toStored(r.data);
    }
    await AsyncStorage.setItem(STORE, JSON.stringify(s));
    return s;
  } catch {
    return null; // offline: keep what's stored
  }
}

export async function ensureSession(): Promise<{ token: string; userId: string } | null> {
  pending ??= load().finally(() => (pending = null));
  const s = await pending;
  return s ? { token: s.access_token, userId: s.user_id } : null;
}
