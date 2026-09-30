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

// The only answers that mean "this session is gone for good". Anything else
// (rate limits, a school filter, a flaky network) is temporary: keep the
// session and try again later, never start a new account.
const GONE = new Set(['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'validation_failed']);

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

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** True once this phone has an account (so visitors who never join don't create one). */
export async function hasStoredSession(): Promise<boolean> {
  return (await readStored()) !== null;
}

async function load(create: boolean): Promise<Stored | null> {
  let s = await readStored();
  try {
    if (s && !sessionNeedsRefresh(s.expires_at, Date.now())) return s;
    if (s) {
      const r = await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (r.ok) s = toStored(r.data);
      else if (GONE.has(r.data?.error_code ?? r.data?.code)) s = null; // truly gone: start over (the profile is claimed back by device)
      else return null; // temporary: keep the old one, try again later
    }
    if (!s) {
      if (!create) return null;
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

/** The session, refreshed if needed. With `create` false, a phone without one gets null instead of a new account. */
export async function ensureSession(create = true): Promise<{ token: string; userId: string } | null> {
  if (!create && !(await hasStoredSession())) return null;
  pending ??= load(create).finally(() => (pending = null));
  const s = await pending;
  return s ? { token: s.access_token, userId: s.user_id } : null;
}
