import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import scanned from '@/assets/ai-artists.json';
import { loadDeviceId } from './discovery-storage';
import { isAiWeighted, isBlocked, normalizeArtist, type Proof } from './human-check';
import { fetchReportedAiArtists, reportAiArtist } from './supabase';

// The network side of human-only discovery: who is AI (built-in scan, crowd
// reports, live Last.fm tag checks), the listener's Hide/Show choice, and
// proof that an artist is a real person (MusicBrainz shows and records).

const builtIn = new Set((scanned as { artists: { key: string }[] }).artists.map((a) => a.key));
const reported = new Set<string>();
const checked = new Map<string, boolean>(); // live Last.fm checks this session

fetchReportedAiArtists().then((rows) => rows?.forEach((r) => reported.add(r.artist_key)));

// ---------- the listener's choice ----------

const SETTING_KEY = 'allow-ai-music-v1';
let allowAi = false;
const settingListeners = new Set<(allow: boolean) => void>();
AsyncStorage.getItem(SETTING_KEY)
  .then((v) => {
    allowAi = v === 'true';
    settingListeners.forEach((fn) => fn(allowAi));
  })
  .catch(() => {});

export function setAllowAi(allow: boolean) {
  allowAi = allow;
  settingListeners.forEach((fn) => fn(allow));
  AsyncStorage.setItem(SETTING_KEY, String(allow)).catch(() => {});
}

/** Tune → "AI-made music": false (Hide, the default) or true (Show). */
export function useAllowAi(): boolean {
  const [allow, setAllow] = useState(allowAi);
  useEffect(() => {
    settingListeners.add(setAllow);
    return () => {
      settingListeners.delete(setAllow);
    };
  }, []);
  return allow;
}

// ---------- who is AI ----------

/** Instant: is this artist known to be AI (built-in scan, crowd reports, or checked earlier)? */
export function knownAi(name: string): boolean {
  return isBlocked(name, builtIn, reported) || checked.get(normalizeArtist(name)) === true;
}

/** Should discovery skip this artist right now? Only when they're known AI and the listener hides AI. */
export function hideFromDiscovery(name: string): boolean {
  return !allowAi && knownAi(name);
}

/** Full check, asking Last.fm the first time an artist shows up outside the built-in list. */
export async function isAiArtist(name: string): Promise<boolean> {
  if (knownAi(name)) return true;
  const key = normalizeArtist(name);
  if (checked.has(key)) return checked.get(key)!;
  const ai = isAiWeighted(await lastfmTags(name), name, 10);
  checked.set(key, ai);
  return ai;
}

/** Same as hideFromDiscovery, but checks artists the app hasn't seen before. */
/** Last.fm's top tags with their 0–100 weights; empty on any failure (never treated as AI). */
async function lastfmTags(name: string): Promise<{ name: string; count: number }[]> {
  const key = process.env.EXPO_PUBLIC_LASTFM_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(name)}&autocorrect=1&api_key=${key}&format=json`
    );
    const body = (await res.json()) as { toptags?: { tag?: { name: string; count: number | string }[] } };
    return (body.toptags?.tag ?? []).slice(0, 15).map((t) => ({ name: t.name, count: Number(t.count) }));
  } catch {
    return [];
  }
}

export async function shouldSkip(name: string): Promise<boolean> {
  return !allowAi && (await isAiArtist(name));
}

export async function reportAi(name: string): Promise<boolean> {
  return reportAiArtist(normalizeArtist(name), await loadDeviceId());
}

// ---------- proof of a real person ----------

const UA = 'Blindspot/0.1 (student class project)';
const proofs = new Map<string, Promise<Proof | null>>();
let mbQueue: Promise<unknown> = Promise.resolve();

/** MusicBrainz asks for at most one request a second, so calls wait their turn. */
function mb<T>(path: string): Promise<T | null> {
  const run = mbQueue.then(async () => {
    try {
      const res = await fetch(`https://musicbrainz.org/ws/2/${path}${path.includes('?') ? '&' : '?'}fmt=json`, { headers: { 'User-Agent': UA } });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    } finally {
      await new Promise((r) => setTimeout(r, 1100));
    }
  });
  mbQueue = run;
  return run;
}

/** Shows on record and physical releases, from MusicBrainz. Null when the artist can't be matched. */
export function humanProof(name: string): Promise<Proof | null> {
  const key = normalizeArtist(name);
  let pending = proofs.get(key);
  if (!pending) {
    pending = (async () => {
      const search = await mb<{ artists?: { id: string; name: string; score: number }[] }>(
        `artist?query=artist:%22${encodeURIComponent(name)}%22&limit=1`
      );
      const hit = search?.artists?.[0];
      if (!hit || hit.score < 95 || normalizeArtist(hit.name) !== key) return null;
      const [events, releases] = await Promise.all([
        mb<{ count?: number }>(`event?query=arid:${hit.id}&limit=1`),
        mb<{ count?: number }>(`release?query=${encodeURIComponent(`arid:${hit.id} AND (format:vinyl OR format:cd OR format:cassette)`)}&limit=1`),
      ]);
      return { shows: events?.count ?? 0, physical: releases?.count ?? 0 };
    })();
    proofs.set(key, pending);
  }
  return pending;
}
