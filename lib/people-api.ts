import AsyncStorage from '@react-native-async-storage/async-storage';

import { ensureSession, hasStoredSession } from './auth';
import { resolveTrackById } from './bottles-api';
import type { DiscoveryTrack } from './discovery';
import { loadLikedTracks, loadRegion } from './discovery-storage';
import { normalizeArtist } from './human-check';
import { hideFromDiscovery } from './human-check-api';
import {
  matchScore,
  parseDeck,
  parsePeople,
  personPrintSeeds,
  sortPeople,
  type Intent,
  type Person,
} from './people';
import { soundFor } from './sound-index';
import { lookupTracks } from './song-details';
import type { Platform } from './twins';
import { api, leaveTwins, myProfile, rpc, saveProfile } from './twins-api';

const K = {
  ageLock: 'people-age-lock-v1',
  ageOk: 'people-age-ok-v1',
  member: 'people-member-v1',
  known: 'people-known-v1',
  outbox: 'people-outbox-v1',
  printSent: 'people-print-sent-v1',
};

export type DeckCard = { track: DiscoveryTrack; heartedBy: number };
export type PeopleStatus = 'locked' | 'new' | 'member' | 'offline';
export type Progress = { close: number; judged: number; members: number };
export type JoinDetails = { name: string; handle: string | null; platform: Platform | null; intent: Intent };

// ---------- who you are here ----------

/** Under the age gate's line, this phone stops asking. The date itself is never stored or sent. */
export const lockAge = () => AsyncStorage.setItem(K.ageLock, 'true');
export const markAgeOk = () => AsyncStorage.setItem(K.ageOk, 'true');
export const ageWasOk = async () => (await AsyncStorage.getItem(K.ageOk)) === 'true';

export async function peopleStatus(): Promise<PeopleStatus> {
  if ((await AsyncStorage.getItem(K.ageLock)) === 'true') return 'locked';
  const profile = await myProfile();
  if (profile === 'error') return 'offline';
  const member = !!profile && profile.adult && !!profile.people_at && !!profile.intent;
  await AsyncStorage.setItem(K.member, member ? 'true' : 'false');
  return member ? 'member' : 'new';
}

async function myPrint() {
  return personPrintSeeds(await loadLikedTracks(), (id) => soundFor(id));
}

/** Only ever called after the consent screen. saveProfile uploads the Library's hearts, as that screen says. */
export async function joinPeople(d: JoinDetails): Promise<boolean> {
  if (!(await saveProfile({ ...d, adult: true, print: await myPrint() }))) return false;
  const r = await rpc('join_people');
  if (!r.ok || r.data !== true) return false;
  await AsyncStorage.setItem(K.member, 'true');
  return true;
}

export async function loadDetails(): Promise<JoinDetails | null> {
  const p = await myProfile();
  return p && p !== 'error' && p.intent ? { name: p.name, handle: p.handle, platform: p.platform, intent: p.intent } : null;
}

export async function leavePeople(): Promise<boolean> {
  if (!(await leaveTwins())) return false;
  await AsyncStorage.multiRemove([K.member, K.known, K.outbox, K.printSent]);
  return true;
}

/** Your rings follow your hearts. At most one small write per open, and none when nothing changed. */
export async function refreshPrint(): Promise<void> {
  const print = await myPrint();
  const sent = JSON.stringify(print);
  if ((await AsyncStorage.getItem(K.printSent)) === sent) return;
  const session = await ensureSession();
  if (!session) return;
  const r = await api(`twin_profiles?user_id=eq.${session.userId}`, { method: 'PATCH', body: { print }, prefer: 'return=minimal' });
  if (r.ok) await AsyncStorage.setItem(K.printSent, sent);
}

// ---------- verdicts: kept on the phone until the server has them ----------

type Verdict = { trackId: number; hearted: boolean; artistKey: string };

let flushing: Promise<void> | null = null;

async function readOutbox(): Promise<Verdict[]> {
  try {
    const raw = await AsyncStorage.getItem(K.outbox);
    return raw ? (JSON.parse(raw) as Verdict[]) : [];
  } catch {
    return [];
  }
}

export function flushVerdicts(): Promise<void> {
  flushing ??= (async () => {
    try {
      for (;;) {
        const [next] = await readOutbox();
        if (!next) return;
        const r = await rpc('people_swipe', { p_track: next.trackId, p_hearted: next.hearted, p_artist_key: next.artistKey });
        if (!r.ok) return; // Offline: it stays queued for the next open.
        await AsyncStorage.setItem(K.outbox, JSON.stringify((await readOutbox()).filter((v) => v.trackId !== next.trackId)));
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export async function sendVerdict(track: DiscoveryTrack, hearted: boolean): Promise<void> {
  const artistKey = normalizeArtist(track.artistName) || 'unknown';
  const rest = (await readOutbox()).filter((v) => v.trackId !== track.id);
  await AsyncStorage.setItem(K.outbox, JSON.stringify([...rest, { trackId: track.id, hearted, artistKey }]));
  await flushVerdicts();
}

// ---------- the deck ----------

/** The next songs, resolved through the catalog or iTunes: the server only ever gives track ids. Skips what can't play here. */
export async function fetchDeck(lim: number, skip: Set<number>): Promise<DeckCard[] | null> {
  await flushVerdicts();
  const r = await rpc('people_deck', { lim });
  if (!r.ok) return null;
  const songs = parseDeck(r.data).filter((s) => !skip.has(s.trackId));
  const region = await loadRegion();
  const cards = await Promise.all(
    songs.map(async (s): Promise<DeckCard | null> => {
      const track = await resolveTrackById(s.trackId, region);
      return track?.previewUrl && !hideFromDiscovery(track.artistName) ? { track: { ...track, via: undefined }, heartedBy: s.heartedBy } : null;
    })
  );
  return cards.filter((c): c is DeckCard => c !== null);
}

// ---------- the people ----------

const people = new Map<string, Person>();
export const cachedPerson = (id: string) => people.get(id) ?? null;

const logged = new Map<string, string>();
function logShown(p: Person) {
  const stamp = `${p.score.shared}/${p.row.both_rated}/${p.score.score.toFixed(2)}`;
  if (logged.get(p.row.person) === stamp) return;
  logged.set(p.row.person, stamp);
  rpc('people_log_shown', { p_person: p.row.person, p_shared: p.score.shared, p_rated: p.row.both_rated, p_score: p.score.score });
}

/** Everyone you're in tune with, best first. Null when the server couldn't say. */
export async function fetchPeople(): Promise<Person[] | null> {
  const r = await rpc('my_people');
  if (!r.ok) return null;
  const listeners = new Map((await loadLikedTracks()).map((t) => [t.id, t.artistListeners]));
  const list = sortPeople(parsePeople(r.data).map((row) => ({ row, score: matchScore(row, (id) => listeners.get(id)) })));
  people.clear();
  list.forEach((p) => {
    people.set(p.row.person, p);
    logShown(p);
  });
  return list;
}

export async function fetchProgress(): Promise<Progress | null> {
  const r = await rpc('people_progress');
  const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
  return row ? { close: Number(row.close) || 0, judged: Number(row.judged) || 0, members: Number(row.members) || 0 } : null;
}

/** Who you've already had the moment with, so it only ever plays once per person. */
export async function loadKnown(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(K.known);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
export const saveKnown = (known: Set<string>) => AsyncStorage.setItem(K.known, JSON.stringify([...known]));

/** What you share, and, once you've both waved, what else they hearted. */
export async function fetchPersonSongs(id: string): Promise<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] }> {
  const r = await rpc('person_songs', { p_person: id });
  const rows = (r.ok && Array.isArray(r.data) ? r.data : []) as { track_id: number; shared: boolean }[];
  const ids = rows.map((x) => x.track_id).filter((x) => Number.isInteger(x) && x > 0);
  const tracks = await lookupTracks(ids);
  const shared = new Set(rows.filter((x) => x.shared === true).map((x) => x.track_id));
  return { shared: tracks.filter((t) => shared.has(t.id)), theirs: tracks.filter((t) => !shared.has(t.id)) };
}

// ---------- the dot on the tab ----------

type NewsListener = (waiting: boolean) => void;
const newsListeners = new Set<NewsListener>();
export function onPeopleNews(fn: NewsListener): () => void {
  newsListeners.add(fn);
  return () => {
    newsListeners.delete(fn);
  };
}
export function tellPeopleNews(list: Person[]) {
  const waiting = list.some((p) => p.row.they_waved && !p.row.i_waved);
  newsListeners.forEach((fn) => fn(waiting));
}

let lastCheck = 0;
/** Someone waved at you: the tab gets a dot. At most once a minute, and only for members, so a visitor is never signed up. */
export async function checkPeopleNews(): Promise<void> {
  if (Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  if ((await AsyncStorage.getItem(K.member)) !== 'true' || !(await hasStoredSession())) return;
  const list = await fetchPeople();
  if (list) tellPeopleNews(list);
}
