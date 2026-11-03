// Who is on stage in a place right now: only your songs, nothing else lives here. The canvas draws it and the tap test
// reads it, so they always agree.

import type { Kind, Place } from './ocean-map.ts';
import { placeKey } from './ocean-map.ts';
import { isAwake, type Creature, type OceanLife } from './ocean-person.ts';
import { soundDistance } from './sound-neighbors.ts';

export type CastMember = {
  key: string;
  look: Kind;
  creature: Creature;
  seed: number;
  /** How quick it is, from the song's tempo. */
  pace: number;
  band: number;
  x: number;
  scale: number;
  awake: boolean;
  /** The one it swims with: the first of its artist's songs here, or the song that sounds most like it; -1 if none. */
  leader: number;
  schoolIndex: number;
  /** It follows a song that sounds alike, not one by the same artist. */
  soundAlike: boolean;
  restI: number;
  restN: number;
  tempo: number;
  songKey: number;
};

export const MAX_ANIMATED = 40;
/** Closer than this in sound and two songs swim together. Songs this near are in the closest tenth of a listener's saves. */
export const SOUND_ALIKE = 0.09;

const unit = (seed: number, salt: number) => {
  const v = Math.sin((seed + salt) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export function castFor(place: Place, life: OceanLife | null, hour: number): { members: CastMember[]; hiddenCount: number } {
  const here = life?.places[placeKey(place)]?.creatures ?? [];
  // buildOcean already sorts each place newest first, with undated finds last.
  const kept = here.slice(0, MAX_ANIMATED);
  const hiddenCount = here.length - kept.length;

  const members: CastMember[] = kept.map((c) => {
    const tempo = c.sound?.tempo ?? 100;
    return {
      key: `song:${c.trackId}`,
      look: c.kind,
      creature: c,
      seed: c.seed,
      pace: Math.max(0.7, Math.min(1.4, tempo / 110)),
      band: unit(c.seed, 6),
      x: unit(c.seed, 7),
      scale: c.size,
      awake: isAwake(c, hour),
      leader: -1,
      schoolIndex: 0,
      soundAlike: false,
      restI: 0,
      restN: 1,
      tempo,
      songKey: c.sound?.key ?? -1,
    };
  });

  // Saves by one artist swim as a school.
  const schools = new Map<string, { leader: number; next: number }>();
  members.forEach((m, i) => {
    const school = m.creature.school;
    if (!school || !m.awake) return;
    const known = schools.get(school);
    if (!known) schools.set(school, { leader: i, next: 1 });
    else {
      m.leader = known.leader;
      m.schoolIndex = known.next++;
    }
  });
  // Songs that sound alike find each other, two by two.
  const taken = new Set<number>();
  members.forEach((m, i) => {
    if (m.leader >= 0 || m.creature.school || !m.awake || !m.creature.sound || taken.has(i)) return;
    let best = -1;
    let bestDistance = SOUND_ALIKE;
    for (let j = i + 1; j < members.length; j++) {
      const o = members[j];
      if (o.leader >= 0 || o.creature.school || !o.awake || !o.creature.sound || taken.has(j)) continue;
      const d = soundDistance(m.creature.sound, o.creature.sound);
      if (d < bestDistance) {
        best = j;
        bestDistance = d;
      }
    }
    if (best >= 0) {
      taken.add(i);
      taken.add(best);
      members[best].leader = i;
      members[best].schoolIndex = 1;
      members[best].soundAlike = true;
    }
  });

  const asleep = members.filter((m) => !m.awake);
  asleep.forEach((m, i) => {
    m.restI = i;
    m.restN = asleep.length;
  });
  return { members, hiddenCount };
}
