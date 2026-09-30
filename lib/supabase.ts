// Supabase over plain REST (PostgREST) — no client library. The anon key is
// safe to ship: row-level security (supabase/setup.sql) only allows reading
// current drops and the vote counts view, and inserting votes.
import type { Comment, Vibe } from './comments';
import type { Drop, DropVote, GuessResult, SongResult } from './daily-drop';

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

export async function sendGuess(day: string, deviceId: string, position: number): Promise<boolean> {
  if (!URL_ROOT || !KEY) return false;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/guesses`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ day, device_id: deviceId, position }),
    });
    return res.status < 500; // same settling rule as sendVotes
  } catch {
    return false;
  }
}

export async function fetchGuessResults(day: string): Promise<GuessResult[] | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/guess_results?day=eq.${day}&select=position,count`, { headers: headers() });
    return res.ok ? ((await res.json()) as GuessResult[]) : null;
  } catch {
    return null;
  }
}

// ---------- Comments and vibes ----------

async function get<T>(path: string): Promise<T | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/${path}`, { headers: headers() });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function post(table: string, body: unknown): Promise<boolean> {
  if (!URL_ROOT || !KEY) return false;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

export const fetchComments = (trackId: number) =>
  get<Comment[]>(`comments?track_id=eq.${trackId}&select=id,name,body,created_at&order=created_at.desc&limit=100`);

export const postComment = (trackId: number, deviceId: string, name: string, body: string) =>
  post('comments', { track_id: trackId, device_id: deviceId, name, body });

export const reportComment = (commentId: number, deviceId: string) =>
  post('comment_reports', { comment_id: commentId, device_id: deviceId });

export const fetchVibes = (trackId: number) => get<Vibe[]>(`vibe_counts?track_id=eq.${trackId}&select=word,count`);

export const addVibe = (trackId: number, deviceId: string, word: string) =>
  post('vibes', { track_id: trackId, device_id: deviceId, word });

/** The newest comments' song ids and times, for "What people are talking about". */
export const fetchRecentCommentRows = () =>
  get<{ track_id: number; created_at: string }[]>(`comments?select=track_id,created_at&order=created_at.desc&limit=200`);

/** "Sounds like AI?" — one report per phone per artist. */
export const reportAiArtist = (artistKey: string, deviceId: string) => post('ai_reports', { artist_key: artistKey, device_id: deviceId });

/** Artists reported as AI by 3+ different phones. */
export const fetchReportedAiArtists = () => get<{ artist_key: string }[]>('ai_reported?select=artist_key');
