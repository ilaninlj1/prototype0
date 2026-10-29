// Sound decks: swipe through one kind of sound across every genre — "Quiet and sparse", a key, a BPM band, or
// songs like one you loved. Details' sound tiles open them (soundTiles reads exactly like describeSound), and
// the What to swipe page lists them all. Pure; lib/pool.ts deckPool supplies the measured catalog.

import { pickNeighbors } from './sound-neighbors.ts';
import { keyLabel, type SoundFeatures } from './sound.ts';
import type { DiscoveryTrack } from './discovery.ts';

export type SoundDeckId = 'quiet' | 'medium' | 'loud' | 'slow' | 'mid' | 'fast' | 'instrumental' | 'talky' | 'acoustic' | 'electronic' | 'danceable' | 'bright' | 'moody';

export type Deck =
  | { kind: 'sound'; id: SoundDeckId }
  | { kind: 'key'; key: number; mode: 0 | 1 }
  | { kind: 'tempo'; lo: number; hi: number }
  | { kind: 'like'; trackId: number; label: string; sound: SoundFeatures };

const isLoud = (s: SoundFeatures) => s.energy >= 0.7 && s.loudness >= -8; // lib/sound.ts describeSound's rule

/** The sound decks, in the page's order. The first nine are the rules Details' tiles use. */
export const SOUND_DECKS: { id: SoundDeckId; label: string; test: (s: SoundFeatures) => boolean }[] = [
  { id: 'quiet', label: 'Quiet and sparse', test: (s) => !isLoud(s) && s.energy < 0.35 },
  { id: 'medium', label: 'Medium energy', test: (s) => !isLoud(s) && s.energy >= 0.35 },
  { id: 'loud', label: 'Loud and dense', test: isLoud },
  { id: 'slow', label: 'Slow', test: (s) => s.tempo < 90 },
  { id: 'mid', label: 'Mid-tempo', test: (s) => s.tempo >= 90 && s.tempo < 120 },
  { id: 'fast', label: 'Fast', test: (s) => s.tempo >= 120 },
  { id: 'instrumental', label: 'Mostly instrumental', test: (s) => s.instrumentalness > 0.5 },
  { id: 'talky', label: 'Lots of talking or rap', test: (s) => s.speechiness > 0.33 },
  { id: 'acoustic', label: 'Acoustic', test: (s) => s.acousticness > 0.6 },
  { id: 'electronic', label: 'Electronic', test: (s) => s.acousticness < 0.04 },
  { id: 'danceable', label: 'Danceable', test: (s) => s.danceability >= 0.7 },
  { id: 'bright', label: 'Bright and happy', test: (s) => s.valence >= 0.65 },
  { id: 'moody', label: 'Dark and moody', test: (s) => s.valence < 0.3 },
];
const SOUND_BY_ID = new Map(SOUND_DECKS.map((d) => [d.id, d]));

/** BPM bands, edge to edge: lo is included, hi isn't. */
export const TEMPO_BANDS: [number, number][] = [
  [60, 80],
  [80, 95],
  [95, 110],
  [110, 120],
  [120, 130],
  [130, 145],
  [145, 180],
];

/** Every deck the What to swipe page offers: the sounds, all 24 keys (major then minor, round the circle of fifths), the tempo bands. */
export function allDecks(): Deck[] {
  const fifths = Array.from({ length: 12 }, (_, i) => (i * 7) % 12);
  return [
    ...SOUND_DECKS.map((d): Deck => ({ kind: 'sound', id: d.id })),
    ...([1, 0] as const).flatMap((mode) => fifths.map((key): Deck => ({ kind: 'key', key, mode }))),
    ...TEMPO_BANDS.map(([lo, hi]): Deck => ({ kind: 'tempo', lo, hi })),
  ];
}

export function deckKey(d: Deck): string {
  switch (d.kind) {
    case 'sound':
      return `sound:${d.id}`;
    case 'key':
      return `key:${d.key}:${d.mode}`;
    case 'tempo':
      return `tempo:${d.lo}-${d.hi}`;
    case 'like':
      return `like:${d.trackId}`;
  }
}

export function deckLabel(d: Deck): string {
  switch (d.kind) {
    case 'sound':
      return SOUND_BY_ID.get(d.id)?.label ?? d.id;
    case 'key':
      return keyLabel(d.key, d.mode) ?? 'One key';
    case 'tempo':
      return `${d.lo}–${d.hi} BPM`;
    case 'like':
      return `Like “${d.label}”`;
  }
}

export function deckMatches(d: Deck, s: SoundFeatures): boolean {
  switch (d.kind) {
    case 'sound':
      return SOUND_BY_ID.get(d.id)?.test(s) ?? false;
    case 'key':
      return s.key === d.key && s.mode === d.mode;
    case 'tempo':
      return s.tempo >= d.lo && s.tempo < d.hi;
    case 'like':
      return true; // ranked by closeness instead (pickDeck)
  }
}

function tempoBand(bpm: number): Deck {
  const band = TEMPO_BANDS.find(([lo, hi]) => bpm >= lo && bpm < hi) ?? (bpm < 60 ? TEMPO_BANDS[0] : TEMPO_BANDS[TEMPO_BANDS.length - 1]);
  return { kind: 'tempo', lo: band[0], hi: band[1] };
}

const pace = (tempo: number) => (tempo < 90 ? 'Slow' : tempo < 120 ? 'Mid-tempo' : 'Fast');

/** Details' sound tiles, word for word as lib/sound.ts describeSound, each with the deck it opens. */
export function soundTiles(f: SoundFeatures): { label: string; deck: Deck }[] {
  const tiles: { label: string; deck: Deck }[] = [{ label: `${pace(f.tempo)} · ${Math.round(f.tempo)} BPM`, deck: tempoBand(f.tempo) }];
  const key = keyLabel(f.key, f.mode);
  if (key !== null && f.key !== null && (f.mode === 0 || f.mode === 1)) tiles.push({ label: key, deck: { kind: 'key', key: f.key, mode: f.mode } });
  else if (key !== null) tiles.push({ label: key, deck: tempoBand(f.tempo) });
  const energy: SoundDeckId = isLoud(f) ? 'loud' : f.energy < 0.35 ? 'quiet' : 'medium';
  tiles.push({ label: SOUND_BY_ID.get(energy)!.label, deck: { kind: 'sound', id: energy } });
  if (f.instrumentalness > 0.5) tiles.push({ label: 'Mostly instrumental', deck: { kind: 'sound', id: 'instrumental' } });
  if (f.speechiness > 0.33) tiles.push({ label: 'Lots of talking or rap', deck: { kind: 'sound', id: 'talky' } });
  if (f.acousticness > 0.6) tiles.push({ label: 'Acoustic', deck: { kind: 'sound', id: 'acoustic' } });
  return tiles;
}

export type DeckCandidate = { track: DiscoveryTrack; artist: string; sound: SoundFeatures };

/** The next songs for a deck: unheard, kept artists only, one per artist, shuffled (a like deck goes closest first). */
export function pickDeck(
  pool: DeckCandidate[],
  d: Deck,
  o: { heard: Set<number>; keep: (artist: string) => boolean; n: number; rand: () => number }
): DiscoveryTrack[] {
  const open = pool.filter((c) => !o.heard.has(c.track.id) && o.keep(c.artist) && (d.kind !== 'like' || c.track.id !== d.trackId));
  if (d.kind === 'like') return pickNeighbors(d.sound, '', open.map((c) => ({ item: c.track, artist: c.artist, sound: c.sound })), o.n);
  const matching = open.filter((c) => deckMatches(d, c.sound));
  for (let i = matching.length - 1; i > 0; i--) {
    const j = Math.floor(o.rand() * (i + 1));
    [matching[i], matching[j]] = [matching[j], matching[i]];
  }
  const artists = new Set<string>();
  const out: DiscoveryTrack[] = [];
  for (const c of matching) {
    if (artists.has(c.artist)) continue;
    artists.add(c.artist);
    out.push(c.track);
    if (out.length >= o.n) break;
  }
  return out;
}

/** How many unheard songs each deck has left, by deckKey. */
export function deckCounts(pool: DeckCandidate[], decks: Deck[], heard: Set<number>): Map<string, number> {
  const counts = new Map(decks.map((d) => [deckKey(d), 0]));
  for (const c of pool) {
    if (heard.has(c.track.id)) continue;
    for (const d of decks) if (deckMatches(d, c.sound)) counts.set(deckKey(d), counts.get(deckKey(d))! + 1);
  }
  return counts;
}
