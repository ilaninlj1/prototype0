// People: you swipe the song, not the person. Who you're in tune with, and how to say it.
// Pure; the network side is lib/people-api.ts. Spec docs/superpowers/specs/2026-11-02-people-design.md.

import { ringSeedOf } from './bottle-print.ts';
import type { RingSeed } from './bottle-rows.ts';
import type { SoundFeatures } from './sound.ts';

export type Intent = 'friends' | 'dating' | 'either';
const MODES: readonly string[] = ['friends', 'dating', 'either'];

const ADULT = 18;
const MAX_RINGS = 12;
const DEFAULT_MIN_SCORE = 1.25;

/** One row of the database's my_people(). */
export type PersonRow = {
  person: string;
  name: string;
  mode: Intent;
  shared_tracks: number[];
  both_rated: number;
  they_hearted_i_rated: number;
  i_hearted_they_rated: number;
  my_hearts: number;
  my_cards: number;
  their_hearts: number;
  their_cards: number;
  i_waved: boolean;
  they_waved: boolean;
  print: RingSeed[];
  min_score: number;
};

export type Score = { shared: number; weighted: number; expected: number; score: number };
export type Person = { row: PersonRow; score: Score };

/**
 * Asked as a month and year, so anyone in their 18th birthday month could still
 * be 17 and doesn't pass until it's over. The date itself never leaves the phone.
 */
export function isAdult(year: number, month: number, now: Date): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  if (year < now.getFullYear() - 120) return false;
  const months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return months > ADULT * 12;
}

/** How often someone hearts a card in the deck. The +1 and +5 start a new member near one in five. */
export function heartRate(hearts: number, cards: number): number {
  return (hearts + 1) / (cards + 5);
}

/** A shared heart counts once on a million-listener artist, up to twice under a thousand. Unknown counts once. */
export function rarityWeight(listeners: number | null | undefined): number {
  if (!listeners || listeners <= 0) return 1;
  return Math.max(1, Math.min(2, 1 + (6 - Math.log10(listeners)) / 3));
}

/**
 * Shared hearts against what chance would give. Chance takes the larger direction,
 * so one generous swiper can't make a match; the +1s pull small samples toward "unknown".
 * 1 means chance. Skips don't count at all: most songs get skipped, so two strangers
 * agree most of the time just by both skipping.
 */
export function matchScore(row: PersonRow, listenersOf: (trackId: number) => number | null | undefined): Score {
  const expected = Math.max(
    row.they_hearted_i_rated * heartRate(row.my_hearts, row.my_cards),
    row.i_hearted_they_rated * heartRate(row.their_hearts, row.their_cards)
  );
  const weighted = row.shared_tracks.reduce((sum, id) => sum + rarityWeight(listenersOf(id)), 0);
  return { shared: row.shared_tracks.length, weighted, expected, score: (weighted + 1) / (expected + 1) };
}

/** The server holds back anyone under its overlap floors; this adds the score. A wave keeps someone on the list either way. */
export function isInTune(row: PersonRow, score: Score): boolean {
  return row.i_waved || row.they_waved || score.score >= row.min_score;
}

export function newlyInTune(known: Set<string>, ids: string[]): string[] {
  return ids.filter((id) => !known.has(id));
}

/** Someone waiting on your answer first, then the best score. */
export function sortPeople(people: Person[]): Person[] {
  const waiting = (p: Person) => (p.row.they_waved && !p.row.i_waved ? 1 : 0);
  return [...people].sort((a, b) => waiting(b) - waiting(a) || b.score.score - a.score.score);
}

export function chanceSentence(shared: number, expected: number): string {
  const you = shared === 1 ? 'You both hearted the same song.' : `You both hearted ${shared} of the same songs.`;
  return `${you} Chance says ${expected < 0.75 ? 'less than 1' : `about ${Math.round(expected)}`}.`;
}

export function modeLabel(mode: Intent): string {
  return mode === 'friends' ? 'Friends' : mode === 'dating' ? 'Dating' : 'Friends or dating';
}

export function deckProgressLine({ close, judged }: { close: number; judged: number }): string {
  if (close > 0) return close === 1 ? '1 person is getting close.' : `${close} people are getting close.`;
  if (judged === 0) return 'Your first songs start here.';
  return judged === 1 ? '1 song judged so far.' : `${judged} songs judged so far.`;
}

/** Your face here: up to 12 rings, one per recent heart with sound data, oldest first. Numbers only, never the song. */
export function personPrintSeeds(
  liked: { id: number; likedAt?: number }[],
  soundOf: (id: number) => Pick<SoundFeatures, 'key' | 'mode' | 'energy' | 'tempo'> | null
): RingSeed[] {
  return [...liked]
    .sort((a, b) => (a.likedAt ?? 0) - (b.likedAt ?? 0))
    .map((t) => ringSeedOf(soundOf(t.id) as SoundFeatures | null))
    .filter((s): s is RingSeed => s !== null)
    .slice(-MAX_RINGS);
}

// ---------- what comes from the server is untrusted ----------

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isTrackId = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0;

function parseRing(raw: unknown): RingSeed | null {
  const r = raw as Partial<Record<keyof RingSeed, unknown>> | null;
  if (!r || typeof r !== 'object' || typeof r.energy !== 'number' || typeof r.tempo !== 'number') return null;
  if (!Number.isFinite(r.energy) || !Number.isFinite(r.tempo)) return null;
  const key = typeof r.key === 'number' && Number.isInteger(r.key) && r.key >= 0 && r.key < 12 ? r.key : null;
  const mode = r.mode === 0 || r.mode === 1 ? r.mode : null;
  return { key, mode, energy: clamp(r.energy, 0, 1), tempo: clamp(r.tempo, 30, 250) };
}

function parsePerson(raw: any): PersonRow | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.person !== 'string' || !raw.person || typeof raw.name !== 'string' || !raw.name) return null;
  if (!MODES.includes(raw.mode) || !Array.isArray(raw.shared_tracks)) return null;
  const counts = ['both_rated', 'they_hearted_i_rated', 'i_hearted_they_rated', 'my_hearts', 'my_cards', 'their_hearts', 'their_cards'] as const;
  if (!counts.every((k) => isCount(raw[k]))) return null;
  return {
    person: raw.person,
    name: raw.name.slice(0, 30),
    mode: raw.mode,
    shared_tracks: raw.shared_tracks.filter(isTrackId),
    both_rated: raw.both_rated,
    they_hearted_i_rated: raw.they_hearted_i_rated,
    i_hearted_they_rated: raw.i_hearted_they_rated,
    my_hearts: raw.my_hearts,
    my_cards: raw.my_cards,
    their_hearts: raw.their_hearts,
    their_cards: raw.their_cards,
    i_waved: raw.i_waved === true,
    they_waved: raw.they_waved === true,
    print: (Array.isArray(raw.print) ? raw.print : []).slice(0, MAX_RINGS).map(parseRing).filter((r: RingSeed | null): r is RingSeed => r !== null),
    min_score: isCount(raw.min_score) ? raw.min_score : DEFAULT_MIN_SCORE,
  };
}

export function parsePeople(data: unknown): PersonRow[] {
  if (!Array.isArray(data)) return [];
  return data.map(parsePerson).filter((p): p is PersonRow => p !== null);
}

export type DeckSong = { trackId: number; heartedBy: number };

export function parseDeck(data: unknown): DeckSong[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const songs: DeckSong[] = [];
  for (const raw of data as { track_id?: unknown; hearted_by?: unknown }[]) {
    if (!raw || !isTrackId(raw.track_id) || seen.has(raw.track_id)) continue;
    seen.add(raw.track_id);
    songs.push({ trackId: raw.track_id, heartedBy: isCount(raw.hearted_by) ? raw.hearted_by : 0 });
  }
  return songs;
}
