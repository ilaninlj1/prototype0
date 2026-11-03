// Fictional songs and listening, built afresh for each preview of an example ocean.
import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';
import type { SoundFeatures } from './sound.ts';
import type { OceanInput } from './ocean-person.ts';
import { DEPTHS, type Depth } from './ocean-map.ts';
import { hslToHex, keyHue } from './print-recipe.ts';

const TITLES = [
  'The Lantern Keeps a Secret', 'Paper Moons over Quiet Water', 'A Window Full of Tides', 'The Last Blue Stair',
  'Small Hours in a Glass Boat', 'Where the Rain Keeps Time', 'A Pocket Full of Harbors', 'The Slow Return of Light',
  'Letters to a Sleeping Shore', 'The Sea Beneath the Floor', 'A Map of Unlit Rooms', 'When the Buoys Begin to Sing',
  'Soft Engines under Stars', 'The Orchard at Low Tide', 'A Door Made out of Weather', 'Footsteps in the Radio',
  'Night Trains to the Breakwater', 'A Thread of Copper Rain', 'The House behind the Current', 'Three Lamps Past the Pier',
  'The Quiet Weight of Windows', 'A River through the Ceiling', 'Borrowed Light for Morning', 'The Clock beneath the Sand',
  'A Garden of Distant Signals', 'Noon in the Empty Lighthouse', 'The Hush between Two Ferries', 'Names Written on the Fog',
  'The Sleep of Little Satellites', 'A Warm Stone in Deep Water', 'Twelve Steps into the Weather', 'The Room Where Echoes Wait',
  'A Porch above the Moonrise', 'The Tide Collects Our Letters', 'A Song for Unfinished Bridges', 'The Blue Hour Takes Its Time',
  'Rain inside a Paper Compass', 'The Shore beyond the Static', 'A Small Light Left for You', 'The Morning Carries Us Home',
];
const ARTISTS = ['The Paper Estuary', 'Lantern Arithmetic', 'Quiet Weather Bureau', 'The Copper Windows', 'Harbor after Hours', 'Little Signal Orchard', 'The Unlit Ferries', 'Sleepwalking Almanac'];

export function exampleInput(now: number): OceanInput {
  const liked: DiscoveryTrack[] = [];
  const history: SwipeEntry[] = [];
  const sounds = new Map<number, SoundFeatures>();
  const depths = new Map<number, Depth>();

  for (let i = 0; i < 80; i++) {
    const id = -10_000 - i;
    const date = new Date(now);
    date.setDate(date.getDate() - (270 - Math.floor((i % 40) * 268 / 39)));
    date.setHours(i % 10 === 9 ? 10 : [22, 23, 0, 1, 2][i % 5], (14 + i * 7) % 60, 0, 0);
    const at = date.getTime();
    const water = i % 4;
    const sound: SoundFeatures = {
      tempo: 76 + i * 17 % 80, key: i % 12, mode: water === 3 ? 0 : 1,
      energy: 0.25 + (i % 6) * 0.13, danceability: 0.35 + (i % 5) * 0.12,
      acousticness: water === 1 ? 0.85 : 0.2, instrumentalness: water === 2 ? 0.8 : 0.1,
      speechiness: 0.06, liveness: 0.12, valence: water === 3 ? 0.18 : 0.7, loudness: -14 + i % 9,
    };
    sounds.set(id, sound);
    depths.set(id, DEPTHS[Math.floor(i / 4) % 4]);
    const artist = i % ARTISTS.length;
    const title = i < 40 ? TITLES[i] : `Echo of ${TITLES[i - 40]}`;
    const entry: SwipeEntry = {
      trackId: id, trackName: title, artistId: 20_000 + artist, artistName: ARTISTS[artist], genre: 'Imagined sounds',
      action: i < 40 ? 'like' : i % 2 ? 'skip' : 'reveal', timestamp: at,
      listenMs: i % 11 === 10 ? 3000 : 14_000 + (i % 6) * 2200,
    };
    history.push(entry);
    if (i < 40) liked.push({
      id, trackName: title, artistId: entry.artistId, artistName: ARTISTS[artist],
      artworkUrl100: '', primaryGenreName: entry.genre, previewUrl: '', trackViewUrl: '', collectionName: null,
      likedAt: at, foundBlind: true, artistListeners: 4000 + artist * 3000,
    });
  }
  history.sort((a, b) => a.timestamp - b.timestamp || a.trackId - b.trackId);
  return {
    history, liked, now,
    soundOf: (id) => { const sound = sounds.get(id); return sound ? { ...sound } : null; },
    depthOf: (t) => depths.get('id' in t ? t.id : t.trackId) ?? 'popular',
    colorOf: (id) => {
      const sound = sounds.get(id);
      return sound ? hslToHex(keyHue(sound.key ?? 0, sound.mode), 0.62, 0.64) : '#b8c9cd';
    },
    // A few artists in this made-up history took off, so its graph has climbers.
    listenersNowOf: (artist) => {
      const i = ARTISTS.indexOf(artist);
      return i % 3 === 0 ? (4000 + i * 3000) * (6 + i * 3) : 4000 + i * 3000;
    },
    accentOf: (id) => {
      const sound = sounds.get(id);
      return sound ? hslToHex(keyHue(((sound.key ?? 0) + 5) % 12, sound.mode), 0.7, 0.5) : '#8fa3a8';
    },
  };
}
