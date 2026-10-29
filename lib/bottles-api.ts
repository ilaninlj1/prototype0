import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { ensureSession } from './auth';
import type { BottleSeen } from './bottle-journey';
import { mayUseCity, placeFromGeocode, placeFromTimeZone } from './bottle-place';
import { parseBottle, parseBottles, type Bottle, type Place } from './bottle-rows';
import { EMPTY_OUTBOX, sent, type Outbox, type OutboxItem } from './bottles';
import { parseArtistLookupResponse, type DiscoveryTrack, type Region } from './discovery';
import { catalogTrackById, pacedItunes } from './pool';
import { runNative } from './run-native';

// The network side of Bottles (rules: lib/bottles.ts; server: supabase/bottles.sql). Every row
// from the server goes through lib/bottle-rows.ts, and a bottle's song is always resolved here
// from its track id, through the bundled catalog or the phone's own iTunes lookup. The server
// never hands the phone something to play.

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const TIMEOUT_MS = 10_000;
const PLACE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const K = {
  on: 'blindspotDiscovery:bottlesOn',
  outbox: 'blindspotDiscovery:bottleOutbox',
  place: 'blindspotDiscovery:bottlePlace',
  launches: 'blindspotDiscovery:bottleLaunches',
  seen: 'blindspotDiscovery:bottleSeen',
  fx: 'blindspotDiscovery:bottleLaunchFx',
  oldOffered: 'blindspotDiscovery:bottleOldOffered',
  cityOk: 'blindspotDiscovery:bottleCityOk',
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

// ---------- the Tune switch ----------

/** null until the first-time card has been answered. */
let on: boolean | null = null;
let onLoaded = false;
const onListeners = new Set<() => void>();
const loadOn = readJson<boolean | null>(K.on, null).then((v) => {
  on = v;
  onLoaded = true;
  onListeners.forEach((fn) => fn());
});

export async function loadBottlesOn(): Promise<boolean | null> {
  await loadOn;
  return on;
}

export function saveBottlesOn(value: boolean) {
  on = value;
  onListeners.forEach((fn) => fn());
  writeJson(K.on, value);
}

/** Bottles on, off, or never asked (null). `undefined` while storage is still loading. */
export function useBottlesOn(): boolean | null | undefined {
  return useSyncExternalStore(
    (fn) => {
      onListeners.add(fn);
      return () => onListeners.delete(fn);
    },
    () => (onLoaded ? on : undefined)
  );
}

// ---------- where you are ----------

/** "Use my city" (true) or "Not now" (false) on the first-time card. */
export const saveCityOk = (ok: boolean) => writeJson(K.cityOk, ok);

/** The phone's place for a bottle hop: its city when you said "Use my city", otherwise the time-zone region. Cached a day. */
export async function currentPlace(ask: boolean): Promise<Place> {
  if (!mayUseCity({ cityOk: await readJson<boolean>(K.cityOk, false), asking: ask })) return placeFromTimeZone(timeZone());
  const cached = await readJson<{ place: Place; at: number } | null>(K.place, null);
  if (cached && Date.now() - cached.at < PLACE_MAX_AGE_MS && (cached.place.exact || !ask)) return cached.place;
  const place = (await cityPlace(ask)) ?? placeFromTimeZone(timeZone());
  writeJson(K.place, { place, at: Date.now() });
  return place;
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

async function cityPlace(ask: boolean): Promise<Place | null> {
  const loc = runNative()?.location;
  if (!loc) return null; // the web, and APKs without the module
  try {
    const perm = ask ? await loc.requestForegroundPermissionsAsync() : await loc.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = (await loc.getLastKnownPositionAsync()) ?? (await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Lowest }));
    if (!pos) return null;
    const [g] = await loc.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    return g ? placeFromGeocode(g, pos.coords.latitude, pos.coords.longitude) : null;
  } catch {
    return null;
  }
}

// ---------- calls ----------

type Answer = { kind: 'ok'; data: unknown } | { kind: 'retry' } | { kind: 'drop' };

async function rpc(fn: string, args: object): Promise<Answer> {
  const s = await ensureSession(true);
  if (!s || !URL_ROOT) return { kind: 'retry' };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: abort.signal,
    });
    // 404 = the Bottles functions aren't on the server yet (supabase/bottles.sql not run): keep everything for later.
    if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 404) return { kind: 'retry' };
    if (!res.ok) return { kind: 'drop' };
    const text = await res.text();
    try {
      return { kind: 'ok', data: text ? JSON.parse(text) : null };
    } catch {
      return { kind: 'drop' }; // not JSON: never trust it
    }
  } catch {
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** One bottle lent to this phone for 2 hours, or null (none, offline, or a bad row). */
export async function claimBottle(genreTag: string | null): Promise<Bottle | null> {
  const r = await rpc('claim_bottle', { p_genre_tag: genreTag ?? '' });
  return r.kind === 'ok' ? parseBottle(r.data) : null;
}

/** Bottles you launched or kept that changed since `since` (all when null); null when the server couldn't say. */
export async function myBottles(since: string | null): Promise<Bottle[] | null> {
  const r = await rpc('my_bottles', { p_since: since });
  return r.kind === 'ok' ? parseBottles(r.data) : null;
}

/** The bottle's song, from the bundled catalog or this phone's iTunes store. Null when it can't play here. */
export async function resolveBottleTrack(b: Bottle, region: Region): Promise<DiscoveryTrack | null> {
  let track = catalogTrackById(b.trackId);
  if (!track) {
    const url = `https://itunes.apple.com/lookup?id=${b.trackId}&country=${region}`;
    const json = await pacedItunes(async () => {
      try {
        const res = await fetch(url);
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    });
    track = parseArtistLookupResponse(json).find((t) => t.id === b.trackId) ?? null;
  }
  return track ? { ...track, via: 'bottle', bottleId: b.id, bottle: b } : null;
}

// ---------- the outbox ----------

let outbox: Outbox | null = null;
const outboxReady = readJson<Outbox>(K.outbox, EMPTY_OUTBOX).then((o) => {
  outbox = { pending: null, queued: [...o.queued, ...(o.pending ? [o.pending] : [])] }; // a pending item from a closed app is final
});

export async function queueOutbox(change: (o: Outbox) => Outbox): Promise<void> {
  await outboxReady;
  outbox = change(outbox ?? EMPTY_OUTBOX);
  await writeJson(K.outbox, outbox);
}

let flushing: Promise<void> | null = null;

/** Sends what's queued, oldest first. Stops at the first answer worth retrying; drops what the server refused. */
export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    await outboxReady;
    for (const item of [...(outbox?.queued ?? [])]) {
      const r = await send(item);
      if (r.kind === 'retry') break;
      if (r.kind === 'ok') await noteSent(item, r.data);
      await queueOutbox((o) => sent(o, [item.id]));
    }
  })().finally(() => (flushing = null));
  return flushing;
}

function send(item: OutboxItem): Promise<Answer> {
  return item.kind === 'launch'
    ? rpc('float_bottle', {
        p_track_id: item.trackId,
        p_artist_key: item.artistKey,
        p_genre_tag: item.genreTag,
        p_place: item.place ?? placeFromTimeZone(timeZone()),
        p_old: item.old ?? false,
      })
    : rpc('decide_bottle', { p_id: item.bottleId, p_verdict: item.verdict, p_place: item.place, p_tier: item.tier, p_ring: item.ring });
}

/** What a sent item means for news: a launch or a keep starts a baseline, so only later changes are news. */
async function noteSent(item: OutboxItem, data: unknown) {
  if (!isObj(data)) return;
  if (item.kind === 'launch' && typeof data.id === 'string') {
    await updateSeen((s) => ({ ...s, [data.id as string]: { keeps: 0, state: 'floating', launched: true } }));
  } else if (item.kind === 'verdict' && item.verdict === 'keep' && data.ok === true && typeof data.keeps === 'number') {
    await updateSeen((s) => ({ ...s, [item.bottleId]: { keeps: data.keeps as number, state: 'floating', launched: false } }));
  }
}

// ---------- small counters ----------

export const loadBottleSeen = () => readJson<BottleSeen>(K.seen, {});
let seenChain: Promise<void> = Promise.resolve();
export function updateSeen(change: (s: BottleSeen) => BottleSeen): Promise<void> {
  seenChain = seenChain.then(async () => writeJson(K.seen, change(await loadBottleSeen())));
  return seenChain;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function launchesToday(): Promise<number> {
  const v = await readJson<{ day: string; n: number }>(K.launches, { day: '', n: 0 });
  return v.day === today() ? v.n : 0;
}

export async function noteLaunch(): Promise<void> {
  await writeJson(K.launches, { day: today(), n: (await launchesToday()) + 1 });
}

/** How many times the launch light has played; it plays for the first 3 launches only. */
export const loadLaunchFxCount = () => readJson<number>(K.fx, 0);
export const saveLaunchFxCount = (n: number) => writeJson(K.fx, n);

/** "Float your old finds" is offered once. */
export const loadOldFindsOffered = () => readJson<boolean>(K.oldOffered, false);
export const saveOldFindsOffered = () => writeJson(K.oldOffered, true);
