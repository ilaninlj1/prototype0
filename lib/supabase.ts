// Supabase over plain REST (PostgREST) — no client library. The anon key is
// safe to ship: row-level security (supabase/setup.sql) only allows reading
// current drops and the vote counts view, and inserting votes.
import type { Drop, DropVote, SongResult } from './daily-drop';

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY ?? '', Authorization: `Bearer ${KEY}`, ...extra };
}

export async function fetchDrop(day: string): Promise<Drop | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/drops?day=eq.${day}&select=day,number,songs`, { headers: headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as Drop[];
    return rows[0]?.songs?.length === 5 ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function sendVotes(day: string, deviceId: string, votes: DropVote[]): Promise<boolean> {
  if (!URL_ROOT || !KEY) return false;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/votes`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(votes.map((v) => ({ day, device_id: deviceId, position: v.position, liked: v.liked }))),
    });
    // Settled on any answer except a server error: 409 means these votes
    // already landed; other 4xx (e.g. a day too old for the insert policy)
    // will never succeed, so retrying forever would be pointless.
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function fetchResults(day: string): Promise<SongResult[] | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/drop_results?day=eq.${day}&select=position,voters,likes`, { headers: headers() });
    return res.ok ? ((await res.json()) as SongResult[]) : null;
  } catch {
    return null;
  }
}
