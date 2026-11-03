// A person's ocean, derived from listening and saves without storing extra state.
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { SoundFeatures } from './sound.ts';
import { FULL_LISTEN_MS } from './dark-map.ts';
import { MIN_SAVES, tasteDistance, tierFor } from './taste-distance.ts';
import { soundDistance } from './sound-neighbors.ts';
import { anatomyLines, anatomyOf, type Anatomy } from './ocean-anatomy.ts';
import { climbLevels, climbedRow, compactCount } from './ocean-climb.ts';
import {
  allPlaces, DEPTH_INFO, DEPTHS, driftWater, placeKey, speciesOf, waterOf, WATER_INFO, WATERS,
  type Depth, type Kind, type Place, type Water,
} from './ocean-map.ts';

export type Creature = {
  trackId: number; artist: string; kind: Kind; place: Place; color: string;
  heard: number;
  hurried: boolean;
  size: number;
  vivid: number;
  likedAt: number | null;
  foundHour: number | null;
  rare: boolean;
  first: boolean;
  school: string | null;
  seed: number;
  /** A second color from the song's print, for its markings. */
  accent: string;
  anatomy: Anatomy;
  sound: SoundFeatures | null;
  /** The level you found it at (0 Popular to 3 Buried). `place` is where it swims now. */
  foundRow: number;
  /** Levels climbed since, as its artist gained listeners. */
  climb: number;
  foundListeners: number | null;
  nowListeners: number | null;
};
export type CoralPiece = { trackId: number; place: Place; color: string; form: 0 | 1 | 2; size: number; seed: number };
export type SandLife = { rise: number; specks: { color: string; seed: number }[] };
export type PlaceLife = { place: Place; creatures: Creature[]; coral: CoralPiece[]; sand: SandLife; heard: number };
export type OceanLife = { places: Record<string, PlaceLife>; total: number; heardTotal: number; oldest: Creature | null };

export type OceanInput = {
  history: SwipeEntry[];
  liked: DiscoveryTrack[];
  soundOf: (id: number) => SoundFeatures | null;
  depthOf: (t: DiscoveryTrack | SwipeEntry) => Depth;
  colorOf: (id: number) => string;
  /** A second color from the song's print; its main color when not given. */
  accentOf?: (id: number) => string;
  /** Today's listeners for an artist, when known. Without it nothing climbs. */
  listenersNowOf?: (artist: string) => number | null;
  now: number;
};

export const EXAMPLE_NOTICE = 'This is an example made from a fictional listening history. It does not change your ocean.';

// Caps are per place; months use 30 days so growth is continuous through calendar changes.
const CORAL_CAP = 48;
const SAND_CAP = 160;
const MONTH_MS = 30 * 86_400_000;
const HEARD_ACTIONS = new Set(['like', 'reveal', 'skip', 'genre-jump']);

type Listening = { entry: SwipeEntry; heard: number; blind: boolean; reveal: boolean; sand: boolean };
const savedAt = (t: DiscoveryTrack): number | null => Number.isFinite(t.likedAt) ? t.likedAt! : null;
const monthsHeld = (at: number, now: number) => Math.max(0, (now - at) / MONTH_MS);
const seedOf = (id: number) => Math.imul((id >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
const heardFor = (ms: number | undefined) => ms == null ? 0.5 : Number.isFinite(ms) ? Math.max(0, Math.min(1, ms / FULL_LISTEN_MS)) : 0;

function wasRare(song: SoundFeatures, previous: SoundFeatures[]): boolean {
  if (previous.length < MIN_SAVES) return false;
  // tasteDistance averages the closest three and requires five saves. Keep the closest five
  // in one pass so each find does not sort its entire earlier library (56 ms at 500 saves).
  const nearest: { sound: SoundFeatures; distance: number }[] = [];
  for (const sound of previous) {
    const distance = soundDistance(song, sound);
    let at = nearest.length;
    while (at > 0 && nearest[at - 1].distance > distance) at--;
    if (at >= MIN_SAVES) continue;
    nearest.splice(at, 0, { sound, distance });
    if (nearest.length > MIN_SAVES) nearest.pop();
  }
  const distance = tasteDistance(song, nearest.map((n) => n.sound));
  return distance !== null && tierFor(distance) === 'deep';
}

export function buildOcean(input: OceanInput): OceanLife {
  const { history, liked, soundOf, depthOf, colorOf, now } = input;
  const places: Record<string, PlaceLife> = {};
  for (const place of allPlaces()) places[placeKey(place)] = {
    place, creatures: [], coral: [], sand: { rise: 0, specks: [] }, heard: 0,
  };

  const listening = new Map<number, Listening>();
  let firstEntry = Infinity;
  for (const entry of history) {
    if (Number.isFinite(entry.timestamp)) firstEntry = Math.min(firstEntry, entry.timestamp);
    if (!HEARD_ACTIONS.has(entry.action)) continue;
    let record = listening.get(entry.trackId);
    if (!record) {
      record = { entry, heard: 0, blind: false, reveal: false, sand: false };
      listening.set(entry.trackId, record);
    }
    if (entry.timestamp > record.entry.timestamp) record.entry = entry;
    const heard = heardFor(entry.listenMs);
    record.heard = Math.max(record.heard, heard);
    if (entry.source !== 'run' && (entry.action === 'like' || entry.action === 'reveal')) record.blind = true;
    if (entry.action === 'reveal') record.reveal = true;
    if (entry.source !== 'run' && (entry.action === 'skip' || entry.action === 'genre-jump') && heard >= 2000 / FULL_LISTEN_MS) record.sand = true;
  }

  const sounds = new Map<number, SoundFeatures | null>();
  function sound(id: number): SoundFeatures | null {
    if (!sounds.has(id)) sounds.set(id, soundOf(id));
    return sounds.get(id)!;
  }
  function home(id: number, track: DiscoveryTrack | SwipeEntry): PlaceLife {
    const s = sound(id);
    return places[placeKey({ water: s ? waterOf(s) : driftWater(id), depth: depthOf(track) })];
  }

  const saves = new Map(liked.map((t) => [t.id, t]));
  const ordered = [...saves.values()].sort((a, b) => (savedAt(a) ?? Infinity) - (savedAt(b) ?? Infinity) || a.id - b.id);
  const all: Creature[] = [];
  const artistKeys = new Map<number, string>();
  const heardIds = new Set<number>();
  const previous: SoundFeatures[] = [];
  let before = 0;

  for (const track of ordered) {
    const likedAt = savedAt(track);
    // Add only strictly earlier, dated saves. Simultaneous saves cannot define one another's rarity.
    if (likedAt !== null) {
      while (before < ordered.length) {
        const prior = ordered[before];
        const at = savedAt(prior);
        if (at === null || at >= likedAt) break;
        const s = sound(prior.id);
        if (s) previous.push(s);
        before++;
      }
    }
    const record = listening.get(track.id);
    const predatesLog = likedAt !== null && Number.isFinite(firstEntry) && likedAt < firstEntry;
    if (!track.foundBlind && !record?.blind && !predatesLog) continue;

    const s = sound(track.id);
    const heard = record?.heard ?? 0.5;
    const hurried = heard < 0.5;
    const ageSize = 0.75 + 1.05 * (1 - Math.exp(-(likedAt === null ? 0 : monthsHeld(likedAt, now)) / 4));
    const found = home(track.id, track);
    const foundRow = DEPTHS.indexOf(found.place.depth);
    const foundListeners = track.artistListeners ?? null;
    const nowListeners = input.listenersNowOf?.(track.artistName) ?? null;
    const climb = climbLevels(foundListeners, nowListeners);
    const place = places[placeKey({ water: found.place.water, depth: DEPTHS[climbedRow(foundRow, climb).row] })];
    const creature: Creature = {
      trackId: track.id, artist: track.artistName, kind: s ? speciesOf(s) : 'drifter', place: place.place,
      color: colorOf(track.id), heard, hurried, size: hurried ? Math.min(0.9, ageSize) : ageSize,
      vivid: 0.25 + 0.75 * heard, likedAt, foundHour: likedAt === null ? null : new Date(likedAt).getHours(),
      rare: s !== null && likedAt !== null && wasRare(s, previous), first: false, school: null, seed: seedOf(track.id),
      accent: (input.accentOf ?? colorOf)(track.id), anatomy: anatomyOf(s), sound: s,
      foundRow, climb, foundListeners, nowListeners,
    };
    place.creatures.push(creature);
    all.push(creature);
    artistKeys.set(track.id, track.artistId > 0 ? `artist:${track.artistId}` : `artist:${track.artistName.trim().toLowerCase() || track.id}`);
    if (heard > 0) {
      heardIds.add(track.id);
      place.heard++;
    }
  }

  const oldest = all.find((c) => !c.hurried && c.likedAt !== null) ?? null;
  if (oldest) {
    oldest.first = true;
    oldest.size = Math.min(1.9, all.reduce((max, c) => Math.max(max, c.size), 0) + 0.05);
  }

  // Newest marks survive the caps; repeated listens never make duplicate coral or sand.
  const records = [...listening].sort((a, b) => b[1].entry.timestamp - a[1].entry.timestamp || a[0] - b[0]);
  for (const [id, record] of records) {
    const place = home(id, saves.get(id) ?? record.entry);
    if (record.heard > 0 && !heardIds.has(id)) {
      heardIds.add(id);
      place.heard++;
    }
    const seed = seedOf(id);
    if (record.reveal && !saves.has(id) && place.coral.length < CORAL_CAP) {
      place.coral.push({ trackId: id, place: place.place, color: colorOf(id), form: (seed % 3) as 0 | 1 | 2, size: 0.55 + 0.45 * record.heard, seed });
    }
    if (record.sand && place.sand.specks.length < SAND_CAP) place.sand.specks.push({ color: colorOf(id), seed });
  }
  for (const place of Object.values(places)) {
    place.sand.rise = place.sand.specks.length / SAND_CAP;
    const counts = new Map<string, number>();
    for (const c of place.creatures) {
      const key = artistKeys.get(c.trackId)!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const c of place.creatures) {
      const key = artistKeys.get(c.trackId)!;
      if (counts.get(key)! >= 2) c.school = key;
    }
    place.creatures.sort((a, b) => (b.likedAt ?? -Infinity) - (a.likedAt ?? -Infinity) || a.trackId - b.trackId);
  }
  return { places, total: all.length, heardTotal: heardIds.size, oldest };
}

/** A half-open 12-hour window, from six hours before the found hour to six hours after. */
export function isAwake(c: Creature, hour: number): boolean {
  if (c.foundHour === null) return true;
  const sinceStart = ((hour - c.foundHour + 6) % 24 + 24) % 24;
  return sinceStart < 12;
}

const atNight = (hour: number) => hour >= 20 || hour < 6;
function clockTime(at: number): string {
  const date = new Date(at);
  const hour = date.getHours();
  return `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}
function ageWords(at: number, now: number): string {
  const months = Math.floor(monthsHeld(at, now));
  return months === 0 ? 'less than a month' : `${months} ${months === 1 ? 'month' : 'months'}`;
}

export function whyLines(c: Creature, now: number): string[] {
  const lines: string[] = [];
  if (c.kind === 'drifter') lines.push("A drifter because this song's sound has not been measured yet.");
  else {
    const reason: Record<Exclude<Kind, 'drifter'>, string> = {
      jelly: 'A jellyfish because the song is quiet.',
      turtle: 'A turtle because the song is slow.',
      puffer: 'A puffer because the song is loud.',
      darter: 'A darting fish because the song is fast.',
      clown: 'A clownfish because the song is right in the middle: not too quiet, slow, loud or fast.',
      manta: 'A manta ray because the song is instrumental and unhurried.',
      eel: 'An eel because the song has a lot of talking or rapping.',
      seahorse: 'A seahorse because the song is danceable and unhurried.',
    };
    lines.push(reason[c.kind]);
  }
  lines.push(...anatomyLines(c.anatomy));
  if (c.foundListeners != null && c.nowListeners != null) {
    const at = `Found in ${DEPTH_INFO[DEPTHS[c.foundRow]].name} at ${compactCount(c.foundListeners)}.`;
    const nowRow = DEPTHS.indexOf(c.place.depth);
    if (nowRow < c.foundRow) lines.push(`${at} Now ${compactCount(c.nowListeners)}, so it has climbed to ${DEPTH_INFO[c.place.depth].name}.`);
    else if (c.climb > 0) lines.push(`${at} Now ${compactCount(c.nowListeners)}, so it has swum up a little.`);
  }
  if (c.hurried) lines.push('Small and faint because you only listened briefly.');
  else {
    if (c.likedAt !== null) {
      const age = ageWords(c.likedAt, now);
      lines.push(monthsHeld(c.likedAt, now) >= 1 ? `Big because you've had it ${age}.` : "Still growing because you've had it less than a month.");
    }
    lines.push(c.heard >= 0.8 ? 'Vivid because you listened to most of it.' : 'Partly colored because you listened to about half of it.');
  }
  if (c.first) lines.push('Largest because it is your oldest find that you took time to hear.');
  if (c.foundHour !== null && c.likedAt !== null) lines.push(`Out ${atNight(c.foundHour) ? 'at night' : 'during the day'} because you found it at ${clockTime(c.likedAt)}.`);
  else lines.push('Always awake because its discovery time was not recorded.');
  if (c.rare) lines.push('Rare because it sounded far from the songs you had saved before it.');
  if (c.school) lines.push('Swims in a school because you saved more than one song by this artist in this place.');
  return lines;
}

export function portrait(life: OceanLife, now: number): string[] {
  const creatures = Object.values(life.places).flatMap((p) => p.creatures);
  const dated = creatures.filter((c) => c.foundHour !== null);
  const night = dated.filter((c) => atNight(c.foundHour!)).length;
  const lines: string[] = [];
  if (dated.length) lines.push(night > dated.length / 2 ? 'Mostly comes out at night.' : night < dated.length / 2 ? 'Mostly comes out during the day.' : 'Your finds share the day and the night.');
  lines.push(life.total ? `${life.total === 1 ? 'One song has' : `${life.total} songs have`} become creatures in your ocean.` : 'Your first blind save will become a creature here.');
  const waters = WATERS.map((water) => {
    const places = Object.values(life.places).filter((p) => p.place.water === water);
    return { water, heard: places.reduce((sum, p) => sum + p.heard, 0),
      creatures: places.reduce((sum, p) => sum + (p.heard > 0 ? p.creatures.filter((c) => c.heard > 0).length : 0), 0) };
  });
  const occupied = waters.filter((w) => w.heard > 0 && w.creatures > 0).sort((a, b) => b.creatures - a.creatures);
  if (occupied.length) {
    const most = occupied[0];
    const name = WATER_INFO[most.water].name;
    const total = occupied.reduce((sum, w) => sum + w.creatures, 0);
    lines.push(most.creatures > total / 2 && total > 1 ? `Most of your songs live in ${name}.` : `${most.creatures === 1 ? 'One of your songs lives' : `${most.creatures} of your songs live`} in ${name}.`);
  }
  const unvisited = waters.find((w) => w.heard === 0);
  if (unvisited) lines.push(`You have not heard a song from ${WATER_INFO[unvisited.water].name} yet.`);
  const climber = creatures.filter((c) => c.climb > 0).sort((a, b) => b.climb - a.climb)[0];
  if (climber && climber.foundListeners != null && climber.nowListeners != null) lines.push(`Your biggest climber went from ${compactCount(climber.foundListeners)} listeners to ${compactCount(climber.nowListeners)}.`);
  if (life.oldest?.likedAt !== null && life.oldest?.likedAt !== undefined) lines.push(`Your oldest find is ${ageWords(life.oldest.likedAt, now)} old.`);
  return lines;
}

/** Everything you heard and let go in one water sinks to its sea floor, the only sand there is. */
export function floorSand(life: OceanLife | null, water: Water): SandLife {
  const specks = Object.values(life?.places ?? {}).filter((p) => p.place.water === water).flatMap((p) => p.sand.specks).slice(0, SAND_CAP);
  return { rise: specks.length / SAND_CAP, specks };
}

/** Why a creature is reacting to the song playing right now. */
export function reactionLines(c: Creature, song: SoundFeatures | null): string[] {
  if (!song || !c.sound) return [];
  const lines: string[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.04;
  if (near(c.sound.tempo, song.tempo) || near(c.sound.tempo * 2, song.tempo) || near(c.sound.tempo, song.tempo * 2)) lines.push("Dancing because it's the same tempo as what's playing.");
  if (c.sound.key != null && c.sound.key === song.key) lines.push("Glowing because it's in the same key as what's playing.");
  return lines;
}

export function stillBlind(trackId: number, card: { id: number; revealed: boolean } | null): boolean {
  return card !== null && card.id === trackId && !card.revealed;
}
